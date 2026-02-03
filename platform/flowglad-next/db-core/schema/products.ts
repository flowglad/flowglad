import { sql } from 'drizzle-orm'
import {
  boolean,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { buildSchemas } from '../createZodSchemas'
import {
  constructIndex,
  constructUniqueIndex,
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  createSupabaseWebhookSchema,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  newBaseZodSelectSchemaColumns,
  notNullStringForeignKey,
  nullableStringForeignKey,
  ommittedColumnsForInsertSchema,
  orgIdEqualsCurrentSQL,
  type SelectConditions,
  tableBase,
} from '../tableUtils'
import { safeZodSanitizedString } from '../utils'
import { organizations } from './organizations'
import { pricingModels } from './pricingModels'

const TABLE_NAME = 'products'

const columns = {
  ...tableBase('prod'),
  name: text('name').notNull(),
  description: text('description'),
  imageURL: text('image_url'),
  organizationId: notNullStringForeignKey(
    'organization_id',
    organizations
  ),
  active: boolean('active').notNull().default(true),
  /**
   * The label to display for the unit of the product in singular form.
   *
   * E.g.
   * "1 seat" => "seat"
   * "1 license" => "license"
   * "1 user" => "user"
   * "1 bot" => "bot"
   */
  singularQuantityLabel: text('singular_quantity_label'),
  /**
   * The label to display for the unit of the product in plural form.
   *
   * E.g.
   * "4 seats" => "seats"
   * "10 licenses" => "licenses"
   * "20 users" => "users"
   * "10 bots" => "bots"
   */
  pluralQuantityLabel: text('plural_quantity_label'),
  pricingModelId: nullableStringForeignKey(
    'pricing_model_id',
    pricingModels
  ).notNull(),
  /**
   * A hidden column, used primarily for managing migrations from
   * from external processors onto Flowglad
   */
  externalId: text('external_id'),
  default: boolean('default').notNull().default(false),
  slug: text('slug'),
}

export const products = pgTable(
  TABLE_NAME,
  columns,
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.active]),
    constructUniqueIndex(TABLE_NAME, [table.externalId]),
    constructUniqueIndex(TABLE_NAME, [
      table.pricingModelId,
      table.slug,
    ]),
    uniqueIndex('products_pricing_model_id_default_unique_idx')
      .on(table.pricingModelId)
      .where(sql`${table.default}`),
    enableCustomerReadPolicy(
      `Enable read for customers (${TABLE_NAME})`,
      {
        using: sql`"organization_id" = current_organization_id() and "active" = true and "pricing_model_id" in (select "pricing_model_id" from "customers")`,
      }
    ),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        to: 'all',
        using: orgIdEqualsCurrentSQL(),
      }
    ),
  ])
).enableRLS()

const refinement = {
  name: z.string(),
  active: z.boolean(),
  slug: safeZodSanitizedString.describe(
    'URL-friendly identifier for the product'
  ),
}

export const {
  select: productsSelectSchema,
  insert: productsInsertSchema,
  update: productsUpdateSchema,
  client: {
    select: productsClientSelectSchema,
    insert: baseClientInsertSchema,
    update: productsClientUpdateSchema,
  },
} = buildSchemas(products, {
  refine: refinement,
  updateRefine: {
    slug: safeZodSanitizedString.optional(),
  },
  client: {
    hiddenColumns: {
      externalId: true,
    },
    createOnlyColumns: {
      pricingModelId: true,
    },
  },
  entityName: 'Product',
})

// Preserve the custom client insert refinement on slug
export const productsClientInsertSchema = baseClientInsertSchema
  .refine(
    (data) => {
      const normalizedSlug = data.slug?.toLowerCase().trim()
      if (normalizedSlug === 'free' && !data.default) {
        return false
      }
      return true
    },
    {
      message: "Slug 'free' is reserved for default products only",
      path: ['slug'],
    }
  )
  .meta({ id: 'ProductInsert' })

const { supabaseInsertPayloadSchema, supabaseUpdatePayloadSchema } =
  createSupabaseWebhookSchema({
    table: products,
    tableName: TABLE_NAME,
    refine: refinement,
  })

export const productsSupabaseInsertPayloadSchema =
  supabaseInsertPayloadSchema

export const productsSupabaseUpdatePayloadSchema =
  supabaseUpdatePayloadSchema

export const productsPaginatedSelectSchema =
  createPaginatedSelectSchema(productsClientSelectSchema).meta({
    id: 'ProductsPaginatedSelect',
  })

export const productsPaginatedListSchema =
  createPaginatedListQuerySchema(productsClientSelectSchema).meta({
    id: 'ProductsPaginatedList',
  })

export namespace Product {
  export type Insert = z.infer<typeof productsInsertSchema>
  export type Update = z.infer<typeof productsUpdateSchema>
  export type Record = z.infer<typeof productsSelectSchema>
  export type ClientInsert = z.infer<
    typeof productsClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof productsClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof productsClientSelectSchema
  >
  export type PaginatedList = z.infer<
    typeof productsPaginatedListSchema
  >
  export type Where = SelectConditions<typeof products>
}
