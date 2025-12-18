import { sql } from 'drizzle-orm'
import { integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { customers } from '@/db/schema/customers'
import { usageMeters } from '@/db/schema/usageMeters'
import {
  constructIndex,
  constructUniqueIndex,
  createPaginatedSelectSchema,
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  enableCustomerReadPolicy,
  livemodePolicy,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  type SelectConditions,
  tableBase,
  timestampWithTimezoneColumn,
} from '@/db/tableUtils'
import { buildSchemas } from '../createZodSchemas'
import { zodEpochMs } from '../timestampMs'
import { customerClientSelectSchema } from './customers'
import { prices, pricesClientSelectSchema } from './prices'
import {
  subscriptionClientSelectSchema,
  subscriptions,
} from './subscriptions'
import { usageMetersClientSelectSchema } from './usageMeters'

const TABLE_NAME = 'usage_events'

const usageEventPriceMustMatchUsageMeter = sql`"price_id" IS NULL OR "price_id" in (select "id" from "prices" where "prices"."usage_meter_id" = "usage_meter_id")`

const usageEventSubscriptionMustMatchCustomer = sql`"subscription_id" in (select "id" from "subscriptions" where "subscriptions"."customer_id" = "customer_id")`

const usageEventBillingPeriodMustMatchSubscription = sql`"billing_period_id" in (select "id" from "billing_periods" where "billing_periods"."subscription_id" = "subscription_id")`
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
    billingPeriodId: nullableStringForeignKey(
      'billing_period_id',
      billingPeriods
    ),
    amount: integer('amount').notNull(),
    usageDate: timestampWithTimezoneColumn('usage_date')
      .notNull()
      .defaultNow(),
    transactionId: text('transaction_id').notNull(),
    priceId: nullableStringForeignKey('price_id', prices),
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
      merchantPolicy(
        `Enable read for own organizations (${TABLE_NAME})`,
        {
          as: 'permissive',
          to: 'permissive',
          for: 'all',
          using: sql`"customer_id" in (select "id" from "customers" where "organization_id" in (select "organization_id" from "memberships"))`,
        }
      ),
      merchantPolicy(
        'On insert, only allow usage events for prices with matching usage meter',
        {
          as: 'permissive',
          to: 'permissive',
          for: 'insert',
          withCheck: usageEventPriceMustMatchUsageMeter,
        }
      ),
      merchantPolicy(
        'On update, only allow usage events for prices with matching usage meter',
        {
          as: 'permissive',
          to: 'permissive',
          for: 'update',
          using: usageEventPriceMustMatchUsageMeter,
        }
      ),
      merchantPolicy(
        'On insert, only allow usage events for subscriptions with matching customer',
        {
          as: 'permissive',
          to: 'permissive',
          for: 'insert',
          withCheck: usageEventSubscriptionMustMatchCustomer,
        }
      ),
      merchantPolicy(
        'On update, only allow usage events for subscriptions with matching customer',
        {
          as: 'permissive',
          to: 'permissive',
          for: 'update',
          withCheck: usageEventSubscriptionMustMatchCustomer,
        }
      ),
      merchantPolicy(
        'On insert, only allow usage events for billing periods with matching subscription',
        {
          as: 'permissive',
          to: 'permissive',
          for: 'insert',
          withCheck: usageEventBillingPeriodMustMatchSubscription,
        }
      ),
      merchantPolicy(
        'On update, only allow usage events for billing periods with matching subscription',
        {
          as: 'permissive',
          to: 'permissive',
          for: 'update',
          withCheck: usageEventBillingPeriodMustMatchSubscription,
        }
      ),
      enableCustomerReadPolicy(
        `Enable read for customers (${TABLE_NAME})`,
        {
          using: sql`"customer_id" in (select "id" from "customers")`,
        }
      ),
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

const columnRefinements = {
  amount: z.number().int().positive(),
  usageDate: zodEpochMs.describe(
    'The date the usage occurred. If the usage occurs in a date that is outside of the current billing period, the usage will still be attached to the current billing period. Epoch milliseconds.'
  ),
  billingPeriodId: z
    .string()
    .nullable()
    .optional()
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
    .nullish()
    .describe(
      'Properties for the usage event. Only required when using the "count_distinct_properties" aggregation type.'
    ),
}

const readOnlyColumns = {
  livemode: true,
  billingPeriodId: true,
  usageMeterId: true,
  customerId: true,
} as const

const createOnlyColumns = {
  usageMeterId: true,
  subscriptionId: true,
  transactionId: true,
} as const

export const {
  select: usageEventsSelectSchema,
  insert: usageEventsInsertSchema,
  update: usageEventsUpdateSchema,
  client: {
    select: usageEventsClientSelectSchema,
    insert: usageEventsClientInsertSchema,
    update: usageEventsClientUpdateSchema,
  },
} = buildSchemas(usageEvents, {
  refine: columnRefinements,
  insertRefine: {
    usageDate: columnRefinements.usageDate.optional(),
  },
  client: {
    readOnlyColumns,
    createOnlyColumns,
  },
  entityName: 'UsageEvent',
})

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
  export type Where = SelectConditions<typeof usageEvents>
  export type UsageEventTableRowData = z.infer<
    typeof usageEventsTableRowDataSchema
  >
}

