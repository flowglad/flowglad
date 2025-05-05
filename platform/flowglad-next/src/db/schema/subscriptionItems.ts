import * as R from 'ramda'
import {
  pgTable,
  jsonb,
  integer,
  pgPolicy,
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
} from '@/db/tableUtils'
import { subscriptions } from '@/db/schema/subscriptions'
import { prices } from '@/db/schema/prices'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import core from '@/utils/core'

const TABLE_NAME = 'subscription_items'

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
  metadata: jsonb('metadata'),
  /**
   * A hidden column, used primarily for managing migrations from
   * from external processors onto Flowglad
   */
  externalId: text('external_id'),
}

export const subscriptionItems = pgTable(
  TABLE_NAME,
  columns,
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.subscriptionId]),
      constructIndex(TABLE_NAME, [table.priceId]),
      constructUniqueIndex(TABLE_NAME, [table.externalId]),
      pgPolicy(
        'Enable actions for own organizations via subscriptions',
        {
          as: 'permissive',
          to: 'authenticated',
          for: 'all',
          using: sql`"subscriptionId" in (select "id" from "Subscriptions")`,
        }
      ),
      livemodePolicy(),
    ]
  }
).enableRLS()

const columnRefinements = {
  unitPrice: core.safeZodPositiveIntegerOrZero,
  quantity: core.safeZodPositiveInteger,
  metadata: metadataSchema.nullable(),
}

/*
 * database schema
 */
export const subscriptionItemsInsertSchema = createSelectSchema(
  subscriptionItems,
  columnRefinements
).omit(ommittedColumnsForInsertSchema)

export const subscriptionItemsSelectSchema =
  createSelectSchema(subscriptionItems).extend(columnRefinements)

export const subscriptionItemsUpdateSchema = createSelectSchema(
  subscriptionItems,
  columnRefinements
)
  .partial()
  .extend({
    id: z.string(),
  })

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

const nonClientEditableColumns = {
  ...readOnlyColumns,
  ...hiddenColumns,
  ...createOnlyColumns,
} as const

/*
 * client schemas
 */
export const subscriptionItemClientInsertSchema =
  subscriptionItemsInsertSchema.omit(
    R.omit(['position'], nonClientEditableColumns)
  )

export const subscriptionItemClientUpdateSchema =
  subscriptionItemsUpdateSchema.omit(nonClientEditableColumns)

export const subscriptionItemClientSelectSchema =
  subscriptionItemsSelectSchema.omit(hiddenColumns)

export namespace SubscriptionItem {
  export type Insert = z.infer<typeof subscriptionItemsInsertSchema>
  export type Update = z.infer<typeof subscriptionItemsUpdateSchema>
  export type Record = z.infer<typeof subscriptionItemsSelectSchema>
  export type Upsert = Insert | Record
  export type ClientInsert = z.infer<
    typeof subscriptionItemClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof subscriptionItemClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof subscriptionItemClientSelectSchema
  >
  export type ClientUpsert = ClientInsert | ClientRecord
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
