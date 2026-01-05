import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { ledgerTransactions } from '@/db/schema/ledgerTransactions'
import { organizations } from '@/db/schema/organizations'
import { payments } from '@/db/schema/payments'
import { subscriptions } from '@/db/schema/subscriptions'
import { usageCreditApplications } from '@/db/schema/usageCreditApplications'
import { usageCreditBalanceAdjustments } from '@/db/schema/usageCreditBalanceAdjustments'
import { usageCredits } from '@/db/schema/usageCredits'
import { usageEvents } from '@/db/schema/usageEvents'
import { usageMeters } from '@/db/schema/usageMeters'
import {
  constructIndex,
  livemodePolicy,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  orgIdEqualsCurrentSQL,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
  timestampWithTimezoneColumn,
} from '@/db/tableUtils'
import {
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
} from '@/types'
import core from '@/utils/core'
import { billingRuns } from './billingRuns'
import { ledgerAccounts } from './ledgerAccounts'
import { pricingModels } from './pricingModels'
import { refunds } from './refunds'

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
    entryTimestamp: timestampWithTimezoneColumn('entry_timestamp')
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
    discardedAt: timestampWithTimezoneColumn('discarded_at'),
    sourceUsageEventId: nullableStringForeignKey(
      'source_usage_event_id',
      usageEvents
    ),
    sourceUsageCreditId: nullableStringForeignKey(
      'source_usage_credit_id',
      usageCredits
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
    sourceRefundId: nullableStringForeignKey(
      'source_refund_id',
      refunds
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
    claimedByBillingRunId: nullableStringForeignKey(
      'claimed_by_billing_run_id',
      billingRuns
    ),
    metadata: jsonb('metadata'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
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
    constructIndex(TABLE_NAME, [table.sourceCreditApplicationId]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    constructIndex(TABLE_NAME, [
      table.sourceCreditBalanceAdjustmentId,
    ]),
    constructIndex(TABLE_NAME, [
      table.sourceBillingPeriodCalculationId,
    ]),
    constructIndex(TABLE_NAME, [table.appliedToLedgerItemId]),
    constructIndex(TABLE_NAME, [table.billingPeriodId]),
    constructIndex(TABLE_NAME, [table.usageMeterId]),
    constructIndex(TABLE_NAME, [table.claimedByBillingRunId]),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        to: 'merchant',
        for: 'all',
        using: orgIdEqualsCurrentSQL(),
      }
    ),
    livemodePolicy(TABLE_NAME),
  ]
).enableRLS()

const columnRefinements = {
  status: core.createSafeZodEnum(LedgerEntryStatus),
  direction: core.createSafeZodEnum(LedgerEntryDirection),
  amount: core.safeZodPositiveIntegerOrZero,
  metadata: z.record(z.string(), z.any()).nullable().optional(),
}

const nulledSourceColumnRefinements = {
  sourceUsageEventId: z.null(),
  sourceUsageCreditId: z.null(),
  sourceCreditApplicationId: z.null(),
  sourceCreditBalanceAdjustmentId: z.null(),
  sourceBillingPeriodCalculationId: z.null(),
}

export const ledgerEntryNulledSourceIdColumns = {
  sourceUsageEventId: null,
  sourceUsageCreditId: null,
  sourceCreditApplicationId: null,
  sourceCreditBalanceAdjustmentId: null,
  sourceBillingPeriodCalculationId: null,
}

export const usageCostEntryRefinements = {
  ...nulledSourceColumnRefinements,
  direction: z.literal(LedgerEntryDirection.Debit),
  entryType: z.literal(LedgerEntryType.UsageCost),
  sourceUsageEventId: z.string(),
}

export const creditGrantRecognizedEntryRefinements = {
  ...nulledSourceColumnRefinements,
  direction: z.literal(LedgerEntryDirection.Credit),
  entryType: z.literal(LedgerEntryType.CreditGrantRecognized),
  sourceUsageCreditId: z.string(),
  claimedByBillingRunId: z.null(),
  usageMeterId: z.string(),
}

