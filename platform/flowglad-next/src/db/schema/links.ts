import { text, pgTable, pgPolicy } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  tableBase,
  constructIndex,
  enhancedCreateInsertSchema,
  nullableStringForeignKey,
  createUpdateSchema,
  notNullStringForeignKey,
  livemodePolicy,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { products } from '@/db/schema/products'
import { createSelectSchema } from 'drizzle-zod'
import { fileClientInsertSchema } from './files'

const TABLE_NAME = 'Links'

export const links = pgTable(
  TABLE_NAME,
  {
    ...tableBase('link'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    productId: nullableStringForeignKey('ProductId', products),
    name: text('name').notNull(),
    url: text('url').notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.productId]),
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"organizationId" in (select "organizationId" from "Memberships")`,
        withCheck: sql`"ProductId" is null OR "ProductId" in (select "id" from "Products")`,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

const columnRefinements = {
  url: z.string().url(),
}

/*
 * database schemas
 */
export const linksInsertSchema = enhancedCreateInsertSchema(
  links,
  columnRefinements
).extend(columnRefinements)

export const linksSelectSchema =
  createSelectSchema(links).extend(columnRefinements)

export const linksUpdateSchema = createUpdateSchema(
  links,
  columnRefinements
)

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
} as const

const hiddenColumns = {} as const

const nonClientEditableColumns = {
  ...hiddenColumns,
  ...readOnlyColumns,
} as const

/*
 * client schemas
 */
export const linkClientInsertSchema = linksInsertSchema.omit(
  nonClientEditableColumns
)

export const linkClientUpdateSchema = linksUpdateSchema.omit(
  nonClientEditableColumns
)

export const linkClientSelectSchema =
  linksSelectSchema.omit(hiddenColumns)

export namespace Link {
  export type Insert = z.infer<typeof linksInsertSchema>
  export type Update = z.infer<typeof linksUpdateSchema>
  export type Record = z.infer<typeof linksSelectSchema>
  export type ClientInsert = z.infer<typeof linkClientInsertSchema>
  export type ClientUpdate = z.infer<typeof linkClientUpdateSchema>
  export type ClientRecord = z.infer<typeof linkClientSelectSchema>
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
