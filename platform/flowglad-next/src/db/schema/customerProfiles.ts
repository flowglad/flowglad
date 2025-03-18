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
  Customer,
  billingAddressSchema,
  customers,
} from '@/db/schema/customers'
import { organizations } from '@/db/schema/organizations'
import { createInvoiceNumberBase } from '@/utils/core'
import { z } from 'zod'
import { users } from './users'

const TABLE_NAME = 'customer_profiles'

const columns = {
  ...tableBase('cpf'),
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
  customerTaxId: text('customer_tax_id'),
  slackId: text('slack_id'),
  logoURL: text('logo_url'),
  iconURL: text('icon_url'),
  domain: text('domain'),
  billingAddress: jsonb('billing_address'),
  externalId: text('external_id').notNull(),
  userId: nullableStringForeignKey('user_id', users),
}

export const customerProfiles = pgTable(
  TABLE_NAME,
  columns,
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.email, table.organizationId]),
      constructIndex(TABLE_NAME, [table.userId]),
      constructUniqueIndex(TABLE_NAME, [
        table.organizationId,
        table.email,
      ]),
      constructUniqueIndex(TABLE_NAME, [
        table.organizationId,
        table.externalId,
      ]),
      constructUniqueIndex(TABLE_NAME, [
        table.organizationId,
        table.invoiceNumberBase,
      ]),
      constructUniqueIndex(TABLE_NAME, [table.stripeCustomerId]),
      constructIndex(TABLE_NAME, [table.slackId]),
      livemodePolicy(),
    ]
  }
)

const readonlyColumns = {
  livemode: true,
  billingAddress: true,
  invoiceNumberBase: true,
  organizationId: true,
} as const

const hiddenColumns = {
  stripeCustomerId: true,
  customerTaxId: true,
  slackId: true,
} as const

const nonClientEditableColumns = {
  ...hiddenColumns,
  ...readonlyColumns,
} as const

const zodSchemaEnhancementColumns = {
  billingAddress: billingAddressSchema.nullable(),
}

export const customerProfilesSelectSchema = createSelectSchema(
  customerProfiles,
  zodSchemaEnhancementColumns
)

export const customerProfilesInsertSchema =
  enhancedCreateInsertSchema(
    customerProfiles,
    zodSchemaEnhancementColumns
  )

export const customerProfilesUpdateSchema = createUpdateSchema(
  customerProfiles,
  zodSchemaEnhancementColumns
)

export const customerProfileClientInsertSchema =
  customerProfilesInsertSchema.omit(nonClientEditableColumns)

export const customerProfileClientUpdateSchema =
  customerProfilesUpdateSchema.omit(nonClientEditableColumns)

export const customerProfileClientSelectSchema =
  customerProfilesSelectSchema.omit(hiddenColumns)

const supabaseSchemas = createSupabaseWebhookSchema({
  table: customerProfiles,
  tableName: TABLE_NAME,
  refine: zodSchemaEnhancementColumns,
})

export const customerProfilesSupabaseInsertPayloadSchema =
  supabaseSchemas.supabaseInsertPayloadSchema

export const customerProfilesSupabaseUpdatePayloadSchema =
  supabaseSchemas.supabaseUpdatePayloadSchema

export const editCustomerProfileInputSchema = z.object({
  customerProfile: customerProfileClientUpdateSchema,
  externalId: z.string(),
})

export const editCustomerProfileOutputSchema = z.object({
  customerProfile: customerProfileClientSelectSchema,
})

export const customerProfilesPaginatedSelectSchema =
  createPaginatedSelectSchema(customerProfilesSelectSchema)

export const customerProfilesPaginatedListSchema =
  createPaginatedListQuerySchema<
    z.infer<typeof customerProfilesSelectSchema>
  >(customerProfilesSelectSchema)

export namespace CustomerProfile {
  export type Insert = z.infer<typeof customerProfilesInsertSchema>
  export type Update = z.infer<typeof customerProfilesUpdateSchema>
  export type Record = z.infer<typeof customerProfilesSelectSchema>
  export type ClientInsert = z.infer<
    typeof customerProfileClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof customerProfileClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof customerProfileClientSelectSchema
  >
  export type PaginatedList = z.infer<
    typeof customerProfilesPaginatedListSchema
  >

  export type CreateInput = z.infer<
    typeof customerProfileClientInsertSchema
  >

  export type CreateOutput = z.infer<
    typeof customerProfileClientSelectSchema
  >

  export type EditInput = z.infer<
    typeof editCustomerProfileInputSchema
  >
  export type EditOutput = z.infer<
    typeof editCustomerProfileOutputSchema
  >
}

export enum InferredCustomerProfileStatus {
  Active = 'active',
  Archived = 'archived',
  Pending = 'pending',
  Concluded = 'concluded',
  PastDue = 'past_due',
}

export interface CustomerTableRowData {
  customerProfile: CustomerProfile.ClientRecord
  totalSpend?: number
  payments?: number
  status: InferredCustomerProfileStatus
}
