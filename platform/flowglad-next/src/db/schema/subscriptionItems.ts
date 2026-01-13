import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
} from 'drizzle-orm/pg-core'
import * as R from 'ramda'
import { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import { prices } from '@/db/schema/prices'
import { subscriptions } from '@/db/schema/subscriptions'
import {
  constructIndex,
  constructUniqueIndex,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  metadataSchema,
  notNullStringForeignKey,
  nullableStringForeignKey,
  ommittedColumnsForInsertSchema,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
  timestampWithTimezoneColumn,
} from '@/db/tableUtils'
import { zodEpochMs } from '@/db/timestampMs'
import { SubscriptionItemType } from '@/types'
import core from '@/utils/core'
import { pricingModels } from './pricingModels'
import { usageMeters } from './usageMeters'

const TABLE_NAME = 'subscription_items'

const SUBSCRIPTION_ITEM_SELECT_SCHEMA_DESCRIPTION =
  'A subscription item record, part of a subscription, detailing a specific product or service and its pricing terms.'
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
  priceId: nullableStringForeignKey('price_id', prices),
  unitPrice: integer('unit_price').notNull(),
  quantity: integer('quantity').notNull(),
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
  manuallyCreated: boolean('manually_created')
    .notNull()
    .default(false),
  pricingModelId: notNullStringForeignKey(
    'pricing_model_id',
    pricingModels
  ),
}

export const subscriptionItems = pgTable(
  TABLE_NAME,
  columns,
  livemodePolicyTable(TABLE_NAME, (table, livemodeIndex) => [
    livemodeIndex([table.subscriptionId]),
    constructIndex(TABLE_NAME, [table.priceId]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    constructUniqueIndex(TABLE_NAME, [table.externalId]),
    // constructIndex(TABLE_NAME, [table.usageMeterId]),
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
        using: sql`"subscription_id" in (select "id" from "Subscriptions")`,
      }
    ),
  ])
).enableRLS()

const baseColumnRefinements = {
  unitPrice: core.safeZodPositiveIntegerOrZero,
  quantity: core.safeZodPositiveIntegerOrZero,
  metadata: metadataSchema.nullable().optional(),
  // Accept ISO datetime strings or Date objects
  expiredAt: zodEpochMs
    .nullable()
    .optional()
    .describe(
      'Used as a flag to soft delete a subscription item without losing its history for auditability. If set, it will be removed from the subscription items list and will not be included in the billing period item list. Epoch milliseconds.'
    ),
}

// Static subtype schemas via buildSchemas
const staticRefineColumns = {
  ...baseColumnRefinements,
  type: z.literal(SubscriptionItemType.Static),
} as const

const createOnlyColumns = {
  subscriptionId: true,
  priceId: true,
} as const

const readOnlyColumns = {
  livemode: true,
  pricingModelId: true,
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
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
  },
  entityName: 'StaticSubscriptionItem',
})

/*
 * database schema
 */
export const subscriptionItemsInsertSchema =
  staticSubscriptionItemInsertSchema.describe(
    SUBSCRIPTION_ITEM_INSERT_SCHEMA_DESCRIPTION
  )

export const subscriptionItemsSelectSchema =
  staticSubscriptionItemSelectSchema.describe(
    SUBSCRIPTION_ITEM_SELECT_SCHEMA_DESCRIPTION
  )

export const subscriptionItemsUpdateSchema =
  staticSubscriptionItemUpdateSchema.describe(
    SUBSCRIPTION_ITEM_SELECT_SCHEMA_DESCRIPTION
  )

/*
 * client schemas (derived via buildSchemas above)
 */

// Client Discriminated Union Schemas
export const subscriptionItemClientInsertSchema =
  staticSubscriptionItemClientInsertSchema.meta({
    id: 'SubscriptionItemInsert',
  })

export const subscriptionItemClientUpdateSchema =
  staticSubscriptionItemClientUpdateSchema.meta({
    id: 'SubscriptionItemUpdate',
  })

export const subscriptionItemClientSelectSchema =
  staticSubscriptionItemClientSelectSchema.meta({
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
