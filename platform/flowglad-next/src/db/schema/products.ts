import {
  pgPolicy,
  pgTable,
  text,
  boolean,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import {
  constructIndex,
  newBaseZodSelectSchemaColumns,
  tableBase,
  notNullStringForeignKey,
  createSupabaseWebhookSchema,
  livemodePolicy,
  ommittedColumnsForInsertSchema,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
  nullableStringForeignKey,
  constructUniqueIndex,
  SelectConditions,
  hiddenColumnsForClientSchema,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { catalogs } from './catalogs'

const PRODUCTS_TABLE_NAME = 'products'

const columns = {
  ...tableBase('prod'),
  name: text('name').notNull(),
  description: text('description'),
  imageURL: text('image_url'),
  organizationId: notNullStringForeignKey(
    'organization_id',
    organizations
  ),
  displayFeatures: jsonb('display_features'),
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
  catalogId: nullableStringForeignKey(
    'catalog_id',
    catalogs
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
  PRODUCTS_TABLE_NAME,
  columns,
  (table) => {
    return [
      constructIndex(PRODUCTS_TABLE_NAME, [table.organizationId]),
      constructIndex(PRODUCTS_TABLE_NAME, [table.active]),
      constructUniqueIndex(PRODUCTS_TABLE_NAME, [table.externalId]),
      constructUniqueIndex(PRODUCTS_TABLE_NAME, [
        table.catalogId,
        table.slug,
      ]),
      uniqueIndex('products_catalog_id_default_unique_idx')
        .on(table.catalogId)
        .where(sql`${table.default}`),
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

const displayFeatureSchema = z.object({
  enabled: z.boolean(),
  label: z.string(),
  details: z.string().nullish(),
})

const refinement = {
  ...newBaseZodSelectSchemaColumns,
  name: z.string(),
  active: z.boolean(),
  displayFeatures: z.array(displayFeatureSchema).nullable(),
}

export const rawProductsSelectSchema = createSelectSchema(
  products,
  refinement
)

export const productsSelectSchema =
  rawProductsSelectSchema.extend(refinement)

export const productsInsertSchema = productsSelectSchema.omit(
  ommittedColumnsForInsertSchema
)

export const productsUpdateSchema = productsInsertSchema
  .partial()
  .extend({
    id: z.string(),
  })

const createOnlyColumns = {
  catalogId: true,
} as const

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
} as const

const hiddenColumns = {
  externalId: true,
} as const

const nonClientEditableColumns = {
  ...readOnlyColumns,
  ...hiddenColumns,
} as const

export const productsClientSelectSchema = productsSelectSchema
  .omit(hiddenColumns)
  .omit(hiddenColumnsForClientSchema)

export const productsClientInsertSchema = productsInsertSchema.omit(
  nonClientEditableColumns
)

export const productsClientUpdateSchema = productsUpdateSchema.omit({
  ...nonClientEditableColumns,
  ...createOnlyColumns,
})

const { supabaseInsertPayloadSchema, supabaseUpdatePayloadSchema } =
  createSupabaseWebhookSchema({
    table: products,
    tableName: PRODUCTS_TABLE_NAME,
    refine: refinement,
  })

export const productsSupabaseInsertPayloadSchema =
  supabaseInsertPayloadSchema
export const productsSupabaseUpdatePayloadSchema =
  supabaseUpdatePayloadSchema

export const productsPaginatedSelectSchema =
  createPaginatedSelectSchema(productsClientSelectSchema)

export const productsPaginatedListSchema =
  createPaginatedListQuerySchema(productsClientSelectSchema)

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
