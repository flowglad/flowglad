import { sql } from 'drizzle-orm'
import { boolean, pgTable, text } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { buildSchemas } from '../createZodSchemas'
import {
  constructIndex,
  constructUniqueIndex,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  notNullStringForeignKey,
  orgIdEqualsCurrentSQL,
  type SelectConditions,
  tableBase,
} from '../tableUtils'
import { organizations } from './organizations'
import { pricingModels } from './pricingModels'

const TABLE_NAME = 'resources'

export const resources = pgTable(
  TABLE_NAME,
  {
    ...tableBase('resource'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    constructUniqueIndex(TABLE_NAME, [
      table.organizationId,
      table.slug,
      table.pricingModelId,
    ]),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        for: 'all',
        using: orgIdEqualsCurrentSQL(),
      }
    ),
    enableCustomerReadPolicy(
      `Enable read for customers (${TABLE_NAME})`,
      {
        using: sql`"organization_id" = current_organization_id() and "active" = true and "pricing_model_id" in (select "pricing_model_id" from "customers")`,
      }
    ),
  ])
).enableRLS()

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

export const {
  select: resourcesSelectSchema,
  insert: resourcesInsertSchema,
  update: resourcesUpdateSchema,
  client: {
    select: resourcesClientSelectSchema,
    insert: resourcesClientInsertSchema,
    update: resourcesClientUpdateSchema,
  },
} = buildSchemas(resources, {
  client: {
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
  },
  entityName: 'Resource',
})

export namespace Resource {
  export type Insert = z.infer<typeof resourcesInsertSchema>
  export type Update = z.infer<typeof resourcesUpdateSchema>
  export type Record = z.infer<typeof resourcesSelectSchema>
  export type ClientInsert = z.infer<
    typeof resourcesClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof resourcesClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof resourcesClientSelectSchema
  >
  export type Where = SelectConditions<typeof resources>
}

export const createResourceSchema = z.object({
  resource: resourcesClientInsertSchema,
})

export type CreateResourceInput = z.infer<typeof createResourceSchema>

export const editResourceSchema = z.object({
  id: z.string(),
  resource: resourcesClientUpdateSchema,
})

export type EditResourceInput = z.infer<typeof editResourceSchema>
