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
import { invoiceWithLineItemsSchema } from '../schema/invoiceLineItems'

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

const standardBillingPeriodTransitionPayloadSchema = z.object({
  // billingRunId: z
  //   .string()
  //   .describe(
  //     'The billing_run_id for this billing run phase. This is the initiatingSourceId.'
  //   ),
  subscription: subscriptionsSelectSchema,
  previousBillingPeriod: billingPeriodsSelectSchema
    .nullable()
    .describe(
      'The previous billing period for the subscription. If this is the first billing period, e.g. a new subscription, provide null.'
    ),
  newBillingPeriod: billingPeriodsSelectSchema,
  subscriptionFeatureItems:
    usageCreditGrantSubscriptionItemFeatureClientSelectSchema
      .array()
      .describe(
        'The subscription feature items that were active during this billing run for the given subscription.'
      ),
  type: z.literal('standard'),
})

const creditTrialBillingPeriodTransitionPayloadSchema =
  standardBillingPeriodTransitionPayloadSchema
    .extend({
      type: z.literal('credit_trial'),
    })
    .omit({
      previousBillingPeriod: true,
      newBillingPeriod: true,
    })

export type StandardBillingPeriodTransitionPayload = z.infer<
  typeof standardBillingPeriodTransitionPayloadSchema
>

export type CreditTrialBillingPeriodTransitionPayload = z.infer<
  typeof creditTrialBillingPeriodTransitionPayloadSchema
>

const billingPeriodTransitionPayloadSchema = z.discriminatedUnion(
  'type',
  [
    standardBillingPeriodTransitionPayloadSchema,
    creditTrialBillingPeriodTransitionPayloadSchema,
  ]
)
export type BillingPeriodTransitionPayload = z.infer<
  typeof billingPeriodTransitionPayloadSchema
>

export const billingPeriodTransitionLedgerCommandSchema = z.object({
  ...baseLedgerCommandFields,
  type: z.literal(LedgerTransactionType.BillingPeriodTransition),
  payload: billingPeriodTransitionPayloadSchema,
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

export const settleInvoiceUsageCostsLedgerCommandSchema = z.object({
  ...baseLedgerCommandFields,
  type: z.literal(LedgerTransactionType.SettleInvoiceUsageCosts),
  payload: invoiceWithLineItemsSchema,
})

export type SettleInvoiceUsageCostsLedgerCommand = z.infer<
  typeof settleInvoiceUsageCostsLedgerCommandSchema
>

// --- Discriminated Union of all Ledger Commands ---

export const ledgerCommandSchema = z.discriminatedUnion('type', [
  usageEventProcessedLedgerCommandSchema,
  creditGrantRecognizedLedgerCommandSchema,
  billingPeriodTransitionLedgerCommandSchema,
  adminCreditAdjustedLedgerCommandSchema,
  creditGrantExpiredLedgerCommandSchema,
  paymentRefundedLedgerCommandSchema,
  billingRecalculatedLedgerCommandSchema,
  settleInvoiceUsageCostsLedgerCommandSchema,
])

export type LedgerCommand = z.infer<typeof ledgerCommandSchema>

export interface LedgerCommandResult {
  ledgerTransaction: LedgerTransaction.Record
  ledgerEntries: LedgerEntry.Record[]
}

export interface OutstandingUsageCostAggregation {
  ledgerAccountId: string
  usageMeterId: string
  subscriptionId: string
  outstandingBalance: number
}
