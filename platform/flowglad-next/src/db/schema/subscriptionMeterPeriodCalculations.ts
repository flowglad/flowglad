import { buildSchemas } from '@db-core/createZodSchemas'
import {
  constructIndex,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  orgIdEqualsCurrentSQL,
  pgEnumColumn,
  tableBase,
  timestampWithTimezoneColumn,
} from '@db-core/tableUtils'
import { sql } from 'drizzle-orm'
import {
  foreignKey,
  integer,
  pgPolicy,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { organizations } from '@/db/schema/organizations'
import { pricingModels } from '@/db/schema/pricingModels'
import { subscriptions } from '@/db/schema/subscriptions'
import { usageMeters } from '@/db/schema/usageMeters'
import { SubscriptionMeterPeriodCalculationStatus } from '@/types'
import core from '@/utils/core'
import { billingRuns } from './billingRuns'
import { invoices } from './invoices'

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
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.subscriptionId]),
    constructIndex(TABLE_NAME, [table.usageMeterId]),
    constructIndex(TABLE_NAME, [table.billingPeriodId]),
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.status]),
    constructIndex(TABLE_NAME, [table.billingRunId]),
    constructIndex(TABLE_NAME, [table.supersededByCalculationId]),
    constructIndex(TABLE_NAME, [table.sourceInvoiceId]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
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
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        to: 'all',
        using: orgIdEqualsCurrentSQL(),
      }
    ),
  ])
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
const readOnlyColumns = {
  pricingModelId: true,
} as const

export const {
  select: subscriptionMeterPeriodCalculationSelectSchema,
  insert: subscriptionMeterPeriodCalculationInsertSchema,
  update: subscriptionMeterPeriodCalculationUpdateSchema,
  client: {
    select: subscriptionMeterPeriodCalculationClientSelectSchema,
  },
} = buildSchemas(subscriptionMeterPeriodCalculations, {
  refine: {
    ...columnRefinements,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns: {
      ...hiddenColumnsForClientSchema,
    },
    readOnlyColumns,
  },
  entityName: 'SubscriptionMeterPeriodCalculation',
})

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
