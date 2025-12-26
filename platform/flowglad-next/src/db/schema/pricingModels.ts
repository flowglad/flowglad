import { sql } from 'drizzle-orm'
import { boolean, pgTable, text } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { organizations } from '@/db/schema/organizations'
import {
  clientWriteOmitsConstructor,
  constructIndex,
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicy,
  merchantPolicy,
  newBaseZodSelectSchemaColumns,
  notNullStringForeignKey,
  ommittedColumnsForInsertSchema,
  type SelectConditions,
  tableBase,
} from '@/db/tableUtils'
import { DestinationEnvironment, IntervalUnit } from '@/types'
import core from '@/utils/core'
import { buildSchemas } from '../createZodSchemas'

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
    integrationGuideHash: text('integration_guide_hash'),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.name]),
      enableCustomerReadPolicy(
        `Enable read for customers (${TABLE_NAME})`,
        {
          using: sql`"id" in (select "pricing_model_id" from "customers") OR ("is_default" = true AND "organization_id" = current_organization_id())`,
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

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
} as const

const hiddenColumns = {
  integrationGuideHash: true,
  ...hiddenColumnsForClientSchema,
} as const

export const {
  select: pricingModelsSelectSchema,
  insert: pricingModelsInsertSchema,
  update: pricingModelsUpdateSchema,
  client: {
    select: pricingModelsClientSelectSchema,
    insert: pricingModelsClientInsertSchema,
    update: pricingModelsClientUpdateSchema,
  },
} = buildSchemas(pricingModels, {
  client: {
    hiddenColumns,
    readOnlyColumns,
  },
  entityName: 'PricingModel',
})

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
  pricingModel: pricingModelsClientInsertSchema.extend({
     
    name: z.string().min(1, "pricing model name is required"),
     
    isDefault: z.boolean().default(true),
  }),
   
  defaultPlanIntervalUnit: core.createSafeZodEnum(IntervalUnit),
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
