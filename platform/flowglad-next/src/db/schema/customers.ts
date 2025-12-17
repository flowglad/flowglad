import { sql } from 'drizzle-orm'
import { boolean, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import {
  billingAddressSchema,
  organizations,
} from '@/db/schema/organizations'
import {
  constructGinIndex,
  constructIndex,
  constructUniqueIndex,
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  createSupabaseWebhookSchema,
  enableCustomerReadPolicy,
  livemodePolicy,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  type SelectConditions,
  tableBase,
} from '@/db/tableUtils'
import { createInvoiceNumberBase } from '@/utils/core'
import { buildSchemas } from '../createZodSchemas'
import { pricingModels } from './pricingModels'
import { users } from './users'

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
  pricingModelId: nullableStringForeignKey(
    'pricing_model_id',
    pricingModels
  ),
  stackAuthHostedBillingUserId: text(
    'stack_auth_hosted_billing_user_id'
  ),
}

export const customers = pgTable(TABLE_NAME, columns, (table) => {
  return [
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [
      table.email,
      table.organizationId,
      table.livemode,
    ]),
    constructIndex(TABLE_NAME, [table.userId]),
    /**
     * Cannot have a unique index on email, because Stripe can have multiple
     * customers with the same email address, and this constraint at the DB
     * would break migrations from Stripe to Flowglad.
     */
    // constructUniqueIndex(TABLE_NAME, [
    //   table.organizationId,
    //   table.email,
    //   table.livemode,
    // ]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    constructUniqueIndex(TABLE_NAME, [
      table.organizationId,
      table.externalId,
      table.livemode,
    ]),
    constructUniqueIndex(TABLE_NAME, [
      table.organizationId,
      table.invoiceNumberBase,
      table.livemode,
    ]),
    constructUniqueIndex(TABLE_NAME, [table.stripeCustomerId]),
    constructGinIndex(TABLE_NAME, table.email),
    constructGinIndex(TABLE_NAME, table.name),
    merchantPolicy('Enable all actions for own organizations', {
      as: 'permissive',
      to: 'merchant',
      for: 'all',
      using: sql`"organization_id" in (select "organization_id" from "memberships")`,
    }),
    enableCustomerReadPolicy(
      `Enable read for customers (${TABLE_NAME})`,
      {
        using: sql`"user_id" = requesting_user_id() AND "organization_id" = current_organization_id()`,
      }
    ),
    merchantPolicy('Disallow deletion', {
      as: 'restrictive',
      to: 'merchant',
      for: 'delete',
      using: sql`false`,
    }),
    livemodePolicy(TABLE_NAME),
  ]
}).enableRLS()

const readOnlyColumns = {
  livemode: true,
  billingAddress: true,
  invoiceNumberBase: true,
  organizationId: true,
} as const

const hiddenColumns = {
  stripeCustomerId: true,
  taxId: true,
  stackAuthHostedBillingUserId: true,
} as const

const zodSchemaEnhancementColumns = {
  billingAddress: billingAddressSchema.nullable().optional(),
}

export const {
  insert: customersInsertSchema,
  select: customersSelectSchema,
  update: customersUpdateSchema,
  client: {
    select: customerClientSelectSchema,
    insert: customerClientInsertSchema,
    update: customerClientUpdateSchema,
  },
} = buildSchemas(customers, {
  refine: zodSchemaEnhancementColumns,
  client: {
    hiddenColumns,
    readOnlyColumns,
  },
  entityName: 'Customer',
})

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
  customer: customerClientUpdateSchema.omit({
    externalId: true,
    id: true,
    pricingModelId: true,
  }),
  externalId: z.string(),
})

export const editCustomerOutputSchema = z.object({
  customer: customerClientSelectSchema,
})

export const customersPaginatedSelectSchema =
  createPaginatedSelectSchema(customerClientSelectSchema)

export const customersPaginatedListSchema =
  createPaginatedListQuerySchema(customerClientSelectSchema)

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

  export type Where = SelectConditions<typeof customers>
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

export const requestBillingPortalLinkSchema = z.object({
  customerId: z.string(),
  organizationId: z.string(),
  email: z.string().email(),
})

export type RequestBillingPortalLinkInput = z.infer<
  typeof requestBillingPortalLinkSchema
>

export const customersPaginatedTableRowInputSchema =
  createPaginatedTableRowInputSchema(
    z.object({
      archived: z.boolean().optional(),
      organizationId: z.string().optional(),
      pricingModelId: z.string().optional(),
      livemode: z.boolean().optional(),
    })
  )

export type CustomersPaginatedTableRowInput = z.infer<
  typeof customersPaginatedTableRowInputSchema
>

export const customersPaginatedTableRowDataSchema = z.object({
  customer: customerClientSelectSchema,
  totalSpend: z.number().optional(),
  payments: z.number().optional(),
  status: z.nativeEnum(InferredCustomerStatus),
})

export const customersPaginatedTableRowOutputSchema =
  createPaginatedTableRowOutputSchema(
    customersPaginatedTableRowDataSchema
  )

export type CustomersPaginatedTableRowOutput = z.infer<
  typeof customersPaginatedTableRowOutputSchema
>
