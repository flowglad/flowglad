import { text, pgTable, boolean } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import {
  ommittedColumnsForInsertSchema,
  constructIndex,
  tableBase,
  newBaseZodSelectSchemaColumns,
  notNullStringForeignKey,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
  livemodePolicy,
  SelectConditions,
  hiddenColumnsForClientSchema,
  merchantPolicy,
  enableCustomerReadPolicy,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { pgPolicy } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import core from '@/utils/core'
import { DestinationEnvironment } from '@/types'

const TABLE_NAME = 'pricing_models'

export const pricingModels = pgTable(
  TABLE_NAME,
  {
    ...tableBase('pricing_model'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    isDefault: boolean('is_default').notNull().default(false),
    name: text('name').notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.name]),
      enableCustomerReadPolicy(
        `Enable read for customers (${TABLE_NAME})`,
        {
          using: sql`"id" in (select "pricing_model_id" from "customers")`,
        }
      ),
      merchantPolicy(
        `Enable read for own organizations (${TABLE_NAME})`,
        {
          as: 'permissive',
          to: 'merchant',
          for: 'all',
          using: sql`"organization_id" in (select "organization_id" from "memberships")`,
        }
      ),
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

export const pricingModelsSelectSchema = createSelectSchema(
  pricingModels,
  {
    ...newBaseZodSelectSchemaColumns,
  }
)

export const pricingModelsInsertSchema = createInsertSchema(
  pricingModels
).omit(ommittedColumnsForInsertSchema)

export const pricingModelsUpdateSchema = pricingModelsInsertSchema
  .partial()
  .extend({
    id: z.string(),
  })

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
} as const

const hiddenColumns = {
  ...hiddenColumnsForClientSchema,
} as const

export const pricingModelsClientSelectSchema =
  pricingModelsSelectSchema
    .omit(hiddenColumns)
    .meta({ id: 'PricingModelsClientSelectSchema' })

export const pricingModelsClientUpdateSchema =
  pricingModelsUpdateSchema
    .omit(readOnlyColumns)
    .meta({ id: 'PricingModelsClientUpdateSchema' })

export const pricingModelsClientInsertSchema =
  pricingModelsInsertSchema
    .omit(readOnlyColumns)
    .meta({ id: 'PricingModelsClientInsertSchema' })

export const pricingModelsPaginatedSelectSchema =
  createPaginatedSelectSchema(pricingModelsClientSelectSchema)

export const pricingModelsPaginatedListSchema =
  createPaginatedListQuerySchema(pricingModelsClientSelectSchema)

export const pricingModelIdSchema = z.object({
  id: z.string(),
})

export namespace PricingModel {
  export type Insert = z.infer<typeof pricingModelsInsertSchema>
  export type Update = z.infer<typeof pricingModelsUpdateSchema>
  export type Record = z.infer<typeof pricingModelsSelectSchema>
  export type ClientInsert = z.infer<
    typeof pricingModelsClientInsertSchema
  >
  export type ClientRecord = z.infer<
    typeof pricingModelsClientSelectSchema
  >
  export type ClientUpdate = z.infer<
    typeof pricingModelsClientUpdateSchema
  >
  export type PaginatedList = z.infer<
    typeof pricingModelsPaginatedListSchema
  >
  export type Where = SelectConditions<typeof pricingModels>
  export type TableRow = {
    pricingModel: ClientRecord
    productsCount: number
  }
}

export const createPricingModelSchema = z.object({
  pricingModel: pricingModelsClientInsertSchema,
})

export type CreatePricingModelInput = z.infer<
  typeof createPricingModelSchema
>

export const editPricingModelSchema = z.object({
  id: z.string(),
  pricingModel: pricingModelsClientUpdateSchema,
})

export type EditPricingModelInput = z.infer<
  typeof editPricingModelSchema
>

export const clonePricingModelInputSchema = z.object({
  id: z.string(),
  name: z.string().describe('The name of the new pricing model.'),
  destinationEnvironment: core
    .createSafeZodEnum(DestinationEnvironment)
    .optional(),
})

export type ClonePricingModelInput = z.infer<
  typeof clonePricingModelInputSchema
>
