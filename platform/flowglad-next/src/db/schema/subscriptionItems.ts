import * as R from 'ramda'
import {
  pgTable,
  jsonb,
  integer,
  timestamp,
  text,
} from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import {
  tableBase,
  notNullStringForeignKey,
  constructIndex,
  livemodePolicy,
  constructUniqueIndex,
  metadataSchema,
  SelectConditions,
  ommittedColumnsForInsertSchema,
  hiddenColumnsForClientSchema,
  nullableStringForeignKey,
  pgEnumColumn,
  merchantPolicy,
  enableCustomerReadPolicy,
} from '@/db/tableUtils'
import { subscriptions } from '@/db/schema/subscriptions'
import { prices } from '@/db/schema/prices'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import core from '@/utils/core'
import { usageMeters } from './usageMeters'
import { SubscriptionItemType } from '@/types'

const TABLE_NAME = 'subscription_items'

const STATIC_SUBSCRIPTION_ITEM_DESCRIPTION =
  'A static subscription item, representing a fixed fee component of a subscription.'
const USAGE_SUBSCRIPTION_ITEM_DESCRIPTION =
  'A usage-based subscription item, where charges are based on recorded usage events.'
const SUBSCRIPTION_ITEM_SELECT_SCHEMA_DESCRIPTION =
  'A subscription item record, part of a subscription, detailing a specific product or service and its pricing terms. Can be static or usage-based.'

const columns = {
  ...tableBase('si'),
  subscriptionId: notNullStringForeignKey(
    'subscription_id',
    subscriptions
  ),
  name: text('name'),
  addedDate: timestamp('added_date').notNull(),
  priceId: notNullStringForeignKey('price_id', prices),
  unitPrice: integer('unit_price').notNull(),
  quantity: integer('quantity').notNull(),
  usageEventsPerUnit: integer('usage_events_per_unit'),
  usageMeterId: nullableStringForeignKey(
    'usage_meter_id',
    usageMeters
  ),
  metadata: jsonb('metadata'),
  type: pgEnumColumn({
    enumName: 'SubscriptionItemType',
    columnName: 'type',
    enumBase: SubscriptionItemType,
  }).notNull(),
  /**
   * A hidden column, used primarily for managing migrations from
   * from external processors onto Flowglad
   */
  externalId: text('external_id'),
  expiredAt: timestamp('expired_at'),
}

export const subscriptionItems = pgTable(
  TABLE_NAME,
  columns,
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.subscriptionId]),
      constructIndex(TABLE_NAME, [table.priceId]),
      constructUniqueIndex(TABLE_NAME, [table.externalId]),
      constructIndex(TABLE_NAME, [table.usageMeterId]),
      enableCustomerReadPolicy(
        `Enable read for customers (${TABLE_NAME})`,
        {
          using: sql`"subscription_id" in (select "id" from "subscriptions")`,
        }
      ),
      merchantPolicy(
        'Enable actions for own organizations via subscriptions',
        {
          as: 'permissive',
          to: 'merchant',
          for: 'all',
          using: sql`"subscriptionId" in (select "id" from "Subscriptions")`,
        }
      ),
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

const baseColumnRefinements = {
  unitPrice: core.safeZodPositiveIntegerOrZero,
  quantity: core.safeZodPositiveInteger,
  metadata: metadataSchema.nullable().optional(),
  // Accept ISO datetime strings or Date objects
  addedDate: z.coerce.date(),
  expiredAt: z.coerce
    .date()
    .nullable()
    .describe(
      'Used as a flag to soft delete a subscription item without losing its history for auditability. If set, it will be removed from the subscription items list and will not be included in the billing period item list.'
    ),
  // type refinement is handled by discriminated union literals
}

const baseSubscriptionItemSelectSchema = createSelectSchema(
  subscriptionItems,
  baseColumnRefinements
)

