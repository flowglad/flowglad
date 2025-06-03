import { LedgerTransactionType } from '@/types'
import { z } from 'zod'
import { usageEventsSelectSchema } from '@/db/schema/usageEvents'
import { usageCreditApplicationsSelectSchema } from '@/db/schema/usageCreditApplications'
import { paymentsSelectSchema } from '@/db/schema/payments'
import { usageCreditsSelectSchema } from '@/db/schema/usageCredits'
import { usageCreditBalanceAdjustmentsSelectSchema } from '@/db/schema/usageCreditBalanceAdjustments'
import { refundsSelectSchema } from '@/db/schema/refunds'
import { subscriptionMeterPeriodCalculationSelectSchema } from '@/db/schema/subscriptionMeterPeriodCalculations'
import { usageCreditGrantSubscriptionItemFeatureClientSelectSchema } from '@/db/schema/subscriptionItemFeatures'
import { subscriptionsSelectSchema } from '@/db/schema/subscriptions'
import { billingPeriodsSelectSchema } from '@/db/schema/billingPeriods'
import { LedgerEntry } from '@/db/schema/ledgerEntries'
import { LedgerTransaction } from '@/db/schema/ledgerTransactions'

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

export const creditGrantRecognizedLedgerCommandSchema = z.object({
  ...baseLedgerCommandFields,
  type: z.literal(LedgerTransactionType.CreditGrantRecognized),
  payload: z.object({
    usageCredit: usageCreditsSelectSchema, // Its id is initiatingSourceId
  }),
})
export type CreditGrantRecognizedLedgerCommand = z.infer<
  typeof creditGrantRecognizedLedgerCommandSchema
>

export const billingPeriodTransitionLedgerCommandSchema = z.object({
  ...baseLedgerCommandFields,
  type: z.literal(LedgerTransactionType.BillingPeriodTransition),
  payload: z.object({
    billingRunId: z
      .string()
      .describe(
        'The billing_run_id for this billing run phase. This is the initiatingSourceId.'
      ),
    subscription: subscriptionsSelectSchema,
    previousBillingPeriod: billingPeriodsSelectSchema,
    newBillingPeriod: billingPeriodsSelectSchema,
    payment: paymentsSelectSchema.optional(),
    subscriptionFeatureItems:
      usageCreditGrantSubscriptionItemFeatureClientSelectSchema
        .array()
        .describe(
          'The subscription feature items that were active during this billing run for the given subscription.'
        ),
  }),
})

export type BillingPeriodTransitionLedgerCommand = z.infer<
  typeof billingPeriodTransitionLedgerCommandSchema
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
  creditGrantRecognizedLedgerCommandSchema,
  billingPeriodTransitionLedgerCommandSchema,
  adminCreditAdjustedLedgerCommandSchema,
  creditGrantExpiredLedgerCommandSchema,
  paymentRefundedLedgerCommandSchema,
  billingRecalculatedLedgerCommandSchema,
])

export type LedgerCommand = z.infer<typeof LedgerCommandSchema>

export interface LedgerCommandResult {
  ledgerTransaction: LedgerTransaction.Record
  ledgerEntries: LedgerEntry.Record[]
}
