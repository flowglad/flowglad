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
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { createSelectSchema } from 'drizzle-zod'
import { products } from './products'
import { sql } from 'drizzle-orm'

const TABLE_NAME = 'Files'

export const files = pgTable(
  TABLE_NAME,
  {
    ...tableBase('file'),
    OrganizationId: notNullStringForeignKey(
      'OrganizationId',
      organizations
    ),
    ProductId: nullableStringForeignKey('ProductId', products),
    name: text('name').notNull(),
    sizeKb: integer('sizeKb').notNull(),
    contentType: text('contentType').notNull(),
    objectKey: text('objectKey').notNull().unique(),
    cdnUrl: text('cdnUrl').notNull(),
    etag: text('etag').notNull(),
    contentHash: text('contentHash').notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.OrganizationId]),
      constructUniqueIndex(TABLE_NAME, [table.objectKey]),
      livemodePolicy(),
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"OrganizationId" in (select "OrganizationId" from "Memberships")`,
        withCheck: sql`"ProductId" is null OR "ProductId" in (select "id" from "Products")`,
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
  OrganizationId: true,
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
}

export const createFileInputSchema = z.object({
  file: fileClientInsertSchema,
})

export type CreateFileInput = z.infer<typeof createFileInputSchema>

export const editFileInputSchema = z.object({
  file: fileClientUpdateSchema,
})

export type EditFileInput = z.infer<typeof editFileInputSchema>
