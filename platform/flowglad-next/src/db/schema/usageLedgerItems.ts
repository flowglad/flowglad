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
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { subscriptions } from '@/db/schema/subscriptions'
import { usageTransactions } from '@/db/schema/usageTransactions'
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
  UsageLedgerItemStatus,
  UsageLedgerItemDirection,
  UsageLedgerItemEntryType,
} from '@/types'

const TABLE_NAME = 'usage_ledger_items'

export const usageLedgerItems = pgTable(
  TABLE_NAME,
  {
    ...tableBase('uli'),
    usageTransactionId: notNullStringForeignKey(
      'usage_transaction_id',
      usageTransactions
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
      enumName: 'UsageLedgerItemStatus',
      columnName: 'status',
      enumBase: UsageLedgerItemStatus,
    }).notNull(),
    direction: pgEnumColumn({
      enumName: 'UsageLedgerItemDirection',
      columnName: 'direction',
      enumBase: UsageLedgerItemDirection,
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
    constructIndex(TABLE_NAME, [table.entryType]),
    constructIndex(TABLE_NAME, [table.status, table.discardedAt]),
    constructIndex(TABLE_NAME, [table.usageTransactionId]),
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
  status: core.createSafeZodEnum(UsageLedgerItemStatus),
  direction: core.createSafeZodEnum(UsageLedgerItemDirection),
  amount: core.safeZodPositiveInteger,
  entryTimestamp: core.safeZodDate,
  discardedAt: core.safeZodDate.nullable(),
  metadata: z.record(z.string(), z.any()).nullable(),
}

export const usageLedgerItemsInsertSchema =
  enhancedCreateInsertSchema(usageLedgerItems, columnRefinements)
export const usageLedgerItemsSelectSchema =
  createSelectSchema(usageLedgerItems).extend(columnRefinements)
export const usageLedgerItemsUpdateSchema = createUpdateSchema(
  usageLedgerItems,
  columnRefinements
)

const hiddenColumns = {} as const

export const usageLedgerItemClientSelectSchema =
  usageLedgerItemsSelectSchema.omit(hiddenColumns)

export namespace UsageLedgerItem {
  export type Insert = z.infer<typeof usageLedgerItemsInsertSchema>
  export type Update = z.infer<typeof usageLedgerItemsUpdateSchema>
  export type Record = z.infer<typeof usageLedgerItemsSelectSchema>
  export type ClientRecord = z.infer<
    typeof usageLedgerItemClientSelectSchema
  >
}
