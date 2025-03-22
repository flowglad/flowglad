import { boolean, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import {
  constructIndex,
  constructUniqueIndex,
  enhancedCreateInsertSchema,
  createUpdateSchema,
  notNullStringForeignKey,
  tableBase,
  createSupabaseWebhookSchema,
  livemodePolicy,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
  nullableStringForeignKey,
} from '@/db/tableUtils'
import {
  organizations,
  billingAddressSchema,
} from '@/db/schema/organizations'
import { createInvoiceNumberBase } from '@/utils/core'
import { z } from 'zod'
import { users } from './users'
import { catalogs } from './catalogs'

const TABLE_NAME = 'customers'

const columns = {
  ...tableBase('cust'),
  organizationId: notNullStringForeignKey(
    'organization_id',
    organizations
  ),
  email: text('email').notNull(),
  name: text('name').notNull(),
  invoiceNumberBase: text('invoice_number_base').$defaultFn(
    createInvoiceNumberBase
  ),
  archived: boolean('archived').default(false).notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  taxId: text('tax_id'),
  logoURL: text('logo_url'),
  iconURL: text('icon_url'),
  domain: text('domain'),
  billingAddress: jsonb('billing_address'),
  externalId: text('external_id').notNull(),
  userId: nullableStringForeignKey('user_id', users),
  catalogId: nullableStringForeignKey('catalog_id', catalogs),
}

export const customers = pgTable(TABLE_NAME, columns, (table) => {
  return [
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.email, table.organizationId]),
    constructIndex(TABLE_NAME, [table.userId]),
    constructUniqueIndex(TABLE_NAME, [
      table.organizationId,
      table.email,
    ]),
    constructIndex(TABLE_NAME, [table.catalogId]),
    constructUniqueIndex(TABLE_NAME, [
      table.organizationId,
      table.externalId,
    ]),
    constructUniqueIndex(TABLE_NAME, [
      table.organizationId,
      table.invoiceNumberBase,
    ]),
    constructUniqueIndex(TABLE_NAME, [table.stripeCustomerId]),
    livemodePolicy(),
  ]
})

const readonlyColumns = {
  livemode: true,
  billingAddress: true,
  invoiceNumberBase: true,
  organizationId: true,
} as const

const hiddenColumns = {
  stripeCustomerId: true,
  taxId: true,
} as const

const nonClientEditableColumns = {
  ...hiddenColumns,
  ...readonlyColumns,
} as const

const zodSchemaEnhancementColumns = {
  billingAddress: billingAddressSchema.nullable(),
}

export const customersSelectSchema = createSelectSchema(
  customers,
  zodSchemaEnhancementColumns
)

export const customersInsertSchema = enhancedCreateInsertSchema(
  customers,
  zodSchemaEnhancementColumns
)

export const customersUpdateSchema = createUpdateSchema(
  customers,
  zodSchemaEnhancementColumns
)

export const customerClientInsertSchema = customersInsertSchema.omit(
  nonClientEditableColumns
)

export const customerClientUpdateSchema = customersUpdateSchema.omit(
  nonClientEditableColumns
)

export const customerClientSelectSchema =
  customersSelectSchema.omit(hiddenColumns)

const supabaseSchemas = createSupabaseWebhookSchema({
  table: customers,
  tableName: TABLE_NAME,
  refine: zodSchemaEnhancementColumns,
})

export const customersSupabaseInsertPayloadSchema =
  supabaseSchemas.supabaseInsertPayloadSchema

export const customersSupabaseUpdatePayloadSchema =
  supabaseSchemas.supabaseUpdatePayloadSchema

export const editCustomerInputSchema = z.object({
  customer: customerClientUpdateSchema,
  externalId: z.string(),
})

export const editCustomerOutputSchema = z.object({
  customer: customerClientSelectSchema,
})

export const customersPaginatedSelectSchema =
  createPaginatedSelectSchema(customersSelectSchema)

export const customersPaginatedListSchema =
  createPaginatedListQuerySchema<
    z.infer<typeof customersSelectSchema>
  >(customersSelectSchema)

export namespace Customer {
  export type Insert = z.infer<typeof customersInsertSchema>
  export type Update = z.infer<typeof customersUpdateSchema>
  export type Record = z.infer<typeof customersSelectSchema>
  export type ClientInsert = z.infer<
    typeof customerClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof customerClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof customerClientSelectSchema
  >
  export type PaginatedList = z.infer<
    typeof customersPaginatedListSchema
  >

  export type CreateInput = z.infer<typeof customerClientInsertSchema>

  export type CreateOutput = z.infer<
    typeof customerClientSelectSchema
  >

  export type EditInput = z.infer<typeof editCustomerInputSchema>
  export type EditOutput = z.infer<typeof editCustomerOutputSchema>
}

export enum InferredCustomerStatus {
  Active = 'active',
  Archived = 'archived',
  Pending = 'pending',
  Concluded = 'concluded',
  PastDue = 'past_due',
}

export interface CustomerTableRowData {
  customer: Customer.ClientRecord
  totalSpend?: number
  payments?: number
  status: InferredCustomerStatus
}
