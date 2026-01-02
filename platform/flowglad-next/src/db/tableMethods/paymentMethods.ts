import {
  and,
  count,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from 'drizzle-orm'
import {
  type Payment,
  payments,
  paymentsInsertSchema,
  paymentsPaginatedTableRowDataSchema,
  paymentsSelectSchema,
  paymentsUpdateSchema,
  type RevenueDataItem,
} from '@/db/schema/payments'
import {
  createBulkUpsertFunction,
  createCursorPaginatedSelectFunction,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
  type SelectConditions,
  whereClauseFromObject,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import { PaymentStatus } from '@/types'
import { getCurrentMonthStartTimestamp } from '@/utils/core'
import { customers } from '../schema/customers'
import {
  type PaymentMethod,
  paymentMethods,
  paymentMethodsSelectSchema,
} from '../schema/paymentMethods'
import type { GetRevenueDataInput } from '../schema/payments'
import { prices } from '../schema/prices'
import { purchases } from '../schema/purchases'
import { selectCustomers } from './customerMethods'
import { selectInvoiceById } from './invoiceMethods'
import { derivePricingModelIdFromPurchase } from './purchaseMethods'
import { derivePricingModelIdFromSubscription } from './subscriptionMethods'

const config: ORMMethodCreatorConfig<
  typeof payments,
  typeof paymentsSelectSchema,
  typeof paymentsInsertSchema,
  typeof paymentsUpdateSchema
> = {
  selectSchema: paymentsSelectSchema,
  insertSchema: paymentsInsertSchema,
  updateSchema: paymentsUpdateSchema,
  tableName: 'payments',
}

export const selectPaymentById = createSelectById(payments, config)

/**
 * Derives pricingModelId for a payment with COALESCE logic.
 * Priority: subscription > purchase > invoice
 * Used for payment inserts.
 */
export const derivePricingModelIdForPayment = async (
  data: {
    subscriptionId?: string | null
    purchaseId?: string | null
    invoiceId: string
  },
  transaction: DbTransaction
): Promise<string> => {
  // Try subscription first
  if (data.subscriptionId) {
    return await derivePricingModelIdFromSubscription(
      data.subscriptionId,
      transaction
    )
  }

  // Try purchase second
  if (data.purchaseId) {
    return await derivePricingModelIdFromPurchase(
      data.purchaseId,
      transaction
    )
  }

  // Fall back to invoice (invoiceId is always present)
  const invoiceRecord = await selectInvoiceById(
    data.invoiceId,
    transaction
  )
  return invoiceRecord.pricingModelId
}

const baseInsertPayment = createInsertFunction(payments, config)

export const insertPayment = async (
  paymentInsert: Payment.Insert,
  transaction: DbTransaction
): Promise<Payment.Record> => {
  const pricingModelId =
    paymentInsert.pricingModelId ??
    (await derivePricingModelIdForPayment(
      {
        subscriptionId: paymentInsert.subscriptionId,
        purchaseId: paymentInsert.purchaseId,
        invoiceId: paymentInsert.invoiceId,
      },
      transaction
    ))
  return baseInsertPayment(
    {
      ...paymentInsert,
      pricingModelId,
    },
    transaction
  )
}

export const updatePayment = createUpdateFunction(payments, config)

export const selectPayments = createSelectFunction(payments, config)

const baseUpsertPayments = createBulkUpsertFunction(payments, config)

const upsertPayments = async (
  inserts: Payment.Insert[],
  target: Parameters<typeof baseUpsertPayments>[1],
  transaction: DbTransaction
): Promise<Payment.Record[]> => {
  // Collect unique combinations that need pricingModelId derivation
  const insertsNeedingDerivation = inserts.filter(
    (insert) => !insert.pricingModelId
  )

  // Create a map key for each unique combination
  const createMapKey = (
    subscriptionId: string | null | undefined,
    purchaseId: string | null | undefined,
    invoiceId: string
  ) => `${subscriptionId || ''}|${purchaseId || ''}|${invoiceId}`

  // Collect unique combinations
  const uniqueCombinations = Array.from(
    new Set(
      insertsNeedingDerivation.map((insert) =>
        createMapKey(
          insert.subscriptionId,
          insert.purchaseId,
          insert.invoiceId
        )
      )
    )
  ).map((key) => {
    const [subscriptionId, purchaseId, invoiceId] = key.split('|')
    return {
      subscriptionId: subscriptionId || undefined,
      purchaseId: purchaseId || undefined,
      invoiceId: invoiceId,
    }
  })

  // Batch derive pricingModelIds for unique combinations
  const pricingModelIdResults = await Promise.all(
    uniqueCombinations.map(async (combo) => ({
      key: createMapKey(
        combo.subscriptionId,
        combo.purchaseId,
        combo.invoiceId
      ),
      pricingModelId: await derivePricingModelIdForPayment(
        combo,
        transaction
      ),
    }))
  )

  // Build map for O(1) lookup
  const pricingModelIdMap = new Map(
    pricingModelIdResults.map((r) => [r.key, r.pricingModelId])
  )

  // Derive pricingModelId for each insert using the map
  const insertsWithPricingModelId = inserts.map((insert) => {
    if (insert.pricingModelId) {
      return insert
    }

    const key = createMapKey(
      insert.subscriptionId,
      insert.purchaseId,
      insert.invoiceId
    )
    const pricingModelId = pricingModelIdMap.get(key)

    if (!pricingModelId) {
      throw new Error(
        `Could not derive pricingModelId for payment with invoiceId: ${insert.invoiceId}, subscriptionId: ${insert.subscriptionId}, purchaseId: ${insert.purchaseId}`
      )
    }

    return {
      ...insert,
      pricingModelId,
    }
  })

  return baseUpsertPayments(
    insertsWithPricingModelId,
    target,
    transaction
  )
}

export const upsertPaymentByStripeChargeId = async (
  payment: Payment.Insert,
  transaction: DbTransaction
) => {
  const [existingPayment] = await selectPayments(
    {
      stripeChargeId: payment.stripeChargeId,
    },
    transaction
  )
  if (existingPayment) {
    return existingPayment
  }
  const upsertedPayments = await upsertPayments(
    [payment],
    [payments.stripeChargeId],
    transaction
  )
  return upsertedPayments[0]
}

export const selectRevenueDataForOrganization = async (
  params: GetRevenueDataInput,
  transaction: DbTransaction
): Promise<RevenueDataItem[]> => {
  const {
    organizationId,
    revenueChartIntervalUnit,
    fromDate,
    toDate,
  } = params

  const result = (await transaction.execute(
    sql`
      WITH dates AS (
        SELECT generate_series(
          date_trunc(${revenueChartIntervalUnit}, (${new Date(fromDate).toISOString()}::timestamp AT TIME ZONE 'UTC')),
          date_trunc(${revenueChartIntervalUnit}, (${new Date(toDate).toISOString()}::timestamp AT TIME ZONE 'UTC')),
          (1 || ' ' || ${revenueChartIntervalUnit})::interval
        ) AS date
      ),
      revenues AS (
        SELECT 
          date_trunc(${revenueChartIntervalUnit}, (${payments.chargeDate} AT TIME ZONE 'UTC')) as date,
          SUM(${payments.amount} - COALESCE(${payments.refundedAmount}, 0)) as revenue
        FROM ${payments}
        ${
          params.productId
            ? sql`INNER JOIN ${purchases} ON ${payments.purchaseId} = ${purchases.id} INNER JOIN ${prices} ON ${purchases.priceId} = ${prices.id}`
            : sql``
        }
        WHERE 
          ${payments.organizationId} = ${organizationId}
          AND ${payments.chargeDate} >= ${new Date(fromDate).toISOString()}
          AND ${payments.chargeDate} <= ${new Date(toDate).toISOString()}
          ${
            params.productId
              ? sql`AND ${prices.productId} = ${params.productId}`
              : sql``
          }
        GROUP BY 1
      )
      SELECT
        dates.date,
        COALESCE(revenues.revenue, 0) as revenue
      FROM dates
      LEFT JOIN revenues ON dates.date = revenues.date
      ORDER BY dates.date
    `
  )) as { date: string; revenue: string }[]

  return result.map((row) => ({
    date: new Date(row.date),
    revenue: parseInt(row.revenue),
  }))
}

const allowedPaymentUpdateFields = [
  'status',
  'refundedAmount',
  'refundedAt',
  'refunded',
]

const validatePaymentUpdate = (
  paymentUpdate: Payment.Update,
  paymentRecord: Payment.Record
):
  | { errors: string[]; success: false }
  | { success: true; errors: null } => {
  const errors: string[] = []

  const immutableEntries = Object.entries(paymentUpdate).filter(
    ([key]) => {
      return !allowedPaymentUpdateFields.includes(key)
    }
  )
  // Check each property for mismatches
  for (const [key, value] of immutableEntries) {
    if (
      key in paymentRecord &&
      value !== paymentRecord[key as keyof Payment.Record]
    ) {
      errors.push(
        `${key} cannot be changed from ${
          paymentRecord[key as keyof Payment.Record]
        } to ${value}`
      )
    }
  }

  // Edge case: Refund amount cannot exceed original payment amount
  if (
    paymentUpdate.refundedAmount !== undefined &&
    paymentUpdate.refundedAmount !== null &&
    paymentUpdate.refundedAmount > paymentRecord.amount
  ) {
    errors.push(
      'Refunded amount cannot exceed the original payment amount'
    )
  }

  // Edge case: For partial refunds, status should remain Succeeded; for full refunds, status should be Refunded
  if (
    paymentUpdate.status !== PaymentStatus.Refunded &&
    paymentUpdate.status !== PaymentStatus.Succeeded
  ) {
    errors.push('Only refund or succeeded status is supported')
  }

  return errors.length > 0
    ? { errors, success: false }
    : { success: true, errors: null }
}

/**
 *
 * @param paymentUpdate
 * @param transaction
 * @returns
 */
export const safelyUpdatePaymentForRefund = async (
  paymentUpdate: Payment.Update,
  transaction: DbTransaction
) => {
  const payment = await selectPaymentById(
    paymentUpdate.id,
    transaction
  )
  if (!payment) {
    throw new Error(`Payment ${paymentUpdate.id} not found`)
  }
  /**
   * Only allow updates to succeeded or refunded payments
   * can be updated to refunded.
   * If they're already refunded, this is probably a no-op.
   *
   * NOTE: we may need to think about this.
   */
  if (
    payment.status !== PaymentStatus.Succeeded &&
    payment.status !== PaymentStatus.Refunded
  ) {
    throw new Error(
      `Payment ${paymentUpdate.id} is not in a state to be updated. Its status: ${payment.status})`
    )
  }
  const validation = validatePaymentUpdate(paymentUpdate, payment)
  if (validation.success === false) {
    throw new Error(
      `Failed to update payment ${
        paymentUpdate.id
      }: ${validation.errors.join(', ')}`
    )
  }
  const updatedPayment = await updatePayment(
    paymentUpdate,
    transaction
  )
  return updatedPayment
}

/**
 * Payment statuses for payments which have been fully processed,
 * and the funds have left the customer's account.
 */
const resolvedPaymentStatuses = [
  PaymentStatus.Succeeded,
  PaymentStatus.Refunded,
]

/**
 * Payment statuses for payments which are in a terminal state.
 * Includes payments in which the funds have left the customer's account,
 * as well as the payments which have failed or been terminated.
 */
const terminalPaymentStatuses = [
  ...resolvedPaymentStatuses,
  PaymentStatus.Canceled,
  PaymentStatus.Failed,
]

export const isPaymentInTerminalState = (payment: Payment.Record) => {
  return terminalPaymentStatuses.includes(payment.status)
}

export const safelyUpdatePaymentStatus = async (
  payment: Payment.Record,
  status: PaymentStatus,
  transaction: DbTransaction
) => {
  // If already in the target status, return existing payment (idempotent)
  if (payment.status === status) {
    return payment
  }
  if (isPaymentInTerminalState(payment)) {
    throw new Error(
      `Payment ${payment.id} is in a terminal state: ${payment.status}; cannot update to ${status}`
    )
  }
  return updatePayment(
    {
      id: payment.id,
      status,
    },
    transaction
  )
}

export const selectStalePayments = async (
  staleThresholdDate: Date | number,
  transaction: DbTransaction
): Promise<Payment.Record[]> => {
  const stalePaymentStatuses = [
    PaymentStatus.Processing,
    PaymentStatus.RequiresConfirmation,
    PaymentStatus.RequiresAction,
  ]

  const result = await transaction
    .select()
    .from(payments)
    .where(
      and(
        inArray(payments.status, stalePaymentStatuses),
        lte(
          payments.updatedAt,
          new Date(staleThresholdDate).getTime()
        )
      )
    )
  return paymentsSelectSchema.array().parse(result)
}

export const selectPaymentsPaginated = createPaginatedSelectFunction(
  payments,
  config
)

export const selectResolvedPaymentsMonthToDate = async (
  selectConditions: SelectConditions<typeof payments>,
  transaction: DbTransaction
) => {
  const monthToDateResolvedPayments = await transaction
    .select()
    .from(payments)
    .where(
      and(
        whereClauseFromObject(payments, selectConditions),
        gte(
          payments.chargeDate,
          getCurrentMonthStartTimestamp(new Date()).getTime()
        ),
        inArray(payments.status, resolvedPaymentStatuses)
      )
    )
  return monthToDateResolvedPayments.map((row) =>
    paymentsSelectSchema.parse(row)
  )
}

export interface PaymentAndPaymentMethod {
  payment: Payment.Record
  paymentMethod: PaymentMethod.Record | null
}

export const selectPaymentsAndPaymentMethodsByPaymentsWhere = async (
  selectConditions: SelectConditions<typeof payments>,
  transaction: DbTransaction
): Promise<PaymentAndPaymentMethod[]> => {
  const result = await transaction
    .select({
      payment: payments,
      paymentMethod: paymentMethods,
    })
    .from(payments)
    .leftJoin(
      paymentMethods,
      eq(payments.paymentMethodId, paymentMethods.id)
    )
    .where(whereClauseFromObject(payments, selectConditions))

  return result.map((row) => ({
    payment: paymentsSelectSchema.parse(row.payment),
    paymentMethod: row.paymentMethod
      ? paymentMethodsSelectSchema.parse(row.paymentMethod)
      : null,
  }))
}

export const selectPaymentCountsByStatus = async (
  transaction: DbTransaction
) => {
  const result = await transaction
    .select({
      status: payments.status,
      count: count(),
    })
    .from(payments)
    .groupBy(payments.status)

  return result.map((item) => ({
    status: item.status as PaymentStatus,
    count: item.count,
  }))
}

export const selectPaymentsCursorPaginatedWithTableRowData =
  createCursorPaginatedSelectFunction(
    payments,
    config,
    paymentsPaginatedTableRowDataSchema,
    async (paymentsResult, transaction) => {
      const customerIds = paymentsResult.map(
        (item) => item.customerId
      )
      const customers = await selectCustomers(
        { id: customerIds },
        transaction
      )
      const customersById = new Map(
        customers.map((customer) => [customer.id, customer])
      )

      return paymentsResult.map((payment) => ({
        payment,
        customer: customersById.get(payment.customerId)!,
      }))
    },
    // searchableColumns: undefined (no direct column search)
    undefined,
    /**
     * Additional search clause handler for payments table.
     * Enables searching payments by:
     * - Exact payment ID match
     * - Customer name (case-insensitive partial match via ILIKE)
     *
     * @param searchQuery - The search query string from the user
     * @param transaction - Database transaction for building subqueries
     * @returns SQL condition for OR-ing with other search filters, or undefined if query is empty
     */
    ({ searchQuery, transaction }) => {
      // Early return if search query is not provided
      if (!searchQuery) return undefined

      // Normalize the search query by trimming whitespace
      const trimmedQuery =
        typeof searchQuery === 'string'
          ? searchQuery.trim()
          : searchQuery

      // Only apply search filter if query is non-empty after trimming
      if (!trimmedQuery) return undefined

      // IMPORTANT: Do NOT await this query. By not awaiting, we keep it as a query builder
      // object that Drizzle can embed into the SQL as a subquery. If we await it, it would
      // execute immediately and return data, which we can't use in the EXISTS clause.
      const customerSubquery = transaction
        .select({ id: sql`1` })
        .from(customers)
        .where(
          and(
            eq(customers.id, payments.customerId),
            ilike(customers.name, sql`'%' || ${trimmedQuery} || '%'`)
          )
        )
        // LIMIT 1 is included for clarity - EXISTS automatically stops after finding the first matching row.
        .limit(1)

      return or(
        // Match payments by exact ID
        eq(payments.id, trimmedQuery),
        // Match payments where customer name contains the search query
        exists(customerSubquery)
      )
    }
  )

export const selectLifetimeUsageForPayments = async (
  selectConditions: SelectConditions<typeof payments>,
  transaction: DbTransaction
) => {
  const monthToDateResolvedPayments = await transaction
    .select()
    .from(payments)
    .where(
      and(
        whereClauseFromObject(payments, selectConditions),
        inArray(payments.status, resolvedPaymentStatuses)
      )
    )
  return paymentsSelectSchema
    .array()
    .parse(monthToDateResolvedPayments)
}
