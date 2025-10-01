import * as R from 'ramda'
import { integer, text, pgTable, pgPolicy } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import {
  constructIndex,
  ommittedColumnsForInsertSchema,
  constructUniqueIndex,
  nullableStringForeignKey,
  tableBase,
  notNullStringForeignKey,
  livemodePolicy,
  SelectConditions,
  hiddenColumnsForClientSchema,
  merchantPolicy,
  clientWriteOmitsConstructor,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
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
      livemodePolicy(TABLE_NAME),
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
export const filesInsertSchema = createInsertSchema(files)
  .omit(ommittedColumnsForInsertSchema)
  .extend(columnRefinements)

export const filesSelectSchema =
  createSelectSchema(files).extend(columnRefinements)

export const filesUpdateSchema = filesInsertSchema
  .partial()
  .extend({ id: z.string() })

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
  ...hiddenColumnsForClientSchema,
} as const

const nonClientEditableColumns = {
  ...hiddenColumns,
  ...readOnlyColumns,
} as const

const clientWriteOmits = clientWriteOmitsConstructor({
  ...hiddenColumns,
  ...readOnlyColumns,
})

/*
 * client schemas
 */
export const fileClientInsertSchema = filesInsertSchema
  .omit(clientWriteOmits)
  .meta({ id: 'FileClientInsertSchema' })

export const fileClientUpdateSchema = filesUpdateSchema
  .omit(clientWriteOmits)
  .meta({ id: 'FileClientUpdateSchema' })

export const fileClientSelectSchema = filesSelectSchema
  .omit(hiddenColumns)
  .meta({ id: 'FileClientSelectSchema' })

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
