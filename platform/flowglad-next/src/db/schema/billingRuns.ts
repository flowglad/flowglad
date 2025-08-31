import * as R from 'ramda'
import {
  pgTable,
  pgPolicy,
  timestamp,
  integer,
  jsonb,
  text,
} from 'drizzle-orm/pg-core'
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
  merchantRole,
} from '@/db/tableUtils'
import { billingPeriods } from '@/db/schema/billingPeriods'
import core from '@/utils/core'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import { BillingRunStatus } from '@/types'
import { sql } from 'drizzle-orm'
import { subscriptions } from './subscriptions'
import { paymentMethods } from './paymentMethods'

const TABLE_NAME = 'billing_runs'

export const billingRuns = pgTable(
  TABLE_NAME,
  {
    ...tableBase('billing_run'),
    billingPeriodId: notNullStringForeignKey(
      'billing_period_id',
      billingPeriods
    ),
    scheduledFor: timestamp('scheduled_for').notNull(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    status: pgEnumColumn({
      enumName: 'BillingRunStatus',
      columnName: 'status',
      enumBase: BillingRunStatus,
    }).notNull(),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    attemptNumber: integer('attempt_number').notNull().default(1),
    errorDetails: jsonb('error_details'),
    subscriptionId: notNullStringForeignKey(
      'subscription_id',
      subscriptions
    ),
    paymentMethodId: notNullStringForeignKey(
      'payment_method_id',
      paymentMethods
    ),
    /**
     * Used to deal with out-of-order event deliveries.
     */
    lastPaymentIntentEventTimestamp: timestamp(
      'last_stripe_payment_intent_event_timestamp'
    ),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.billingPeriodId]),
      constructIndex(TABLE_NAME, [table.status]),
      pgPolicy(`Enable read for own organizations (${TABLE_NAME})`, {
        as: 'permissive',
        to: merchantRole,
        for: 'all',
        using: sql`"billingPeriodId" in (select "id" from "BillingPeriods" where "subscriptionId" in (select "id" from "Subscriptions" where "organization_id" in (select "organization_id" from "memberships")))`,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

const columnRefinements = {
  status: core.createSafeZodEnum(BillingRunStatus),
  errorDetails: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional(),
}

/*
 * database schemas
 */
export const billingRunsInsertSchema = createInsertSchema(billingRuns)
  .omit(ommittedColumnsForInsertSchema)
  .extend(columnRefinements)

export const billingRunsSelectSchema =
  createSelectSchema(billingRuns).extend(columnRefinements)

export const billingRunsUpdateSchema = billingRunsInsertSchema
  .partial()
  .extend({ id: z.string() })

const readOnlyColumns = {
  billingPeriodId: true,
} as const

const hiddenColumns = {
  stripePaymentIntentId: true,
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
export const billingRunClientInsertSchema = billingRunsInsertSchema
  .omit(clientWriteOmits)
  .meta({ id: 'BillingRunClientInsertSchema' })

export const billingRunClientUpdateSchema = billingRunsUpdateSchema
  .omit(clientWriteOmits)
  .meta({ id: 'BillingRunClientUpdateSchema' })

export const billingRunClientSelectSchema = billingRunsSelectSchema
  .omit(hiddenColumns)
  .meta({ id: 'BillingRunClientSelectSchema' })

export namespace BillingRun {
  export type Insert = z.infer<typeof billingRunsInsertSchema>
  export type Update = z.infer<typeof billingRunsUpdateSchema>
  export type Record = z.infer<typeof billingRunsSelectSchema>
  export type ClientInsert = z.infer<
    typeof billingRunClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof billingRunClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof billingRunClientSelectSchema
  >
  export type Where = SelectConditions<typeof billingRuns>
}

export const createBillingRunInputSchema = z.object({
  billingRun: billingRunClientInsertSchema,
})

export type CreateBillingRunInput = z.infer<
  typeof createBillingRunInputSchema
>

export const editBillingRunInputSchema = z.object({
  billingRun: billingRunClientUpdateSchema,
})

export type EditBillingRunInput = z.infer<
  typeof editBillingRunInputSchema
>
