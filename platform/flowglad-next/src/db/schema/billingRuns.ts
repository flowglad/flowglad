import { buildSchemas } from '@db-core/createZodSchemas'
import { BillingRunStatus } from '@db-core/enums'
import {
  clientWriteOmitsConstructor,
  constructIndex,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  notNullStringForeignKey,
  ommittedColumnsForInsertSchema,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
  timestampWithTimezoneColumn,
} from '@db-core/tableUtils'
import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import * as R from 'ramda'
import { z } from 'zod'
import { billingPeriods } from '@/db/schema/billingPeriods'
import core from '@/utils/core'
import { paymentMethods } from './paymentMethods'
import { pricingModels } from './pricingModels'
import { subscriptions } from './subscriptions'

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
    isAdjustment: boolean('is_adjustment').notNull().default(false),
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.billingPeriodId]),
    constructIndex(TABLE_NAME, [table.status]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        to: 'own_organization',
        for: 'all',
        using: sql`"billing_period_id" in (select "id" from "billing_periods" where "subscription_id" in (select "id" from "subscriptions" where "organization_id"=current_organization_id()))`,
      }
    ),
  ])
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
  pricingModelId: true,
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
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
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
