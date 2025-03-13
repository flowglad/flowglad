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
} from '@/db/tableUtils'
import {
  Customer,
  billingAddressSchema,
  customers,
} from '@/db/schema/customers'
import { organizations } from '@/db/schema/organizations'
import { createInvoiceNumberBase } from '@/utils/core'
import { z } from 'zod'

const TABLE_NAME = 'customer_profiles'

const columns = {
  ...tableBase('cpf'),
  customerId: notNullStringForeignKey('customer_id', customers),
  organizationId: notNullStringForeignKey(
    'organization_id',
    organizations
  ),
  email: text('email').notNull(),
  name: text('name'),
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
}

export const customerProfiles = pgTable(
  TABLE_NAME,
  columns,
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.customerId]),
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.email, table.organizationId]),
      constructUniqueIndex(TABLE_NAME, [
        table.customerId,
        table.organizationId,
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
      /**
       * Todo: think  through this policy:
       * - do we want to allow deletes?
       */
      // pgPolicy('Enable read for own customer profiles', {
      //   as: 'permissive',
      //   to: 'authenticated',
      //   for: 'all',
      //   using: sql`"customerId" = requesting_user_id()`,
      // }),
    ]
  }
)

const readonlyColumns = {
  livemode: true,
  customerId: true,
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

export const bulkImportCustomerProfilesObjectSchema = z.object({
  format: z.literal('object'),
  data: z.array(
    z.object({
      name: z.string(),
      email: z.string().email(),
    })
  ),
})

export const bulkImportCustomerProfilesCSVSchema = z.object({
  format: z.literal('csv'),
  csvContent: z.string(),
})

export const bulkImportCustomerProfilesInputSchema =
  z.discriminatedUnion('format', [
    bulkImportCustomerProfilesObjectSchema,
    bulkImportCustomerProfilesCSVSchema,
  ])

export type BulkImportCustomerProfilesInput = z.infer<
  typeof bulkImportCustomerProfilesInputSchema
>

export enum InferredCustomerProfileStatus {
  Active = 'active',
  Archived = 'archived',
  Pending = 'pending',
  Concluded = 'concluded',
  PastDue = 'past_due',
}

export interface CustomerTableRowData {
  customerProfile: CustomerProfile.ClientRecord
  customer: Customer.ClientRecord
  totalSpend?: number
  payments?: number
  status: InferredCustomerProfileStatus
}
