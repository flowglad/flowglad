import * as R from 'ramda'
import { text, pgTable, pgPolicy } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import {
  tableBase,
  notNullStringForeignKey,
  constructIndex,
  ommittedColumnsForInsertSchema,
  livemodePolicy,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
  pgEnumColumn,
  SelectConditions,
  hiddenColumnsForClientSchema,
  constructUniqueIndex,
  merchantPolicy,
  enableCustomerReadPolicy,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import { UsageMeterAggregationType } from '@/types'
import { pricingModels } from '@/db/schema/pricingModels'
import core from '@/utils/core'

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
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
    slug: text('slug').notNull(),
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
      constructIndex(TABLE_NAME, [table.pricingModelId]),
      constructUniqueIndex(TABLE_NAME, [
        table.organizationId,
        table.slug,
        table.pricingModelId,
      ]),
      enableCustomerReadPolicy(
        `Enable read for customers (${TABLE_NAME})`,
        {
          using: sql`"pricing_model_id" in (select "pricing_model_id" from "customers")`,
        }
      ),
      merchantPolicy(
        `Enable read for own organizations (${TABLE_NAME})`,
        {
          as: 'permissive',
          to: 'permissive',
          for: 'all',
          using: sql`"organization_id" in (select "organization_id" from "memberships")`,
        }
      ),
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

const columnRefinements = {
  aggregationType: core
    .createSafeZodEnum(UsageMeterAggregationType)
    .describe(
      'The type of aggregation to perform on the usage meter. Defaults to "sum", which aggregates all the usage event amounts for the billing period. "count_distinct_properties" counts the number of distinct properties in the billing period for a given meter.'
    ),
}

export const usageMetersInsertSchema = createInsertSchema(usageMeters)
  .omit(ommittedColumnsForInsertSchema)
  .extend(columnRefinements)
  .extend({
    aggregationType: columnRefinements.aggregationType.optional(),
  })

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
  pricingModelId: true,
} as const

const clientWriteOmits = R.omit(['position'], {
  ...hiddenColumns,
  ...readOnlyColumns,
})

export const usageMetersClientSelectSchema = usageMetersSelectSchema
  .omit(hiddenColumns)
  .meta({ id: 'UsageMetersClientSelectSchema' })

export const usageMetersClientUpdateSchema = usageMetersUpdateSchema
  .omit({
    ...hiddenColumns,
    ...readOnlyColumns,
  })
  .omit(createOnlyColumns)
  .meta({ id: 'UsageMetersClientUpdateSchema' })

export const usageMetersClientInsertSchema = usageMetersInsertSchema
  .omit(clientWriteOmits)
  .meta({ id: 'UsageMetersClientInsertSchema' })

export const usageMeterPaginatedSelectSchema =
  createPaginatedSelectSchema(usageMetersClientSelectSchema)

export const usageMeterPaginatedListSchema =
  createPaginatedListQuerySchema(usageMetersClientSelectSchema)

export const usageMetersTableRowDataSchema = z.object({
  usageMeter: usageMetersClientSelectSchema,
  pricingModel: z.object({
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

export const usageMeterBalanceClientSelectSchema =
  usageMetersClientSelectSchema
    .extend({
      availableBalance: z.number(),
      subscriptionId: z.string(),
    })
    .describe(
      'A usage meter and the available balance for that meter, scoped to a given subscription.'
    )

export type UsageMeterBalance = z.infer<
  typeof usageMeterBalanceClientSelectSchema
>