export const createUsageEventSchema = z.object({
  usageEvent: usageEventsClientInsertSchema,
})

export type CreateUsageEventInput = z.infer<
  typeof createUsageEventSchema
>

export const USAGE_EVENT_PRICE_ID_DESCRIPTION =
  'The internal ID of the price. If not provided, priceSlug is required.'
export const USAGE_EVENT_PRICE_SLUG_DESCRIPTION =
  'The slug of the price. If not provided, priceId is required.'

// Schema for individual usage event that allows either priceId or priceSlug
const usageEventWithSlugSchema = usageEventsClientInsertSchema
  .omit({ priceId: true })
  .extend({
    priceId: z
      .string()
      .optional()
      .describe(USAGE_EVENT_PRICE_ID_DESCRIPTION),
    priceSlug: z
      .string()
      .optional()
      .describe(USAGE_EVENT_PRICE_SLUG_DESCRIPTION),
  })
  .refine(
    (data) => (data.priceId ? !data.priceSlug : !!data.priceSlug),
    {
      message:
        'Either priceId or priceSlug must be provided, but not both',
      path: ['priceId'],
    }
  )

export const bulkInsertUsageEventsSchema = z.object({
  usageEvents: z.array(usageEventWithSlugSchema),
})

export type BulkInsertUsageEventsInput = z.infer<
  typeof bulkInsertUsageEventsSchema
>

// Pagination schemas
export const usageEventPaginatedSelectSchema =
  createPaginatedSelectSchema(
    z.object({
      customerId: z.string().optional(),
      usageMeterId: z.string().optional(),
      subscriptionId: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    })
  )

export const usageEventPaginatedListSchema = z.object({
  items: z.array(usageEventsClientSelectSchema),
  total: z.number(),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
})

// Table row data schema for enriched usage events with joins
export const usageEventsTableRowDataSchema = z.object({
  usageEvent: usageEventsClientSelectSchema,
  customer: customerClientSelectSchema,
  subscription: subscriptionClientSelectSchema,
  usageMeter: usageMetersClientSelectSchema,
  price: pricesClientSelectSchema,
})

// Paginated table row input schema
export const usageEventsPaginatedTableRowInputSchema =
  createPaginatedTableRowInputSchema(
    z.object({
      customerId: z.string().optional(),
      usageMeterId: z.string().optional(),
      subscriptionId: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    })
  )

export type UsageEventsPaginatedTableRowInput = z.infer<
  typeof usageEventsPaginatedTableRowInputSchema
>

// Paginated table row output schema
export const usageEventsPaginatedTableRowOutputSchema =
  createPaginatedTableRowOutputSchema(usageEventsTableRowDataSchema)

export type UsageEventsPaginatedTableRowOutput = z.infer<
  typeof usageEventsPaginatedTableRowOutputSchema
>
