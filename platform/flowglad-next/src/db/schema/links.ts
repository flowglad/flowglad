import { sql } from 'drizzle-orm'
import { pgPolicy, pgTable, text } from 'drizzle-orm/pg-core'
import * as R from 'ramda'
import { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import { fileClientInsertSchema } from '@/db/schema/files'
import { organizations } from '@/db/schema/organizations'
import { products } from '@/db/schema/products'
import {
  constructIndex,
  hiddenColumnsForClientSchema,
  livemodePolicy,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  type SelectConditions,
  tableBase,
} from '@/db/tableUtils'

const TABLE_NAME = 'links'

export const links = pgTable(
  TABLE_NAME,
  {
    ...tableBase('link'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    productId: nullableStringForeignKey('product_id', products),
    name: text('name').notNull(),
    url: text('url').notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.productId]),
      merchantPolicy(
        `Enable read for own organizations (${TABLE_NAME})`,
        {
          as: 'permissive',
          to: 'merchant',
          for: 'all',
          using: sql`"organization_id" in (select "organization_id" from "memberships")`,
          withCheck: sql`"product_id" is null OR "product_id" in (select "id" from "products")`,
        }
      ),
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

const columnRefinements = {
  url: z.string().url(),
}

export const {
  select: linksSelectSchema,
  insert: linksInsertSchema,
  update: linksUpdateSchema,
  client: {
    select: linkClientSelectSchema,
    insert: linkClientInsertSchema,
    update: linkClientUpdateSchema,
  },
} = buildSchemas(links, {
  refine: {
    ...columnRefinements,
  },
  client: {
    hiddenColumns: {
      ...hiddenColumnsForClientSchema,
    },
    readOnlyColumns: {
      organizationId: true,
      livemode: true,
    },
    createOnlyColumns: {},
  },
  entityName: 'Link',
})

export namespace Link {
  export type Insert = z.infer<typeof linksInsertSchema>
  export type Update = z.infer<typeof linksUpdateSchema>
  export type Record = z.infer<typeof linksSelectSchema>
  export type ClientInsert = z.infer<typeof linkClientInsertSchema>
  export type ClientUpdate = z.infer<typeof linkClientUpdateSchema>
  export type ClientRecord = z.infer<typeof linkClientSelectSchema>
  export type Where = SelectConditions<typeof links>
}

export const createLinkInputSchema = z.object({
  link: linkClientInsertSchema,
})

export type CreateLinkInput = z.infer<typeof createLinkInputSchema>

export const editLinkInputSchema = z.object({
  link: linkClientUpdateSchema,
})

export type EditLinkInput = z.infer<typeof editLinkInputSchema>

export const createPostPurchaseAssetInputSchema =
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('file'),
      file: fileClientInsertSchema,
    }),
    z.object({
      type: z.literal('link'),
      link: linkClientInsertSchema,
    }),
  ])

export type CreatePostPurchaseAssetInput = z.infer<
  typeof createPostPurchaseAssetInputSchema
>
