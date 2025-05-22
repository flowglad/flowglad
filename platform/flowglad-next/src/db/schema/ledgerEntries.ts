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
import { LedgerEntryStatus, LedgerEntryDirection } from '@/types'
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
    entryType: text('entry_type').notNull(),
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
  amount: core.safeZodPositiveInteger,
  entryTimestamp: core.safeZodDate,
  discardedAt: core.safeZodDate.nullable(),
  metadata: z.record(z.string(), z.any()).nullable(),
}

export const ledgerEntriesInsertSchema = enhancedCreateInsertSchema(
  ledgerEntries,
  columnRefinements
).extend(columnRefinements)

export const ledgerEntriesSelectSchema =
  createSelectSchema(ledgerEntries).extend(columnRefinements)
export const ledgerEntriesUpdateSchema = createUpdateSchema(
  ledgerEntries,
  columnRefinements
)

const hiddenColumns = {} as const

export const ledgerEntriesClientSelectSchema =
  ledgerEntriesSelectSchema.omit(hiddenColumns)

export namespace LedgerEntry {
  export type Insert = z.infer<typeof ledgerEntriesInsertSchema>
  export type Update = z.infer<typeof ledgerEntriesUpdateSchema>
  export type Record = z.infer<typeof ledgerEntriesSelectSchema>
  export type ClientRecord = z.infer<
    typeof ledgerEntriesClientSelectSchema
  >
}
