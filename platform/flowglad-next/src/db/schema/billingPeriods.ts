import { buildSchemas } from '@db-core/createZodSchemas'
import { BillingPeriodStatus } from '@db-core/enums'
import {
  constructIndex,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  notNullStringForeignKey,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
  timestampWithTimezoneColumn,
} from '@db-core/tableUtils'
import { sql } from 'drizzle-orm'
import { boolean, pgTable } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { subscriptions } from '@/db/schema/subscriptions'
import core from '@/utils/core'
import { pricingModels } from './pricingModels'

const TABLE_NAME = 'billing_periods'

export const billingPeriods = pgTable(
  TABLE_NAME,
  {
    ...tableBase('billing_period'),
    subscriptionId: notNullStringForeignKey(
      'subscription_id',
      subscriptions
    ),
    startDate: timestampWithTimezoneColumn('start_date').notNull(),
    endDate: timestampWithTimezoneColumn('end_date').notNull(),
    status: pgEnumColumn({
      enumName: 'BillingPeriodStatus',
      columnName: 'status',
      enumBase: BillingPeriodStatus,
    }).notNull(),
    trialPeriod: boolean('trial_period').notNull().default(false),
    proratedPeriod: boolean('prorated_period').default(false),
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.subscriptionId]),
    constructIndex(TABLE_NAME, [table.status]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        to: 'all',
        using: sql`"subscription_id" in (select "id" from "subscriptions" where "organization_id"=current_organization_id())`,
      }
    ),
  ])
).enableRLS()

const columnRefinements = {
  status: core.createSafeZodEnum(BillingPeriodStatus),
}

const readOnlyColumns = {
  subscriptionId: true,
  pricingModelId: true,
} as const

const hiddenColumns = {
  ...hiddenColumnsForClientSchema,
} as const

export const {
  select: billingPeriodsSelectSchema,
  insert: billingPeriodsInsertSchema,
  update: billingPeriodsUpdateSchema,
  client: {
    select: billingPeriodsClientSelectSchema,
    insert: billingPeriodsClientInsertSchema,
    update: billingPeriodsClientUpdateSchema,
  },
} = buildSchemas(billingPeriods, {
  refine: columnRefinements,
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns,
    readOnlyColumns,
  },
  entityName: 'BillingPeriod',
})

export namespace BillingPeriod {
  export type Insert = z.infer<typeof billingPeriodsInsertSchema>
  export type Update = z.infer<typeof billingPeriodsUpdateSchema>
  export type Record = z.infer<typeof billingPeriodsSelectSchema>
  export type ClientInsert = z.infer<
    typeof billingPeriodsClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof billingPeriodsClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof billingPeriodsClientSelectSchema
  >
  export type Where = SelectConditions<typeof billingPeriods>
}

export const createBillingPeriodInputSchema = z.object({
  billingPeriod: billingPeriodsClientInsertSchema,
})

export type CreateBillingPeriodInput = z.infer<
  typeof createBillingPeriodInputSchema
>

export const editBillingPeriodInputSchema = z.object({
  billingPeriod: billingPeriodsClientUpdateSchema,
})

export type EditBillingPeriodInput = z.infer<
  typeof editBillingPeriodInputSchema
>
