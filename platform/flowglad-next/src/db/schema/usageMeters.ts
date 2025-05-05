import * as R from 'ramda'
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
  pgEnumColumn,
  SelectConditions,
  hiddenColumnsForClientSchema,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { createSelectSchema } from 'drizzle-zod'
import { UsageMeterAggregationType } from '@/types'
import { catalogs } from '@/db/schema/catalogs'

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
    catalogId: notNullStringForeignKey('catalog_id', catalogs),
    aggregationType: pgEnumColumn({
      enumName: 'UsageMeterAggregationType',
      columnName: 'aggregation_type',
      enumBase: UsageMeterAggregationType,
    })
      .notNull()
      .default(UsageMeterAggregationType.Sum),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.catalogId]),
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

const columnRefinements = {
  aggregationType: z
    .nativeEnum(UsageMeterAggregationType)
    .describe(
      'The type of aggregation to perform on the usage meter. Defaults to "sum", which aggregates all the usage event amounts for the billing period. "count_distinct_properties" counts the number of distinct properties in the billing period for a given meter.'
    ),
}

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

const hiddenColumns = {
  ...hiddenColumnsForClientSchema,
} as const

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
} as const

const createOnlyColumns = {
  catalogId: true,
} as const

const clientWriteOmits = R.omit(['position'], {
  ...hiddenColumns,
  ...readOnlyColumns,
})

export const usageMetersClientSelectSchema =
  usageMetersSelectSchema.omit(hiddenColumns)

export const usageMetersClientUpdateSchema = usageMetersUpdateSchema
  .omit({
    ...hiddenColumns,
    ...readOnlyColumns,
  })
  .omit(createOnlyColumns)

export const usageMetersClientInsertSchema =
  usageMetersInsertSchema.omit(clientWriteOmits)

export const usageMeterPaginatedSelectSchema =
  createPaginatedSelectSchema(usageMetersClientSelectSchema)

export const usageMeterPaginatedListSchema =
  createPaginatedListQuerySchema(usageMetersClientSelectSchema)

export const usageMetersTableRowDataSchema = z.object({
  usageMeter: usageMetersClientSelectSchema,
  catalog: z.object({
    id: z.string(),
    name: z.string(),
  }),
})

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
  export type TableRow = z.infer<typeof usageMetersTableRowDataSchema>
  export type Where = SelectConditions<typeof usageMeters>
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
