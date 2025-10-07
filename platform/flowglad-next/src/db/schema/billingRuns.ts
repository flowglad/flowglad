import * as R from 'ramda'
import {
  pgTable,
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
  merchantPolicy,
  timestampWithTimezoneColumn,
  clientWriteOmitsConstructor,
} from '@/db/tableUtils'
import { billingPeriods } from '@/db/schema/billingPeriods'
import core from '@/utils/core'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import { BillingRunStatus } from '@/types'
import { sql } from 'drizzle-orm'
import { subscriptions } from './subscriptions'
import { paymentMethods } from './paymentMethods'
import { buildSchemas } from '../createZodSchemas'

const TABLE_NAME = 'billing_runs'

export const billingRuns = pgTable(
  TABLE_NAME,
  {
    ...tableBase('billing_run'),
    billingPeriodId: notNullStringForeignKey(
      'billing_period_id',
      billingPeriods
    ),
    scheduledFor:
      timestampWithTimezoneColumn('scheduled_for').notNull(),
    startedAt: timestampWithTimezoneColumn('started_at'),
    completedAt: timestampWithTimezoneColumn('completed_at'),
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
    lastPaymentIntentEventTimestamp: timestampWithTimezoneColumn(
      'last_stripe_payment_intent_event_timestamp'
    ),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.billingPeriodId]),
      constructIndex(TABLE_NAME, [table.status]),
      merchantPolicy(
        `Enable read for own organizations (${TABLE_NAME})`,
        {
          as: 'permissive',
          to: 'own_organization',
          for: 'all',
          using: sql`"billing_period_id" in (select "id" from "billing_periods" where "subscription_id" in (select "id" from "subscriptions" where "organization_id" in (select "organization_id" from "memberships")))`,
        }
      ),
      livemodePolicy(TABLE_NAME),
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
const readOnlyColumns = {
  billingPeriodId: true,
} as const

const hiddenColumns = {
  stripePaymentIntentId: true,
  ...hiddenColumnsForClientSchema,
} as const

export const {
  select: billingRunsSelectSchema,
  insert: billingRunsInsertSchema,
  update: billingRunsUpdateSchema,
  client: {
    select: billingRunsClientSelectSchema,
    insert: billingRunsClientInsertSchema,
    update: billingRunsClientUpdateSchema,
  },
} = buildSchemas(billingRuns, {
  refine: columnRefinements,
  client: {
    hiddenColumns,
    readOnlyColumns,
  },
  entityName: 'BillingRun',
})

export namespace BillingRun {
  export type Insert = z.infer<typeof billingRunsInsertSchema>
  export type Update = z.infer<typeof billingRunsUpdateSchema>
  export type Record = z.infer<typeof billingRunsSelectSchema>
  export type ClientInsert = z.infer<
    typeof billingRunsClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof billingRunsClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof billingRunsClientSelectSchema
  >
  export type Where = SelectConditions<typeof billingRuns>
}

export const createBillingRunInputSchema = z.object({
  billingRun: billingRunsClientInsertSchema,
})

export type CreateBillingRunInput = z.infer<
  typeof createBillingRunInputSchema
>

export const editBillingRunInputSchema = z.object({
  billingRun: billingRunsClientUpdateSchema,
})

export type EditBillingRunInput = z.infer<
  typeof editBillingRunInputSchema
>
