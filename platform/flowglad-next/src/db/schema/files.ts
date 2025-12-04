import { sql } from 'drizzle-orm'
import { integer, pgPolicy, pgTable, text } from 'drizzle-orm/pg-core'
import * as R from 'ramda'
import { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import { organizations } from '@/db/schema/organizations'
import {
  constructIndex,
  constructUniqueIndex,
  hiddenColumnsForClientSchema,
  livemodePolicy,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  type SelectConditions,
  tableBase,
} from '@/db/tableUtils'
import { products } from './products'

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

export const {
  select: filesSelectSchema,
  insert: filesInsertSchema,
  update: filesUpdateSchema,
  client: {
    select: fileClientSelectSchema,
    insert: fileClientInsertSchema,
    update: fileClientUpdateSchema,
  },
} = buildSchemas(files, {
  refine: {
    ...columnRefinements,
  },
  client: {
    hiddenColumns: {
      etag: true,
      ...hiddenColumnsForClientSchema,
    },
    readOnlyColumns: {
      organizationId: true,
      livemode: true,
      sizeKb: true,
      contentType: true,
      cdnUrl: true,
      contentHash: true,
    },
    createOnlyColumns: {},
  },
  entityName: 'File',
})

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
