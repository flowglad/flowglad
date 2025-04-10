import { integer, text, pgTable, pgPolicy } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import {
  constructIndex,
  enhancedCreateInsertSchema,
  createUpdateSchema,
  constructUniqueIndex,
  nullableStringForeignKey,
  tableBase,
  notNullStringForeignKey,
  livemodePolicy,
  createSupabaseWebhookSchema,
  ommittedColumnsForInsertSchema,
  SelectConditions,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { createSelectSchema } from 'drizzle-zod'
import { products } from './products'
import { sql } from 'drizzle-orm'

const TABLE_NAME = 'files'

export const files = pgTable(
  TABLE_NAME,
  {
    ...tableBase('file'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    productId: nullableStringForeignKey('product_id', products),
    name: text('name').notNull(),
    sizeKb: integer('size_kb').notNull(),
    contentType: text('content_type').notNull(),
    objectKey: text('object_key').notNull().unique(),
    cdnUrl: text('cdn_url').notNull(),
    etag: text('etag').notNull(),
    contentHash: text('content_hash').notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructUniqueIndex(TABLE_NAME, [table.objectKey]),
      livemodePolicy(),
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
        withCheck: sql`"product_id" is null OR "product_id" in (select "id" from "products")`,
      }),
    ]
  }
).enableRLS()

const columnRefinements = {
  contentHash: z.string(),
  sizeKb: z.number().transform((val) => Math.round(val)),
}

/*
 * database schema
 */
export const filesInsertSchema = enhancedCreateInsertSchema(
  files,
  columnRefinements
).extend(columnRefinements)

export const filesSelectSchema =
  createSelectSchema(files).extend(columnRefinements)

export const filesUpdateSchema = createUpdateSchema(
  files,
  columnRefinements
)

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
  sizeKb: true,
  contentType: true,
  cdnUrl: true,
  contentHash: true,
} as const

const hiddenColumns = {
  etag: true,
} as const

const nonClientEditableColumns = {
  ...hiddenColumns,
  ...readOnlyColumns,
} as const

/*
 * client schemas
 */
export const fileClientInsertSchema = filesInsertSchema.omit(
  nonClientEditableColumns
)

export const fileClientUpdateSchema = filesUpdateSchema.omit(
  nonClientEditableColumns
)

export const fileClientSelectSchema =
  filesSelectSchema.omit(hiddenColumns)

export namespace File {
  export type Insert = z.infer<typeof filesInsertSchema>
  export type Update = z.infer<typeof filesUpdateSchema>
  export type Record = z.infer<typeof filesSelectSchema>
  export type ClientInsert = z.infer<typeof fileClientInsertSchema>
  export type ClientUpdate = z.infer<typeof fileClientUpdateSchema>
  export type ClientRecord = z.infer<typeof fileClientSelectSchema>
  export type Where = SelectConditions<typeof files>
}

export const createFileInputSchema = z.object({
  file: fileClientInsertSchema,
})

export type CreateFileInput = z.infer<typeof createFileInputSchema>

export const editFileInputSchema = z.object({
  file: fileClientUpdateSchema,
})

export type EditFileInput = z.infer<typeof editFileInputSchema>
