import {
  pgTable,
  pgPolicy,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import {
  tableBase,
  notNullStringForeignKey,
  constructIndex,
  enhancedCreateInsertSchema,
  createUpdateSchema,
  pgEnumColumn,
  livemodePolicy,
} from '@/db/tableUtils'
import { subscriptions } from '@/db/schema/subscriptions'
import core from '@/utils/core'
import { createSelectSchema } from 'drizzle-zod'
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
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.subscriptionId]),
      constructIndex(TABLE_NAME, [table.status]),
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"subscriptionId" in (select "id" from "Subscriptions" where "organization_id" in (select "organization_id" from "memberships"))`,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

const columnRefinements = {
  status: core.createSafeZodEnum(BillingPeriodStatus),
}

/*
 * database schemas
 */
export const billingPeriodsInsertSchema = enhancedCreateInsertSchema(
  billingPeriods,
  columnRefinements
)

export const billingPeriodsSelectSchema =
  createSelectSchema(billingPeriods).extend(columnRefinements)

export const billingPeriodsUpdateSchema = createUpdateSchema(
  billingPeriods,
  columnRefinements
)

const readOnlyColumns = {
  subscriptionId: true,
} as const

const hiddenColumns = {} as const

const createOnlyColumns = {} as const

const nonClientEditableColumns = {
  ...hiddenColumns,
  ...readOnlyColumns,
} as const

/*
 * client schemas
 */
export const billingPeriodClientInsertSchema =
  billingPeriodsInsertSchema.omit(nonClientEditableColumns)

export const billingPeriodClientUpdateSchema =
  billingPeriodsUpdateSchema.omit({
    ...nonClientEditableColumns,
    ...createOnlyColumns,
  })

export const billingPeriodClientSelectSchema =
  billingPeriodsSelectSchema.omit(hiddenColumns)

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