// Static Subscription Item Schemas
export const staticSubscriptionItemSelectSchema =
  baseSubscriptionItemSelectSchema
    .extend({
      type: z.literal(SubscriptionItemType.Static),
      usageMeterId: z
        .null()
        .describe(
          'Usage meter ID must be null for static subscription items.'
        ),
      usageEventsPerUnit: z
        .null()
        .describe(
          'Usage events per unit must be null for static subscription items.'
        ),
    })
    .describe(STATIC_SUBSCRIPTION_ITEM_DESCRIPTION)

export const staticSubscriptionItemInsertSchema =
  staticSubscriptionItemSelectSchema
    .omit(ommittedColumnsForInsertSchema)
    .describe(STATIC_SUBSCRIPTION_ITEM_DESCRIPTION)

export const staticSubscriptionItemUpdateSchema =
  staticSubscriptionItemInsertSchema
    .partial()
    .extend({
      id: z.string(),
      type: z.literal(SubscriptionItemType.Static), // Type cannot be changed
    })
    .describe(STATIC_SUBSCRIPTION_ITEM_DESCRIPTION)

// Usage Subscription Item Schemas
export const usageSubscriptionItemSelectSchema =
  baseSubscriptionItemSelectSchema
    .extend({
      type: z.literal(SubscriptionItemType.Usage),
      usageMeterId: z
        .string()
        .describe(
          'The usage meter associated with this usage-based subscription item.'
        ), // Overrides base nullable
      usageEventsPerUnit: core.safeZodPositiveInteger.describe(
        'The number of usage events that constitute one unit for billing.'
      ), // Overrides base nullable
    })
    .describe(USAGE_SUBSCRIPTION_ITEM_DESCRIPTION)

export const usageSubscriptionItemInsertSchema =
  usageSubscriptionItemSelectSchema
    .omit(ommittedColumnsForInsertSchema)
    .describe(USAGE_SUBSCRIPTION_ITEM_DESCRIPTION)

export const usageSubscriptionItemUpdateSchema =
  usageSubscriptionItemInsertSchema
    .partial()
    .extend({
      id: z.string(),
      type: z.literal(SubscriptionItemType.Usage), // Type cannot be changed
    })
    .describe(USAGE_SUBSCRIPTION_ITEM_DESCRIPTION)

/*
 * database schema
 */
export const subscriptionItemsInsertSchema = z
  .discriminatedUnion('type', [
    staticSubscriptionItemInsertSchema,
    usageSubscriptionItemInsertSchema,
  ])
  .describe(SUBSCRIPTION_ITEM_SELECT_SCHEMA_DESCRIPTION)

export const subscriptionItemsSelectSchema = z
  .discriminatedUnion('type', [
    staticSubscriptionItemSelectSchema,
    usageSubscriptionItemSelectSchema,
  ])
  .describe(SUBSCRIPTION_ITEM_SELECT_SCHEMA_DESCRIPTION)

export const subscriptionItemsUpdateSchema = z
  .discriminatedUnion('type', [
    staticSubscriptionItemUpdateSchema,
    usageSubscriptionItemUpdateSchema,
  ])
  .describe(SUBSCRIPTION_ITEM_SELECT_SCHEMA_DESCRIPTION)

const createOnlyColumns = {
  subscriptionId: true,
  priceId: true,
} as const

const readOnlyColumns = {
  livemode: true,
} as const

const hiddenColumns = {
  ...hiddenColumnsForClientSchema,
} as const

/*
 * client schemas
 */

const clientNonEditableColumns = R.omit(['position'], {
  ...readOnlyColumns,
  ...hiddenColumns,
})

// Static Subscription Item Client Schemas
export const staticSubscriptionItemClientInsertSchema =
  staticSubscriptionItemInsertSchema
    .omit(clientNonEditableColumns)
    .meta({ id: 'StaticSubscriptionItemInsert' })
export const staticSubscriptionItemClientUpdateSchema =
  staticSubscriptionItemUpdateSchema
    .omit(clientNonEditableColumns)
    .omit(createOnlyColumns)
    .meta({ id: 'StaticSubscriptionItemUpdate' })

export const staticSubscriptionItemClientSelectSchema =
  staticSubscriptionItemSelectSchema
    .omit(hiddenColumns)
    .meta({ id: 'StaticSubscriptionItemRecord' })

