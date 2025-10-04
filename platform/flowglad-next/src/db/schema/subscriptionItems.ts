import * as R from 'ramda'
import { pgTable, jsonb, integer, text } from 'drizzle-orm/pg-core'
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
  timestampWithTimezoneColumn,
  zodEpochMs,
  clientWriteOmitsConstructor,
} from '@/db/tableUtils'
import { subscriptions } from '@/db/schema/subscriptions'
import { prices } from '@/db/schema/prices'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import core from '@/utils/core'
import { usageMeters } from './usageMeters'
import { SubscriptionItemType } from '@/types'
import { buildSchemas } from '@/db/createZodSchemas'

const TABLE_NAME = 'subscription_items'

const SUBSCRIPTION_ITEM_SELECT_SCHEMA_DESCRIPTION =
  'A subscription item record, part of a subscription, detailing a specific product or service and its pricing terms. Can be static or usage-based.'
const SUBSCRIPTION_ITEM_INSERT_SCHEMA_DESCRIPTION =
  'A new subscription item.'
const SUBSCRIPTION_ITEM_UPDATE_SCHEMA_DESCRIPTION =
  'Schema for updating an existing subscription item.'

const columns = {
  ...tableBase('si'),
  subscriptionId: notNullStringForeignKey(
    'subscription_id',
    subscriptions
  ),
  name: text('name'),
  addedDate: timestampWithTimezoneColumn('added_date').notNull(),
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
  expiredAt: timestampWithTimezoneColumn('expired_at'),
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
  addedDate: zodEpochMs,
  expiredAt: zodEpochMs
    .nullable()
    .optional()
    .describe(
      'Used as a flag to soft delete a subscription item without losing its history for auditability. If set, it will be removed from the subscription items list and will not be included in the billing period item list.'
    ),
  // type refinement is handled by discriminated union literals
}

// Static and Usage subtype schemas via buildSchemas
const staticRefineColumns = {
  ...baseColumnRefinements,
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
} as const

const usageRefineColumns = {
  ...baseColumnRefinements,
  type: z.literal(SubscriptionItemType.Usage),
  usageMeterId: z
    .string()
    .describe(
      'The usage meter associated with this usage-based subscription item.'
    ),
  usageEventsPerUnit: core.safeZodPositiveInteger.describe(
    'The number of usage events that constitute one unit for billing.'
  ),
} as const

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

export const {
  insert: staticSubscriptionItemInsertSchema,
  select: staticSubscriptionItemSelectSchema,
  update: staticSubscriptionItemUpdateSchema,
  client: {
    insert: staticSubscriptionItemClientInsertSchema,
    select: staticSubscriptionItemClientSelectSchema,
    update: staticSubscriptionItemClientUpdateSchema,
  },
} = buildSchemas(subscriptionItems, {
  discriminator: 'type',
  refine: staticRefineColumns,
  client: {
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
  },
  entityName: 'StaticSubscriptionItem',
})

export const {
  insert: usageSubscriptionItemInsertSchema,
  select: usageSubscriptionItemSelectSchema,
  update: usageSubscriptionItemUpdateSchema,
  client: {
    insert: usageSubscriptionItemClientInsertSchema,
    select: usageSubscriptionItemClientSelectSchema,
    update: usageSubscriptionItemClientUpdateSchema,
  },
} = buildSchemas(subscriptionItems, {
  discriminator: 'type',
  refine: usageRefineColumns,
  client: {
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
  },
  entityName: 'UsageSubscriptionItem',
})

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

/*
 * client schemas (derived via buildSchemas above)
 */

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
