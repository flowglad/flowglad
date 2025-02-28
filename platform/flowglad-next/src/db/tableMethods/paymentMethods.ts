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
} from '@/db/tableUtils'
import {
  Payment,
  payments,
  paymentsInsertSchema,
  paymentsSelectSchema,
  paymentsTableRowDataSchema,
  paymentsUpdateSchema,
  RevenueDataItem,
} from '@/db/schema/payments'
import { DbTransaction, PaymentStatus } from '@/types'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { invoices } from '../schema/invoices'
import { GetRevenueDataInput } from '../schema/payments'
import { customerProfiles } from '../schema/customerProfiles'
import { getCurrentMonthStartTimestamp } from '@/utils/core'

const config: ORMMethodCreatorConfig<
  typeof payments,
  typeof paymentsSelectSchema,
  typeof paymentsInsertSchema,
  typeof paymentsUpdateSchema
> = {
  selectSchema: paymentsSelectSchema,
  insertSchema: paymentsInsertSchema,
  updateSchema: paymentsUpdateSchema,
}

export const selectPaymentById = createSelectById(payments, config)

export const insertPayment = createInsertFunction(payments, config)

export const updatePayment = createUpdateFunction(payments, config)

export const selectPayments = createSelectFunction(payments, config)

const upsertPayments = createBulkUpsertFunction(payments, config)

export const upsertPaymentByStripeChargeId = (
  payment: Payment.Insert,
  transaction: DbTransaction
) => {
  return upsertPayments(
    [payment],
    [payments.stripeChargeId],
    transaction
  )
}

export const selectSettledPaymentsByInvoiceId = async (
  InvoiceId: string,
  transaction: DbTransaction
) => {
  const result = await transaction
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.InvoiceId, InvoiceId),
        eq(payments.status, PaymentStatus.Succeeded)
      )
    )
  return result.map((row) => paymentsSelectSchema.parse(row))
}

export const selectPaymentsByCustomerProfileId = async (
  CustomerProfileId: string,
  transaction: DbTransaction
) => {
  const result = await transaction
    .select({
      payment: payments,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.InvoiceId, invoices.id))
    .where(eq(invoices.CustomerProfileId, CustomerProfileId))

  return result.map((row) => paymentsSelectSchema.parse(row.payment))
}

export const selectRevenueDataForOrganization = async (
  params: GetRevenueDataInput,
  transaction: DbTransaction
): Promise<RevenueDataItem[]> => {
  const {
    OrganizationId,
    revenueChartIntervalUnit,
    fromDate,
    toDate,
  } = params

  const result = (await transaction.execute(
    sql`
      WITH dates AS (
        SELECT generate_series(
          date_trunc(${revenueChartIntervalUnit}, ${fromDate.toISOString()}::timestamp),
          date_trunc(${revenueChartIntervalUnit}, ${toDate.toISOString()}::timestamp),
          (1 || ' ' || ${revenueChartIntervalUnit})::interval
        ) AS date
      ),
      revenues AS (
        SELECT 
          date_trunc(${revenueChartIntervalUnit}, ${
      payments.chargeDate
    }) as date,
          SUM(${payments.amount} - COALESCE(${
      payments.refundedAmount
    }, 0)) as revenue
        FROM ${payments}
        WHERE 
          ${payments.OrganizationId} = ${OrganizationId}
          AND ${payments.chargeDate} >= ${fromDate.toISOString()}
          AND ${payments.chargeDate} <= ${toDate.toISOString()}
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

export const selectPaymentsTableRowData = async (
  OrganizationId: string,
  transaction: DbTransaction
) => {
  const paymentsRowData = await transaction
    .select({
      payment: payments,
      customerProfile: customerProfiles,
    })
    .from(payments)
    .innerJoin(
      customerProfiles,
      eq(payments.CustomerProfileId, customerProfiles.id)
    )
    .where(eq(payments.OrganizationId, OrganizationId))
    .orderBy(desc(payments.chargeDate))

  return paymentsRowData.map((row) =>
    paymentsTableRowDataSchema.parse(row)
  )
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
  if (paymentUpdate.status !== PaymentStatus.Refunded) {
    errors.push('Only refunds are supported')
  }

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

export const sumNetTotalSettledPaymentsForBillingPeriod = async (
  BillingPeriodId: string,
  transaction: DbTransaction
) => {
  const payments = await selectPayments(
    { BillingPeriodId },
    transaction
  )
  const total = payments.reduce((acc, payment) => {
    if (payment.status === PaymentStatus.Succeeded) {
      return acc + payment.amount
    }
    if (payment.status === PaymentStatus.Refunded) {
      return acc + (payment.amount - (payment.refundedAmount ?? 0))
    }
    return acc
  }, 0)

  return {
    payments,
    total,
  }
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
