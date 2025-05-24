import { LedgerTransactionType } from '@/types'
import { z } from 'zod'
import { usageEventsSelectSchema } from '@/db/schema/usageEvents'
import { usageCreditApplicationsSelectSchema } from '@/db/schema/usageCreditApplications'
import { paymentsSelectSchema } from '@/db/schema/payments'
import { usageCreditsSelectSchema } from '@/db/schema/usageCredits'
import { usageCreditBalanceAdjustmentsSelectSchema } from '@/db/schema/usageCreditBalanceAdjustments'
import { refundsSelectSchema } from '@/db/schema/refunds'
import { subscriptionMeterPeriodCalculationSelectSchema } from '@/db/schema/subscriptionMeterPeriodCalculations'

// Base fields for all ledger commands, primarily for the LedgerTransaction record
const baseLedgerCommandFields = {
  organizationId: z
    .string()
    .describe('Organization ID for the LedgerTransaction'),
  livemode: z
    .boolean()
    .describe('Livemode status for the LedgerTransaction'),
  transactionDescription: z
    .string()
    .optional()
    .describe('Optional description for the LedgerTransaction'),
  transactionMetadata: z
    .record(z.any())
    .optional()
    .describe('Optional metadata for the LedgerTransaction'),
  subscriptionId: z
    .string()
    .describe('subscription ID for the LedgerTransaction'),
}

// --- Individual Ledger Command Schemas ---

export const usageEventProcessedLedgerCommandSchema = z.object({
  ...baseLedgerCommandFields,
  type: z.literal(LedgerTransactionType.UsageEventProcessed),
  payload: z.object({
    usageEvent: usageEventsSelectSchema, // Its id is initiatingSourceId
    usageCreditApplications: usageCreditApplicationsSelectSchema
      .array()
      .optional(),
  }),
})
export type UsageEventProcessedLedgerCommand = z.infer<
  typeof usageEventProcessedLedgerCommandSchema
>

export const paymentConfirmedLedgerCommandSchema = z.object({
  ...baseLedgerCommandFields,
  type: z.literal(LedgerTransactionType.PaymentConfirmed),
  payload: z.object({
    payment: paymentsSelectSchema, // Its id is initiatingSourceId
    usageCredit: usageCreditsSelectSchema, // The credit grant created/funded by this payment
  }),
})
export type PaymentConfirmedLedgerCommand = z.infer<
  typeof paymentConfirmedLedgerCommandSchema
>

export const promoCreditGrantedLedgerCommandSchema = z.object({
  ...baseLedgerCommandFields,
  type: z.literal(LedgerTransactionType.PromoCreditGranted),
  payload: z.object({
    usageCredit: usageCreditsSelectSchema, // Its id is initiatingSourceId
  }),
})
export type PromoCreditGrantedLedgerCommand = z.infer<
  typeof promoCreditGrantedLedgerCommandSchema
>

export const billingRunUsageProcessedLedgerCommandSchema = z.object({
  ...baseLedgerCommandFields,
  type: z.literal(LedgerTransactionType.BillingRunUsageProcessed),
  payload: z.object({
    calculationRunId: z
      .string()
      .describe(
        'The calculation_run_id for this billing run phase. This is the initiatingSourceId.'
      ),
    usageEvents: usageEventsSelectSchema.array(),
  }),
})
export type BillingRunUsageProcessedLedgerCommand = z.infer<
  typeof billingRunUsageProcessedLedgerCommandSchema
>

export const billingRunCreditAppliedLedgerCommandSchema = z.object({
  ...baseLedgerCommandFields,
  type: z.literal(LedgerTransactionType.BillingRunCreditApplied),
  payload: z.object({
    calculationRunId: z
      .string()
      .describe(
        'The calculation_run_id for this billing run phase. This is the initiatingSourceId.'
      ),
    usageCredits: usageCreditsSelectSchema.array(),
  }),
})

export type BillingRunCreditAppliedLedgerCommand = z.infer<
  typeof billingRunCreditAppliedLedgerCommandSchema
>

export const adminCreditAdjustedLedgerCommandSchema = z.object({
  ...baseLedgerCommandFields,
  type: z.literal(LedgerTransactionType.AdminCreditAdjusted),
  payload: z.object({
    usageCreditBalanceAdjustment:
      usageCreditBalanceAdjustmentsSelectSchema, // Its id is initiatingSourceId
  }),
})
export type AdminCreditAdjustedLedgerCommand = z.infer<
  typeof adminCreditAdjustedLedgerCommandSchema
>

export const creditGrantExpiredLedgerCommandSchema = z.object({
  ...baseLedgerCommandFields,
  type: z.literal(LedgerTransactionType.CreditGrantExpired),
  payload: z.object({
    expiredUsageCredit: usageCreditsSelectSchema, // Its id is initiatingSourceId
    expiredAmountValue: z
      .number()
      .int()
      .positive()
      .describe(
        'Positive value of the unused, expired portion of the credit. Will be recorded as a negative debit in the ledger.'
      ),
  }),
})
export type CreditGrantExpiredLedgerCommand = z.infer<
  typeof creditGrantExpiredLedgerCommandSchema
>

enum PaymentRefundedLedgerCommandAdjustmentBehavior {
  RevertAllCredits = 'revert_all_credits',
  RevertUnusedCredits = 'revert_unused_credits',
  PreserveCredits = 'preserve_credits',
}

export const paymentRefundedLedgerCommandSchema = z.object({
  ...baseLedgerCommandFields,
  type: z.literal(LedgerTransactionType.PaymentRefunded),
  payload: z.object({
    refund: refundsSelectSchema, // Its id is initiatingSourceId
    adjustmentBehavior: z.nativeEnum(
      PaymentRefundedLedgerCommandAdjustmentBehavior
    ),
  }),
})

export type PaymentRefundedLedgerCommand = z.infer<
  typeof paymentRefundedLedgerCommandSchema
>

export const billingRecalculatedLedgerCommandSchema = z.object({
  ...baseLedgerCommandFields,
  type: z.literal(LedgerTransactionType.BillingRecalculated),
  payload: z.object({
    newCalculation: subscriptionMeterPeriodCalculationSelectSchema, // Its calculationRunId is initiatingSourceId
    oldCalculation: subscriptionMeterPeriodCalculationSelectSchema,
  }),
})
export type BillingRecalculatedLedgerCommand = z.infer<
  typeof billingRecalculatedLedgerCommandSchema
>

// --- Discriminated Union of all Ledger Commands ---

export const LedgerCommandSchema = z.discriminatedUnion('type', [
  usageEventProcessedLedgerCommandSchema,
  paymentConfirmedLedgerCommandSchema,
  promoCreditGrantedLedgerCommandSchema,
  billingRunUsageProcessedLedgerCommandSchema,
  billingRunCreditAppliedLedgerCommandSchema,
  adminCreditAdjustedLedgerCommandSchema,
  creditGrantExpiredLedgerCommandSchema,
  paymentRefundedLedgerCommandSchema,
  billingRecalculatedLedgerCommandSchema,
])

export type LedgerCommand = z.infer<typeof LedgerCommandSchema>