// Usage Subscription Item Client Schemas
export const usageSubscriptionItemClientInsertSchema =
  usageSubscriptionItemInsertSchema
    .omit(clientNonEditableColumns)
    .meta({ id: 'UsageSubscriptionItemInsert' })
export const usageSubscriptionItemClientUpdateSchema =
  usageSubscriptionItemUpdateSchema
    .omit(clientNonEditableColumns)
    .omit(createOnlyColumns)
    .meta({ id: 'UsageSubscriptionItemUpdate' })

export const usageSubscriptionItemClientSelectSchema =
  usageSubscriptionItemSelectSchema
    .omit(hiddenColumns)
    .meta({ id: 'UsageSubscriptionItemRecord' })

// Client Discriminated Union Schemas
export const subscriptionItemClientInsertSchema = z
  .discriminatedUnion('type', [
    staticSubscriptionItemClientInsertSchema,
    usageSubscriptionItemClientInsertSchema,
  ])
  .meta({
    id: 'SubscriptionItemInsert',
  })

export const subscriptionItemClientUpdateSchema = z
  .discriminatedUnion('type', [
    staticSubscriptionItemClientUpdateSchema,
    usageSubscriptionItemClientUpdateSchema,
  ])
  .meta({
    id: 'SubscriptionItemUpdate',
  })

export const subscriptionItemClientSelectSchema = z
  .discriminatedUnion('type', [
    staticSubscriptionItemClientSelectSchema,
    usageSubscriptionItemClientSelectSchema,
  ])
  .meta({
    id: 'SubscriptionItemRecord',
  })

export namespace SubscriptionItem {
  export type Insert = z.infer<typeof subscriptionItemsInsertSchema>
  export type Update = z.infer<typeof subscriptionItemsUpdateSchema>
  export type Record = z.infer<typeof subscriptionItemsSelectSchema>
  export type Upsert = Insert | Record // Note: Upsert might need more specific handling with discriminated unions

  export type StaticInsert = z.infer<
    typeof staticSubscriptionItemInsertSchema
  >
  export type StaticUpdate = z.infer<
    typeof staticSubscriptionItemUpdateSchema
  >
  export type StaticRecord = z.infer<
    typeof staticSubscriptionItemSelectSchema
  >

  export type UsageInsert = z.infer<
    typeof usageSubscriptionItemInsertSchema
  >
  export type UsageUpdate = z.infer<
    typeof usageSubscriptionItemUpdateSchema
  >
  export type UsageRecord = z.infer<
    typeof usageSubscriptionItemSelectSchema
  >

  export type ClientInsert = z.infer<
    typeof subscriptionItemClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof subscriptionItemClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof subscriptionItemClientSelectSchema
  >
  export type ClientUpsert = ClientInsert | ClientRecord // Note: Upsert might need more specific handling

  export type ClientStaticInsert = z.infer<
    typeof staticSubscriptionItemClientInsertSchema
  >
  export type ClientStaticUpdate = z.infer<
    typeof staticSubscriptionItemClientUpdateSchema
  >
  export type ClientStaticRecord = z.infer<
    typeof staticSubscriptionItemClientSelectSchema
  >

  export type ClientUsageInsert = z.infer<
    typeof usageSubscriptionItemClientInsertSchema
  >
  export type ClientUsageUpdate = z.infer<
    typeof usageSubscriptionItemClientUpdateSchema
  >
  export type ClientUsageRecord = z.infer<
    typeof usageSubscriptionItemClientSelectSchema
  >

  export type Where = SelectConditions<typeof subscriptionItems>
}

export const createSubscriptionItemSchema = z.object({
  subscriptionItem: subscriptionItemClientInsertSchema,
})

export type CreateSubscriptionItemInput = z.infer<
  typeof createSubscriptionItemSchema
>

export const editSubscriptionItemSchema = z.object({
  subscriptionItem: subscriptionItemClientUpdateSchema,
  id: z.string(),
})

export type EditSubscriptionItemInput = z.infer<
  typeof editSubscriptionItemSchema
>
