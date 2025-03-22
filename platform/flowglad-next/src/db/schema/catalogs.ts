import { text, pgTable } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { createSelectSchema } from 'drizzle-zod'
import {
  enhancedCreateInsertSchema,
  constructIndex,
  tableBase,
  newBaseZodSelectSchemaColumns,
  notNullStringForeignKey,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { pgPolicy } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

const TABLE_NAME = 'catalogs'

export const catalogs = pgTable(
  TABLE_NAME,
  {
    ...tableBase('catalog'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    name: text('name').notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.name]),
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
      }),
    ]
  }
).enableRLS()

export const catalogsSelectSchema = createSelectSchema(catalogs, {
  ...newBaseZodSelectSchemaColumns,
})

export const catalogsInsertSchema = enhancedCreateInsertSchema(
  catalogs,
  {}
)

export const catalogsUpdateSchema = catalogsInsertSchema
  .partial()
  .extend({
    id: z.string(),
  })

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
} as const

export const catalogsClientSelectSchema = catalogsSelectSchema

export const catalogsClientUpdateSchema =
  catalogsUpdateSchema.omit(readOnlyColumns)

export const catalogsClientInsertSchema =
  catalogsInsertSchema.omit(readOnlyColumns)

export namespace Catalog {
  export type Insert = z.infer<typeof catalogsInsertSchema>
  export type Update = z.infer<typeof catalogsUpdateSchema>
  export type Record = z.infer<typeof catalogsSelectSchema>
  export type ClientInsert = z.infer<
    typeof catalogsClientInsertSchema
  >
  export type ClientRecord = z.infer<
    typeof catalogsClientSelectSchema
  >
  export type ClientUpdate = z.infer<
    typeof catalogsClientUpdateSchema
  >
}

export const createCatalogSchema = z.object({
  catalog: catalogsClientInsertSchema,
})

export type CreateCatalogInput = z.infer<typeof createCatalogSchema>

export const editCatalogSchema = z.object({
  catalog: catalogsClientUpdateSchema,
})

export type EditCatalogInput = z.infer<typeof editCatalogSchema>
