import {
  text,
  pgTable,
  pgPolicy,
  integer,
  foreignKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import {
  tableBase,
  notNullStringForeignKey,
  constructIndex,
  livemodePolicy,
  pgEnumColumn,
  nullableStringForeignKey,
  timestampWithTimezoneColumn,
  ommittedColumnsForInsertSchema,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { subscriptions } from '@/db/schema/subscriptions'
import { usageMeters } from '@/db/schema/usageMeters'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import { SubscriptionMeterPeriodCalculationStatus } from '@/types'
import core from '@/utils/core'
import { invoices } from './invoices'
import { billingRuns } from './billingRuns'

const TABLE_NAME = 'subscription_meter_period_calculations'

export const subscriptionMeterPeriodCalculations = pgTable(
  TABLE_NAME,
  {
    ...tableBase('smpc'),
    /**
     * References the id of the billing run that produced this calculation
     */
    billingRunId: notNullStringForeignKey(
      'billing_run_id',
      billingRuns
    ),
    subscriptionId: notNullStringForeignKey(
      'subscription_id',
      subscriptions
    ),
    usageMeterId: notNullStringForeignKey(
      'usage_meter_id',
      usageMeters
    ),
    billingPeriodId: notNullStringForeignKey(
      'billing_period_id',
      billingPeriods
    ),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    // livemode is in tableBase
    calculatedAt: timestampWithTimezoneColumn('calculated_at')
      .notNull()
      .defaultNow(),
    totalRawUsageAmount: integer('total_raw_usage_amount').notNull(),
    creditsAppliedAmount: integer('credits_applied_amount').notNull(),
    netBilledAmount: integer('net_billed_amount').notNull(),
    status: pgEnumColumn({
      enumName: 'SubscriptionMeterPeriodCalculationStatus',
      columnName: 'status',
      enumBase: SubscriptionMeterPeriodCalculationStatus,
    })
      .notNull()
      .default(SubscriptionMeterPeriodCalculationStatus.Active),
    supersededByCalculationId: text('superseded_by_calculation_id'),
    sourceInvoiceId: nullableStringForeignKey(
      'source_invoice_id',
      invoices
    ),
    // sourceCreditNoteId: nullableStringForeignKey(
    //   'source_credit_note_id',
    //   creditNotes
    // ),
    notes: text('notes'),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.subscriptionId]),
      constructIndex(TABLE_NAME, [table.usageMeterId]),
      constructIndex(TABLE_NAME, [table.billingPeriodId]),
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.status]),
      constructIndex(TABLE_NAME, [table.billingRunId]),
      constructIndex(TABLE_NAME, [table.supersededByCalculationId]),
      constructIndex(TABLE_NAME, [table.sourceInvoiceId]),
      //   constructIndex(TABLE_NAME, [table.sourceCreditNoteId]),
      foreignKey({
        columns: [table.supersededByCalculationId],
        foreignColumns: [table.id],
        name: `${TABLE_NAME}_superseded_by_id_fk`,
      }),
      uniqueIndex(`${TABLE_NAME}_active_calculation_uq`)
        .on(
          table.subscriptionId,
          table.usageMeterId,
          table.billingPeriodId,
          table.status
        )
        .where(
          sql`${table.status} = ${SubscriptionMeterPeriodCalculationStatus.Active}`
        ),
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

// Zod Schemas
const columnRefinements = {
  status: core.createSafeZodEnum(
    SubscriptionMeterPeriodCalculationStatus
  ),
}

/*
 * Database Schemas
 */
export const subscriptionMeterPeriodCalculationInsertSchema =
  createInsertSchema(subscriptionMeterPeriodCalculations).omit(ommittedColumnsForInsertSchema).extend(columnRefinements)

export const subscriptionMeterPeriodCalculationSelectSchema =
  createSelectSchema(subscriptionMeterPeriodCalculations).extend(
    columnRefinements
  )

export const subscriptionMeterPeriodCalculationUpdateSchema =
  subscriptionMeterPeriodCalculationInsertSchema.partial().extend({ id: z.string() })

// Simplified omit logic for client schemas
const baseHiddenClientKeys = {
  createdByCommit: true,
  updatedByCommit: true,
} as const

const serverGeneratedKeys = {
  id: true,
  createdAt: true,
  updatedAt: true,
  calculatedAt: true, // Defaulted by DB
} as const

/*
 * Client Schemas
 */
export const subscriptionMeterPeriodCalculationClientSelectSchema =
  subscriptionMeterPeriodCalculationSelectSchema.omit(
    baseHiddenClientKeys
  ).meta({ id: 'SubscriptionMeterPeriodCalculationClientSelectSchema' })

export namespace SubscriptionMeterPeriodCalculation {
  export type Insert = z.infer<
    typeof subscriptionMeterPeriodCalculationInsertSchema
  >
  export type Update = z.infer<
    typeof subscriptionMeterPeriodCalculationUpdateSchema
  >
  export type Record = z.infer<
    typeof subscriptionMeterPeriodCalculationSelectSchema
  >
  export type ClientRecord = z.infer<
    typeof subscriptionMeterPeriodCalculationClientSelectSchema
  >
}
