import {
  boolean,
  text,
  pgTable,
  pgPolicy,
  timestamp,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import {
  tableBase,
  notNullStringForeignKey,
  nullableStringForeignKey,
  constructIndex,
  enhancedCreateInsertSchema,
  livemodePolicy,
  createUpdateSchema,
  pgEnumColumn,
  timestampWithTimezoneColumn,
  SelectConditions,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { subscriptions } from '@/db/schema/subscriptions'
import { ledgerTransactions } from '@/db/schema/ledgerTransactions'
import { usageEvents } from '@/db/schema/usageEvents'
import { usageCredits } from '@/db/schema/usageCredits'
import { payments } from '@/db/schema/payments'
import { usageCreditApplications } from '@/db/schema/usageCreditApplications'
import { usageCreditBalanceAdjustments } from '@/db/schema/usageCreditBalanceAdjustments'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { usageMeters } from '@/db/schema/usageMeters'
import { createSelectSchema } from 'drizzle-zod'
import core from '@/utils/core'
import {
  LedgerEntryStatus,
  LedgerEntryDirection,
  LedgerEntryType,
} from '@/types'
import { ledgerAccounts } from './ledgerAccounts'

const TABLE_NAME = 'ledger_entries'

export const ledgerEntries = pgTable(
  TABLE_NAME,
  {
    ...tableBase('ledger_entry'),
    ledgerAccountId: notNullStringForeignKey(
      'ledger_account_id',
      ledgerAccounts
    ),
    /**
     * References the usage transaction that caused
     * the ledger item to be created.
     */
    ledgerTransactionId: notNullStringForeignKey(
      'ledger_transaction_id',
      ledgerTransactions
    ),
    subscriptionId: notNullStringForeignKey(
      'subscription_id',
      subscriptions
    ),
    entryTimestamp: timestamp('entry_timestamp', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    status: pgEnumColumn({
      enumName: 'LedgerEntryStatus',
      columnName: 'status',
      enumBase: LedgerEntryStatus,
    }).notNull(),
    direction: pgEnumColumn({
      enumName: 'LedgerEntryDirection',
      columnName: 'direction',
      enumBase: LedgerEntryDirection,
    }).notNull(),
    /**
     * This should be the enum
     */
    entryType: pgEnumColumn({
      enumName: 'LedgerEntryType',
      columnName: 'entry_type',
      enumBase: LedgerEntryType,
    }).notNull(),
    amount: integer('amount').notNull(),
    description: text('description'),
    discardedAt: timestamp('discarded_at', { withTimezone: true }),
    sourceUsageEventId: nullableStringForeignKey(
      'source_usage_event_id',
      usageEvents
    ),
    sourceUsageCreditId: nullableStringForeignKey(
      'source_usage_credit_id',
      usageCredits
    ),
    sourcePaymentId: nullableStringForeignKey(
      'source_payment_id',
      payments
    ),
    sourceCreditApplicationId: nullableStringForeignKey(
      'source_credit_application_id',
      usageCreditApplications
    ),
    sourceCreditBalanceAdjustmentId: nullableStringForeignKey(
      'source_credit_balance_adjustment_id',
      usageCreditBalanceAdjustments
    ),
    sourceBillingPeriodCalculationId: text(
      'source_billing_period_calculation_id'
    ),
    appliedToLedgerItemId: text('applied_to_ledger_item_id'),
    billingPeriodId: nullableStringForeignKey(
      'billing_period_id',
      billingPeriods
    ),
    usageMeterId: nullableStringForeignKey(
      'usage_meter_id',
      usageMeters
    ),
    expiredAt: timestampWithTimezoneColumn('expired_at'),
    /**
     * References the usage transaction that caused the ledger item to expire.
     */
    expiredAtLedgerTransactionId: nullableStringForeignKey(
      'expired_at_ledger_transaction_id',
      ledgerTransactions
    ),
    calculationRunId: text('calculation_run_id'),
    metadata: jsonb('metadata'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
  },
  (table) => [
    constructIndex(TABLE_NAME, [
      table.subscriptionId,
      table.entryTimestamp,
    ]),
    constructIndex(TABLE_NAME, [table.ledgerAccountId]),
    constructIndex(TABLE_NAME, [table.entryType]),
    constructIndex(TABLE_NAME, [table.status, table.discardedAt]),
    constructIndex(TABLE_NAME, [table.ledgerTransactionId]),
    constructIndex(TABLE_NAME, [table.sourceUsageEventId]),
    constructIndex(TABLE_NAME, [table.sourceUsageCreditId]),
    constructIndex(TABLE_NAME, [table.sourcePaymentId]),
    constructIndex(TABLE_NAME, [table.sourceCreditApplicationId]),
    constructIndex(TABLE_NAME, [
      table.sourceCreditBalanceAdjustmentId,
    ]),
    constructIndex(TABLE_NAME, [
      table.sourceBillingPeriodCalculationId,
    ]),
    constructIndex(TABLE_NAME, [table.appliedToLedgerItemId]),
    constructIndex(TABLE_NAME, [table.billingPeriodId]),
    constructIndex(TABLE_NAME, [table.usageMeterId]),
    pgPolicy('Enable read for own organizations', {
      as: 'permissive',
      to: 'authenticated',
      for: 'all',
      using: sql`"organization_id" in (select "organization_id" from "memberships")`,
    }),
    livemodePolicy(),
  ]
).enableRLS()

const columnRefinements = {
  status: core.createSafeZodEnum(LedgerEntryStatus),
  direction: core.createSafeZodEnum(LedgerEntryDirection),
  amount: core.safeZodPositiveIntegerOrZero,
  entryTimestamp: core.safeZodDate,
  discardedAt: core.safeZodDate.nullable(),
  metadata: z.record(z.string(), z.any()).nullable(),
}

const nulledSourceColumnRefinements = {
  sourceUsageEventId: z.null(),
  sourceUsageCreditId: z.null(),
  sourcePaymentId: z.null(),
  sourceCreditApplicationId: z.null(),
  sourceCreditBalanceAdjustmentId: z.null(),
  sourceBillingPeriodCalculationId: z.null(),
}

export const usageCostEntryRefinements = {
  ...nulledSourceColumnRefinements,
  direction: z.literal(LedgerEntryDirection.Debit),
  entryType: z.literal(LedgerEntryType.UsageCost),
  sourceUsageEventId: z.string(),
}

export const paymentRecognizedEntryRefinements = {
  ...nulledSourceColumnRefinements,
  direction: z.literal(LedgerEntryDirection.Credit),
  entryType: z.literal(LedgerEntryType.PaymentRecognized),
  sourcePaymentId: z.string(),
  sourceUsageCreditId: z.string(),
}

export const creditGrantRecognizedEntryRefinements = {
  ...nulledSourceColumnRefinements,
  direction: z.literal(LedgerEntryDirection.Credit),
  entryType: z.literal(LedgerEntryType.CreditGrantRecognized),
  sourceUsageCreditId: z.string(),
}

export const creditAppliedToUsageEntryRefinements = {
  ...nulledSourceColumnRefinements,
  direction: z.literal(LedgerEntryDirection.Credit),
  entryType: z.literal(LedgerEntryType.CreditAppliedToUsage),
  sourceCreditApplicationId: z.string(),
  sourceUsageCreditId: z.string(),
}

export const creditBalanceAdjustedEntryRefinements = {
  ...nulledSourceColumnRefinements,
  entryType: z.literal(LedgerEntryType.CreditBalanceAdjusted),
  sourceCreditBalanceAdjustmentId: z.string(),
  sourceUsageCreditId: z.string(),
}

export const creditGrantExpiredEntryRefinements = {
  ...nulledSourceColumnRefinements,
  direction: z.literal(LedgerEntryDirection.Debit),
  entryType: z.literal(LedgerEntryType.CreditGrantExpired),
  sourceUsageCreditId: z.string(),
}

export const paymentRefundedEntryRefinements = {
  ...nulledSourceColumnRefinements,
  direction: z.literal(LedgerEntryDirection.Debit),
  entryType: z.literal(LedgerEntryType.PaymentRefunded),
  sourcePaymentId: z.string(),
}

export const billingAdjustmentEntryRefinements = {
  ...nulledSourceColumnRefinements,
  entryType: z.literal(LedgerEntryType.BillingAdjustment),
  sourceBillingPeriodCalculationId: z.string(),
}

const coreLedgerEntryInsertSchema = enhancedCreateInsertSchema(
  ledgerEntries,
  columnRefinements
).extend(columnRefinements)

export const usageCostInsertSchema =
  coreLedgerEntryInsertSchema.extend(usageCostEntryRefinements)
export const paymentRecognizedInsertSchema =
  coreLedgerEntryInsertSchema.extend(
    paymentRecognizedEntryRefinements
  )
export const creditGrantRecognizedInsertSchema =
  coreLedgerEntryInsertSchema.extend(
    creditGrantRecognizedEntryRefinements
  )
export const creditAppliedToUsageInsertSchema =
  coreLedgerEntryInsertSchema.extend(
    creditAppliedToUsageEntryRefinements
  )
export const creditBalanceAdjustedInsertSchema =
  coreLedgerEntryInsertSchema.extend(
    creditBalanceAdjustedEntryRefinements
  )
export const creditGrantExpiredInsertSchema =
  coreLedgerEntryInsertSchema.extend(
    creditGrantExpiredEntryRefinements
  )
export const paymentRefundedInsertSchema =
  coreLedgerEntryInsertSchema.extend(paymentRefundedEntryRefinements)
export const billingAdjustmentInsertSchema =
  coreLedgerEntryInsertSchema.extend(
    billingAdjustmentEntryRefinements
  )

export const ledgerEntriesInsertSchema = z.discriminatedUnion(
  'entryType',
  [
    usageCostInsertSchema,
    paymentRecognizedInsertSchema,
    creditGrantRecognizedInsertSchema,
    creditAppliedToUsageInsertSchema,
    creditBalanceAdjustedInsertSchema,
    creditGrantExpiredInsertSchema,
    paymentRefundedInsertSchema,
    billingAdjustmentInsertSchema,
  ]
)

export const coreLedgerEntriesSelectSchema =
  createSelectSchema(ledgerEntries).extend(columnRefinements)

export const usageCostSelectSchema =
  coreLedgerEntriesSelectSchema.extend(usageCostEntryRefinements)
export const paymentRecognizedSelectSchema =
  coreLedgerEntriesSelectSchema.extend(
    paymentRecognizedEntryRefinements
  )
export const creditGrantRecognizedSelectSchema =
  coreLedgerEntriesSelectSchema.extend(
    creditGrantRecognizedEntryRefinements
  )
export const creditAppliedToUsageSelectSchema =
  coreLedgerEntriesSelectSchema.extend(
    creditAppliedToUsageEntryRefinements
  )
export const creditBalanceAdjustedSelectSchema =
  coreLedgerEntriesSelectSchema.extend(
    creditBalanceAdjustedEntryRefinements
  )
export const creditGrantExpiredSelectSchema =
  coreLedgerEntriesSelectSchema.extend(
    creditGrantExpiredEntryRefinements
  )
export const paymentRefundedSelectSchema =
  coreLedgerEntriesSelectSchema.extend(
    paymentRefundedEntryRefinements
  )
export const billingAdjustmentSelectSchema =
  coreLedgerEntriesSelectSchema.extend(
    billingAdjustmentEntryRefinements
  )

export const ledgerEntriesSelectSchema = z.discriminatedUnion(
  'entryType',
  [
    usageCostSelectSchema,
    paymentRecognizedSelectSchema,
    creditGrantRecognizedSelectSchema,
    creditAppliedToUsageSelectSchema,
    creditBalanceAdjustedSelectSchema,
    creditGrantExpiredSelectSchema,
    paymentRefundedSelectSchema,
    billingAdjustmentSelectSchema,
  ]
)

export const coreLedgerEntriesUpdateSchema = createUpdateSchema(
  ledgerEntries,
  columnRefinements
)

export const usageCostUpdateSchema =
  coreLedgerEntriesUpdateSchema.extend(usageCostEntryRefinements)
export const paymentRecognizedUpdateSchema =
  coreLedgerEntriesUpdateSchema.extend(
    paymentRecognizedEntryRefinements
  )
export const creditGrantRecognizedUpdateSchema =
  coreLedgerEntriesUpdateSchema.extend(
    creditGrantRecognizedEntryRefinements
  )
export const creditAppliedToUsageUpdateSchema =
  coreLedgerEntriesUpdateSchema.extend(
    creditAppliedToUsageEntryRefinements
  )
export const creditBalanceAdjustedUpdateSchema =
  coreLedgerEntriesUpdateSchema.extend(
    creditBalanceAdjustedEntryRefinements
  )
export const creditGrantExpiredUpdateSchema =
  coreLedgerEntriesUpdateSchema.extend(
    creditGrantExpiredEntryRefinements
  )
export const paymentRefundedUpdateSchema =
  coreLedgerEntriesUpdateSchema.extend(
    paymentRefundedEntryRefinements
  )
export const billingAdjustmentUpdateSchema =
  coreLedgerEntriesUpdateSchema.extend(
    billingAdjustmentEntryRefinements
  )

export const ledgerEntriesUpdateSchema = z.discriminatedUnion(
  'entryType',
  [
    usageCostUpdateSchema,
    paymentRecognizedUpdateSchema,
    creditGrantRecognizedUpdateSchema,
    creditAppliedToUsageUpdateSchema,
    creditBalanceAdjustedUpdateSchema,
    creditGrantExpiredUpdateSchema,
    paymentRefundedUpdateSchema,
    billingAdjustmentUpdateSchema,
  ]
)

const hiddenColumns = {} as const

// Client-specific individual select schemas
export const usageCostClientSelectSchema =
  usageCostSelectSchema.omit(hiddenColumns)
export const paymentRecognizedClientSelectSchema =
  paymentRecognizedSelectSchema.omit(hiddenColumns)
export const creditGrantRecognizedClientSelectSchema =
  creditGrantRecognizedSelectSchema.omit(hiddenColumns)
export const creditAppliedToUsageClientSelectSchema =
  creditAppliedToUsageSelectSchema.omit(hiddenColumns)
export const creditBalanceAdjustedClientSelectSchema =
  creditBalanceAdjustedSelectSchema.omit(hiddenColumns)
export const creditGrantExpiredClientSelectSchema =
  creditGrantExpiredSelectSchema.omit(hiddenColumns)
export const paymentRefundedClientSelectSchema =
  paymentRefundedSelectSchema.omit(hiddenColumns)
export const billingAdjustmentClientSelectSchema =
  billingAdjustmentSelectSchema.omit(hiddenColumns)

export const ledgerEntriesClientSelectSchema = z.discriminatedUnion(
  'entryType',
  [
    usageCostClientSelectSchema,
    paymentRecognizedClientSelectSchema,
    creditGrantRecognizedClientSelectSchema,
    creditAppliedToUsageClientSelectSchema,
    creditBalanceAdjustedClientSelectSchema,
    creditGrantExpiredClientSelectSchema,
    paymentRefundedClientSelectSchema,
    billingAdjustmentClientSelectSchema,
  ]
)

export namespace LedgerEntry {
  export type Insert = z.infer<typeof ledgerEntriesInsertSchema>
  export type Update = z.infer<typeof ledgerEntriesUpdateSchema>
  export type Record = z.infer<typeof ledgerEntriesSelectSchema>
  export type ClientRecord = z.infer<
    typeof ledgerEntriesClientSelectSchema
  >
  export type Where = SelectConditions<typeof ledgerEntries>

  export type UsageCostInsert = z.infer<typeof usageCostInsertSchema>
  export type PaymentRecognizedInsert = z.infer<
    typeof paymentRecognizedInsertSchema
  >
  export type CreditGrantRecognizedInsert = z.infer<
    typeof creditGrantRecognizedInsertSchema
  >
  export type CreditAppliedToUsageInsert = z.infer<
    typeof creditAppliedToUsageInsertSchema
  >
  export type CreditBalanceAdjustedInsert = z.infer<
    typeof creditBalanceAdjustedInsertSchema
  >
  export type CreditGrantExpiredInsert = z.infer<
    typeof creditGrantExpiredInsertSchema
  >
  export type PaymentRefundedInsert = z.infer<
    typeof paymentRefundedInsertSchema
  >
  export type BillingAdjustmentInsert = z.infer<
    typeof billingAdjustmentInsertSchema
  >
  export type UsageCostRecord = z.infer<typeof usageCostSelectSchema>
  export type PaymentRecognizedRecord = z.infer<
    typeof paymentRecognizedSelectSchema
  >
  export type CreditGrantRecognizedRecord = z.infer<
    typeof creditGrantRecognizedSelectSchema
  >
  export type CreditAppliedToUsageRecord = z.infer<
    typeof creditAppliedToUsageSelectSchema
  >
  export type CreditBalanceAdjustedRecord = z.infer<
    typeof creditBalanceAdjustedSelectSchema
  >
  export type CreditGrantExpiredRecord = z.infer<
    typeof creditGrantExpiredSelectSchema
  >
  export type PaymentRefundedRecord = z.infer<
    typeof paymentRefundedSelectSchema
  >
  export type BillingAdjustmentRecord = z.infer<
    typeof billingAdjustmentSelectSchema
  >
  export type UsageCostUpdate = z.infer<typeof usageCostUpdateSchema>
  export type PaymentRecognizedUpdate = z.infer<
    typeof paymentRecognizedUpdateSchema
  >
  export type CreditGrantRecognizedUpdate = z.infer<
    typeof creditGrantRecognizedUpdateSchema
  >
  export type CreditAppliedToUsageUpdate = z.infer<
    typeof creditAppliedToUsageUpdateSchema
  >
  export type CreditBalanceAdjustedUpdate = z.infer<
    typeof creditBalanceAdjustedUpdateSchema
  >
  export type CreditGrantExpiredUpdate = z.infer<
    typeof creditGrantExpiredUpdateSchema
  >
  export type PaymentRefundedUpdate = z.infer<
    typeof paymentRefundedUpdateSchema
  >
  export type BillingAdjustmentUpdate = z.infer<
    typeof billingAdjustmentUpdateSchema
  >
}
