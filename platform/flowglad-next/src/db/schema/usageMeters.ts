import { text, pgTable, pgPolicy } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import {
  tableBase,
  notNullStringForeignKey,
  constructIndex,
  enhancedCreateInsertSchema,
  livemodePolicy,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
  constructUniqueIndex,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { createSelectSchema } from 'drizzle-zod'
import { Catalog } from '@/db/schema/catalogs'

const TABLE_NAME = 'usage_meters'

export const usageMeters = pgTable(
  TABLE_NAME,
  {
    ...tableBase('usage_meter'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    name: text('name').notNull(),
    catalogId: text('catalog_id').notNull(),
    productId: text('product_id').notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.catalogId]),
      constructIndex(TABLE_NAME, [table.productId]),
      constructUniqueIndex(TABLE_NAME, [
        table.organizationId,
        table.name,
      ]),
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

const columnRefinements = {}

export const usageMetersInsertSchema = enhancedCreateInsertSchema(
  usageMeters,
  columnRefinements
)

export const usageMetersSelectSchema =
  createSelectSchema(usageMeters).extend(columnRefinements)

export const usageMetersUpdateSchema = usageMetersSelectSchema
  .partial()
  .extend({
    id: z.string(),
  })

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
} as const

const createOnlyColumns = {
  catalogId: true,
} as const
export const usageMetersClientSelectSchema =
  usageMetersSelectSchema.omit(readOnlyColumns)

export const usageMetersClientUpdateSchema =
  usageMetersUpdateSchema.omit({
    ...readOnlyColumns,
    ...createOnlyColumns,
  })

export const usageMetersClientInsertSchema =
  usageMetersInsertSchema.omit(readOnlyColumns)

export const usageMeterPaginatedSelectSchema =
  createPaginatedSelectSchema(usageMetersClientSelectSchema)

export const usageMeterPaginatedListSchema =
  createPaginatedListQuerySchema(usageMetersClientSelectSchema)

export namespace UsageMeter {
  export type Insert = z.infer<typeof usageMetersInsertSchema>
  export type Update = z.infer<typeof usageMetersUpdateSchema>
  export type Record = z.infer<typeof usageMetersSelectSchema>
  export type ClientInsert = z.infer<
    typeof usageMetersClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof usageMetersClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof usageMetersClientSelectSchema
  >
  export type PaginatedList = z.infer<
    typeof usageMeterPaginatedListSchema
  >
}

export const createUsageMeterSchema = z.object({
  usageMeter: usageMetersClientInsertSchema,
})

export type CreateUsageMeterInput = z.infer<
  typeof createUsageMeterSchema
>

export const editUsageMeterSchema = z.object({
  id: z.string(),
  usageMeter: usageMetersClientUpdateSchema,
})

export type EditUsageMeterInput = z.infer<typeof editUsageMeterSchema>