export const creditBalanceAdjustedEntryRefinements = {
  ...nulledSourceColumnRefinements,
  entryType: z.literal(LedgerEntryType.CreditBalanceAdjusted),
  sourceCreditBalanceAdjustmentId: z.string(),
  sourceUsageCreditId: z.string(),
  claimedByBillingRunId: z.null(),
}

export const creditGrantExpiredEntryRefinements = {
  ...nulledSourceColumnRefinements,
  direction: z.literal(LedgerEntryDirection.Debit),
  entryType: z.literal(LedgerEntryType.CreditGrantExpired),
  sourceUsageCreditId: z.string(),
  claimedByBillingRunId: z.null(),
}

export const paymentRefundedEntryRefinements = {
  ...nulledSourceColumnRefinements,
  direction: z.literal(LedgerEntryDirection.Debit),
  entryType: z.literal(LedgerEntryType.PaymentRefunded),
  sourceRefundId: z.string(),
  claimedByBillingRunId: z.null(),
}

export const billingAdjustmentEntryRefinements = {
  ...nulledSourceColumnRefinements,
  entryType: z.literal(LedgerEntryType.BillingAdjustment),
  sourceBillingPeriodCalculationId: z.string(),
  claimedByBillingRunId: z.null(),
}

export const usageCreditApplicationDebitFromCreditBalanceEntryRefinements =
  {
    ...nulledSourceColumnRefinements,
    direction: z.literal(LedgerEntryDirection.Debit),
    entryType: z.literal(
      LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance
    ),
    sourceCreditApplicationId: z.string(),
    sourceUsageEventId: z.string(),
    sourceUsageCreditId: z.string(),
  }

export const usageCreditApplicationCreditTowardsUsageCostEntryRefinements =
  {
    ...nulledSourceColumnRefinements,
    direction: z.literal(LedgerEntryDirection.Credit),
    entryType: z.literal(
      LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
    ),
    sourceCreditApplicationId: z.string(),
    sourceUsageCreditId: z.string(),
    sourceUsageEventId: z.string(),
  }

// Build per-subtype schemas using builder

export const {
  insert: usageCostInsertSchema,
  select: usageCostSelectSchema,
  update: usageCostUpdateSchema,
  client: { select: usageCostClientSelectSchemaBase },
} = buildSchemas(ledgerEntries, {
  discriminator: 'entryType',
  refine: { ...columnRefinements, ...usageCostEntryRefinements },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  entityName: 'UsageCostLedgerEntry',
})

