import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createUpsertFunction,
  ORMMethodCreatorConfig,
  createSelectFunction,
  createBulkUpsertFunction,
  createPaginatedSelectFunction,
  SelectConditions,
  whereClauseFromObject,
  createCursorPaginatedSelectFunction,
} from '@/db/tableUtils'
import {
  Payment,
  payments,
  paymentsInsertSchema,
  paymentsSelectSchema,
  paymentsTableRowDataSchema,
  paymentsUpdateSchema,
  RevenueDataItem,
  paymentsPaginatedTableRowDataSchema,
} from '@/db/schema/payments'
import { PaymentStatus } from '@/types'
import { DbTransaction } from '@/db/types'
import { and, desc, eq, gte, inArray, sql, count, lte } from 'drizzle-orm'
import { invoices } from '../schema/invoices'
import { GetRevenueDataInput } from '../schema/payments'
import { customers } from '../schema/customers'
import { getCurrentMonthStartTimestamp } from '@/utils/core'
import {
  PaymentMethod,
  paymentMethods,
  paymentMethodsSelectSchema,
} from '../schema/paymentMethods'
import { selectCustomers } from './customerMethods'
import { prices } from '../schema/prices'
import { purchases } from '../schema/purchases'

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

export const insertPayment = createInsertFunction(payments, config)

export const updatePayment = createUpdateFunction(payments, config)

export const selectPayments = createSelectFunction(payments, config)

const upsertPayments = createBulkUpsertFunction(payments, config)

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
          date_trunc(${revenueChartIntervalUnit}, (${fromDate.toISOString()}::timestamp AT TIME ZONE 'UTC')),
          date_trunc(${revenueChartIntervalUnit}, (${toDate.toISOString()}::timestamp AT TIME ZONE 'UTC')),
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
          AND ${payments.chargeDate} >= ${fromDate.toISOString()}
          AND ${payments.chargeDate} <= ${toDate.toISOString()}
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

  // Edge case: Only allow full refunds
  if (paymentUpdate.refundedAmount !== paymentRecord.amount) {
    errors.push(
      'Refunded amount must be the same as the original amount'
    )
  }

  // Edge case: Only allow refund status
  if (paymentUpdate.status !== PaymentStatus.Refunded) {
    errors.push('Only refund status is supported')
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
  staleThresholdDate: Date,
  transaction: DbTransaction
): Promise<Payment.Record[]> => {
  const stalePaymentStatuses = [
    PaymentStatus.Processing,
    PaymentStatus.RequiresConfirmation,
    PaymentStatus.RequiresAction,
  ]
  
  return await transaction
    .select()
    .from(payments)
    .where(
      and(
        inArray(payments.status, stalePaymentStatuses),
        lte(payments.updatedAt, staleThresholdDate)
      )
    )
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
          getCurrentMonthStartTimestamp(new Date())
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
    }
  )
