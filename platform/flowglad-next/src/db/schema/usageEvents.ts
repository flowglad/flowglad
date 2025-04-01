import {
  integer,
  pgTable,
  pgPolicy,
  text,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import {
  tableBase,
  notNullStringForeignKey,
  constructIndex,
  enhancedCreateInsertSchema,
  createUpdateSchema,
  livemodePolicy,
  constructUniqueIndex,
} from '@/db/tableUtils'
import { customers } from '@/db/schema/customers'
import { usageMeters } from '@/db/schema/usageMeters'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { createSelectSchema } from 'drizzle-zod'
import { subscriptions } from './subscriptions'
import { prices } from './prices'

const TABLE_NAME = 'usage_events'

const usageEventPriceMustMatchUsageMeter = sql`"price_id" in (select "id" from "prices" where "prices"."usage_meter_id" = "usage_meter_id")`

export const usageEvents = pgTable(
  TABLE_NAME,
  {
    ...tableBase('usage_event'),
    customerId: notNullStringForeignKey('customer_id', customers),
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
    amount: integer('amount').notNull(),
    usageDate: timestamp('usage_date').notNull().defaultNow(),
    transactionId: text('transaction_id'),
    priceId: notNullStringForeignKey('price_id', prices),
    properties: jsonb('properties'),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.customerId]),
      constructIndex(TABLE_NAME, [table.usageMeterId]),
      constructIndex(TABLE_NAME, [table.billingPeriodId]),
      constructIndex(TABLE_NAME, [table.subscriptionId]),
      constructIndex(TABLE_NAME, [table.priceId]),
      constructUniqueIndex(TABLE_NAME, [
        table.transactionId,
        table.usageMeterId,
      ]),
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"customer_id" in (select "id" from "customers" where "organization_id" in (select "organization_id" from "memberships"))`,
      }),
      pgPolicy(
        'On insert, only allow usage events for prices with matching usage meter',
        {
          as: 'permissive',
          to: 'authenticated',
          for: 'insert',
          withCheck: usageEventPriceMustMatchUsageMeter,
        }
      ),
      pgPolicy(
        'On update, only allow usage events for prices with matching usage meter',
        {
          as: 'permissive',
          to: 'authenticated',
          for: 'update',
          using: usageEventPriceMustMatchUsageMeter,
        }
      ),
      livemodePolicy(),
    ]
  }
).enableRLS()

const columnRefinements = {
  amount: z.number().int().positive(),
  usageDate: z
    .date()
    .describe(
      'The date the usage occurred. Currently should always the current date. If the usage occurs in a date that is outside of the current billing period, the usage will still be attached to the current billing peirod.'
    ),
  billingPeriodId: z
    .string()
    .describe(
      'The billing period the usage belongs to. If the usage occurs in a date that is outside of the current billing period, the usage will still be attached to the current billing peirod.'
    ),
  transactionId: z
    .string()
    .describe(
      'A unique identifier for the transaction. This is used to prevent duplicate usage events from being created.'
    ),
  properties: z
    .record(z.string(), z.unknown())
    .describe(
      'Properties for the usage event. Only required when using the "count_distinct_properties" aggregation type.'
    ),
}

export const usageEventsInsertSchema = enhancedCreateInsertSchema(
  usageEvents,
  columnRefinements
)

export const usageEventsSelectSchema =
  createSelectSchema(usageEvents).extend(columnRefinements)

export const usageEventsUpdateSchema = createUpdateSchema(
  usageEvents,
  columnRefinements
)

const readOnlyColumns = {
  livemode: true,
  billingPeriodId: true,
} as const

const createOnlyColumns = {
  customerId: true,
  usageMeterId: true,
  subscriptionId: true,
} as const

export const usageEventsClientSelectSchema =
  usageEventsSelectSchema.omit(readOnlyColumns)

export const usageEventsClientUpdateSchema =
  usageEventsUpdateSchema.omit({
    ...readOnlyColumns,
    ...createOnlyColumns,
  })

export const usageEventsClientInsertSchema =
  usageEventsInsertSchema.omit(readOnlyColumns)

export namespace UsageEvent {
  export type Insert = z.infer<typeof usageEventsInsertSchema>
  export type Update = z.infer<typeof usageEventsUpdateSchema>
  export type Record = z.infer<typeof usageEventsSelectSchema>
  export type ClientInsert = z.infer<
    typeof usageEventsClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof usageEventsClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof usageEventsClientSelectSchema
  >
}

export const createUsageEventSchema = z.object({
  usageEvent: usageEventsClientInsertSchema,
})

export type CreateUsageEventInput = z.infer<
  typeof createUsageEventSchema
>

export const editUsageEventSchema = z.object({
  id: z.string(),
  usageEvent: usageEventsClientUpdateSchema,
})

export type EditUsageEventInput = z.infer<typeof editUsageEventSchema>

export const bulkInsertUsageEventsSchema = z.object({
  usageEvents: z.array(usageEventsClientInsertSchema),
})

export type BulkInsertUsageEventsInput = z.infer<
  typeof bulkInsertUsageEventsSchema
>