export const {
  insert: creditGrantRecognizedInsertSchema,
  select: creditGrantRecognizedSelectSchema,
  update: creditGrantRecognizedUpdateSchema,
  client: { select: creditGrantRecognizedClientSelectSchemaBase },
} = buildSchemas(ledgerEntries, {
  discriminator: 'entryType',
  refine: {
    ...columnRefinements,
    ...creditGrantRecognizedEntryRefinements,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  entityName: 'CreditGrantRecognizedLedgerEntry',
})

export const {
  insert: creditBalanceAdjustedInsertSchema,
  select: creditBalanceAdjustedSelectSchema,
  update: creditBalanceAdjustedUpdateSchema,
  client: { select: creditBalanceAdjustedClientSelectSchemaBase },
} = buildSchemas(ledgerEntries, {
  discriminator: 'entryType',
  refine: {
    ...columnRefinements,
    ...creditBalanceAdjustedEntryRefinements,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  entityName: 'CreditBalanceAdjustedLedgerEntry',
})

export const {
  insert: creditGrantExpiredInsertSchema,
  select: creditGrantExpiredSelectSchema,
  update: creditGrantExpiredUpdateSchema,
  client: { select: creditGrantExpiredClientSelectSchemaBase },
} = buildSchemas(ledgerEntries, {
  discriminator: 'entryType',
  refine: {
    ...columnRefinements,
    ...creditGrantExpiredEntryRefinements,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  entityName: 'CreditGrantExpiredLedgerEntry',
})

export const {
  insert: paymentRefundedInsertSchema,
  select: paymentRefundedSelectSchema,
  update: paymentRefundedUpdateSchema,
  client: { select: paymentRefundedClientSelectSchemaBase },
} = buildSchemas(ledgerEntries, {
  discriminator: 'entryType',
  refine: {
    ...columnRefinements,
    ...paymentRefundedEntryRefinements,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  entityName: 'PaymentRefundedLedgerEntry',
})

export const {
  insert: billingAdjustmentInsertSchema,
  select: billingAdjustmentSelectSchema,
  update: billingAdjustmentUpdateSchema,
  client: { select: billingAdjustmentClientSelectSchemaBase },
} = buildSchemas(ledgerEntries, {
  discriminator: 'entryType',
  refine: {
    ...columnRefinements,
    ...billingAdjustmentEntryRefinements,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  entityName: 'BillingAdjustmentLedgerEntry',
})

export const {
  insert: usageCreditApplicationDebitFromCreditBalanceInsertSchema,
  select: usageCreditApplicationDebitFromCreditBalanceSelectSchema,
  update: usageCreditApplicationDebitFromCreditBalanceUpdateSchema,
  client: {
    select:
      usageCreditApplicationDebitFromCreditBalanceClientSelectSchemaBase,
  },
} = buildSchemas(ledgerEntries, {
  discriminator: 'entryType',
  refine: {
    ...columnRefinements,
    ...usageCreditApplicationDebitFromCreditBalanceEntryRefinements,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  entityName: 'UsageCreditApplicationDebitLedgerEntry',
})

export const {
  insert: usageCreditApplicationCreditTowardsUsageCostInsertSchema,
  select: usageCreditApplicationCreditTowardsUsageCostSelectSchema,
  update: usageCreditApplicationCreditTowardsUsageCostUpdateSchema,
  client: {
    select:
      usageCreditApplicationCreditTowardsUsageCostClientSelectSchemaBase,
  },
} = buildSchemas(ledgerEntries, {
  discriminator: 'entryType',
  refine: {
    ...columnRefinements,
    ...usageCreditApplicationCreditTowardsUsageCostEntryRefinements,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  entityName: 'UsageCreditApplicationCreditLedgerEntry',
})

export const ledgerEntriesInsertSchema = z.discriminatedUnion(
  'entryType',
  [
    usageCostInsertSchema,
    creditGrantRecognizedInsertSchema,
    creditBalanceAdjustedInsertSchema,
    creditGrantExpiredInsertSchema,
    paymentRefundedInsertSchema,
    billingAdjustmentInsertSchema,
    usageCreditApplicationDebitFromCreditBalanceInsertSchema,
    usageCreditApplicationCreditTowardsUsageCostInsertSchema,
  ]
)

export const ledgerEntriesSelectSchema = z.discriminatedUnion(
  'entryType',
  [
    usageCostSelectSchema,
    creditGrantRecognizedSelectSchema,
    creditBalanceAdjustedSelectSchema,
    creditGrantExpiredSelectSchema,
    paymentRefundedSelectSchema,
    billingAdjustmentSelectSchema,
    usageCreditApplicationDebitFromCreditBalanceSelectSchema,
    usageCreditApplicationCreditTowardsUsageCostSelectSchema,
  ]
)

export const ledgerEntriesUpdateSchema = z.discriminatedUnion(
  'entryType',
  [
    usageCostUpdateSchema,
    creditGrantRecognizedUpdateSchema,
    creditBalanceAdjustedUpdateSchema,
    creditGrantExpiredUpdateSchema,
    paymentRefundedUpdateSchema,
    billingAdjustmentUpdateSchema,
    usageCreditApplicationDebitFromCreditBalanceUpdateSchema,
    usageCreditApplicationCreditTowardsUsageCostUpdateSchema,
  ]
)

// Client-specific individual select schemas (meta applied)
export const usageCostClientSelectSchema =
  usageCostClientSelectSchemaBase.meta({ id: 'UsageCostRecord' })
export const creditGrantRecognizedClientSelectSchema =
  creditGrantRecognizedClientSelectSchemaBase.meta({
    id: 'CreditGrantRecognizedRecord',
  })
export const creditBalanceAdjustedClientSelectSchema =
  creditBalanceAdjustedClientSelectSchemaBase.meta({
    id: 'CreditBalanceAdjustedRecord',
  })
export const creditGrantExpiredClientSelectSchema =
  creditGrantExpiredClientSelectSchemaBase.meta({
    id: 'CreditGrantExpiredRecord',
  })
export const paymentRefundedClientSelectSchema =
  paymentRefundedClientSelectSchemaBase.meta({
    id: 'PaymentRefundedRecord',
  })
export const billingAdjustmentClientSelectSchema =
  billingAdjustmentClientSelectSchemaBase.meta({
    id: 'BillingAdjustmentRecord',
  })

export const usageCreditApplicationDebitFromCreditBalanceClientSelectSchema =
  usageCreditApplicationDebitFromCreditBalanceClientSelectSchemaBase.meta(
    {
      id: 'UsageCreditApplicationDebitFromCreditBalanceRecord',
    }
  )
export const usageCreditApplicationCreditTowardsUsageCostClientSelectSchema =
  usageCreditApplicationCreditTowardsUsageCostClientSelectSchemaBase.meta(
    {
      id: 'UsageCreditApplicationCreditTowardsUsageCostRecord',
    }
  )

export const ledgerEntriesClientSelectSchema = z
  .discriminatedUnion('entryType', [
    usageCostClientSelectSchema,
    creditGrantRecognizedClientSelectSchema,
    creditBalanceAdjustedClientSelectSchema,
    creditGrantExpiredClientSelectSchema,
    paymentRefundedClientSelectSchema,
    billingAdjustmentClientSelectSchema,
    usageCreditApplicationDebitFromCreditBalanceClientSelectSchema,
    usageCreditApplicationCreditTowardsUsageCostClientSelectSchema,
  ])
  .meta({ id: 'LedgerEntriesClientSelectSchema' })

export namespace LedgerEntry {
  export type Insert = z.infer<typeof ledgerEntriesInsertSchema>
  export type Update = z.infer<typeof ledgerEntriesUpdateSchema>
  export type Record = z.infer<typeof ledgerEntriesSelectSchema>
  export type ClientRecord = z.infer<
    typeof ledgerEntriesClientSelectSchema
  >
  export type Where = SelectConditions<typeof ledgerEntries>

  export type UsageCostInsert = z.infer<typeof usageCostInsertSchema>
  export type CreditGrantRecognizedInsert = z.infer<
    typeof creditGrantRecognizedInsertSchema
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
  export type UsageCreditApplicationDebitFromCreditBalanceInsert =
    z.infer<
      typeof usageCreditApplicationDebitFromCreditBalanceInsertSchema
    >
  export type UsageCreditApplicationCreditTowardsUsageCostInsert =
    z.infer<
      typeof usageCreditApplicationCreditTowardsUsageCostInsertSchema
    >
  export type UsageCostRecord = z.infer<typeof usageCostSelectSchema>
  export type CreditGrantRecognizedRecord = z.infer<
    typeof creditGrantRecognizedSelectSchema
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
  export type UsageCreditApplicationDebitFromCreditBalanceRecord =
    z.infer<
      typeof usageCreditApplicationDebitFromCreditBalanceSelectSchema
    >
  export type UsageCreditApplicationCreditTowardsUsageCostRecord =
    z.infer<
      typeof usageCreditApplicationCreditTowardsUsageCostSelectSchema
    >
  export type UsageCostUpdate = z.infer<typeof usageCostUpdateSchema>
  export type CreditGrantRecognizedUpdate = z.infer<
    typeof creditGrantRecognizedUpdateSchema
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
  export type UsageCreditApplicationDebitFromCreditBalanceUpdate =
    z.infer<
      typeof usageCreditApplicationDebitFromCreditBalanceUpdateSchema
    >
  export type UsageCreditApplicationCreditTowardsUsageCostUpdate =
    z.infer<
      typeof usageCreditApplicationCreditTowardsUsageCostUpdateSchema
    >
}
