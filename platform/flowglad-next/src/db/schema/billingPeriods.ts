import * as R from 'ramda'
import { pgTable, timestamp, boolean } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import {
  tableBase,
  notNullStringForeignKey,
  constructIndex,
  ommittedColumnsForInsertSchema,
  pgEnumColumn,
  livemodePolicy,
  SelectConditions,
  hiddenColumnsForClientSchema,
  merchantPolicy,
} from '@/db/tableUtils'
import { subscriptions } from '@/db/schema/subscriptions'
import core from '@/utils/core'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import { BillingPeriodStatus } from '@/types'
import { sql } from 'drizzle-orm'

const TABLE_NAME = 'billing_periods'

export const billingPeriods = pgTable(
  TABLE_NAME,
  {
    ...tableBase('billing_period'),
    subscriptionId: notNullStringForeignKey(
      'subscription_id',
      subscriptions
    ),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    status: pgEnumColumn({
      enumName: 'BillingPeriodStatus',
      columnName: 'status',
      enumBase: BillingPeriodStatus,
    }).notNull(),
    trialPeriod: boolean('trial_period').notNull().default(false),
    proratedPeriod: boolean('prorated_period').default(false),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.subscriptionId]),
      constructIndex(TABLE_NAME, [table.status]),
      merchantPolicy(
        `Enable read for own organizations (${TABLE_NAME})`,
        {
          as: 'permissive',
          to: 'all',
          using: sql`"subscriptionId" in (select "id" from "Subscriptions" where "organization_id" in (select "organization_id" from "memberships"))`,
        }
      ),
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

const columnRefinements = {
  status: core.createSafeZodEnum(BillingPeriodStatus),
}

/*
 * database schemas
 */
export const billingPeriodsInsertSchema = createInsertSchema(
  billingPeriods
)
  .omit(ommittedColumnsForInsertSchema)
  .extend(columnRefinements)

export const billingPeriodsSelectSchema =
  createSelectSchema(billingPeriods).extend(columnRefinements)

export const billingPeriodsUpdateSchema = billingPeriodsInsertSchema
  .partial()
  .extend({ id: z.string() })

const readOnlyColumns = {
  subscriptionId: true,
} as const

const hiddenColumns = {
  ...hiddenColumnsForClientSchema,
} as const

const createOnlyColumns = {} as const

const nonClientEditableColumns = {
  ...hiddenColumns,
  ...readOnlyColumns,
} as const

const clientWriteOmits = R.omit(['position'], {
  ...hiddenColumns,
  ...readOnlyColumns,
})

/*
 * client schemas
 */
export const billingPeriodClientInsertSchema =
  billingPeriodsInsertSchema
    .omit(clientWriteOmits)
    .meta({ id: 'BillingPeriodClientInsertSchema' })

export const billingPeriodClientUpdateSchema =
  billingPeriodsUpdateSchema
    .omit(clientWriteOmits)
    .meta({ id: 'BillingPeriodClientUpdateSchema' })

export const billingPeriodClientSelectSchema =
  billingPeriodsSelectSchema
    .omit(hiddenColumns)
    .meta({ id: 'BillingPeriodClientSelectSchema' })

export namespace BillingPeriod {
  export type Insert = z.infer<typeof billingPeriodsInsertSchema>
  export type Update = z.infer<typeof billingPeriodsUpdateSchema>
  export type Record = z.infer<typeof billingPeriodsSelectSchema>
  export type ClientInsert = z.infer<
    typeof billingPeriodClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof billingPeriodClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof billingPeriodClientSelectSchema
  >
  export type Where = SelectConditions<typeof billingPeriods>
}

export const createBillingPeriodInputSchema = z.object({
  billingPeriod: billingPeriodClientInsertSchema,
})

export type CreateBillingPeriodInput = z.infer<
  typeof createBillingPeriodInputSchema
>

export const editBillingPeriodInputSchema = z.object({
  billingPeriod: billingPeriodClientUpdateSchema,
})

export type EditBillingPeriodInput = z.infer<
  typeof editBillingPeriodInputSchema
>
