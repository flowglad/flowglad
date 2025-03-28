import * as R from 'ramda'
import { z } from 'zod'
import { pgTable, text, boolean, jsonb } from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import {
  enhancedCreateInsertSchema,
  pgEnumColumn,
  constructIndex,
  constructUniqueIndex,
  tableBase,
  newBaseZodSelectSchemaColumns,
  notNullStringForeignKey,
} from '@/db/tableUtils'
import { countries } from '@/db/schema/countries'
import core from '@/utils/core'
import {
  BusinessOnboardingStatus,
  CurrencyCode,
  StripeConnectContractType,
} from '@/types'

const TABLE_NAME = 'organizations'

export const organizations = pgTable(
  TABLE_NAME,
  {
    ...R.omit(['livemode'], tableBase('org')),
    name: text('name').notNull(),
    stripeAccountId: text('stripe_account_id').unique(),
    domain: text('domain').unique(),
    countryId: notNullStringForeignKey('country_id', countries),
    logoURL: text('logo_url'),
    tagline: text('tagline'),
    subdomainSlug: text('subdomain_slug').unique(),
    payoutsEnabled: boolean('payouts_enabled')
      .notNull()
      .default(false),
    onboardingStatus: pgEnumColumn({
      enumName: 'BusinessOnboardingStatus',
      columnName: 'onboarding_status',
      enumBase: BusinessOnboardingStatus,
    }),
    feePercentage: text('fee_percentage').notNull().default('3.00'),
    defaultCurrency: pgEnumColumn({
      enumName: 'CurrencyCode',
      columnName: 'default_currency',
      enumBase: CurrencyCode,
    }).notNull(),
    billingAddress: jsonb('billing_address'),
    contactEmail: text('contact_email'),
    stripeConnectContractType: pgEnumColumn({
      enumName: 'StripeConnectContractType',
      columnName: 'stripe_connect_contract_type',
      enumBase: StripeConnectContractType,
    })
      .notNull()
      .default(StripeConnectContractType.Platform),
    allowMultipleSubscriptionsPerCustomer: boolean(
      'allow_multiple_subscriptions_per_customer'
    ).default(false),
    featureFlags: jsonb('feature_flags').default({}),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.name]),
      constructUniqueIndex(TABLE_NAME, [table.stripeAccountId]),
      constructUniqueIndex(TABLE_NAME, [table.domain]),
      constructIndex(TABLE_NAME, [table.countryId]),
    ]
  }
).enableRLS()

const billingAddressSchemaColumns = {
  name: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  address: z.object({
    line1: z.string(),
    line2: z.string().nullable(),
    city: z.string(),
    state: z.string(),
    postal_code: z.string(),
    country: z.string(),
  }),
  phone: z.string().optional(),
}

export const billingAddressSchema = z.object(
  billingAddressSchemaColumns
)

export type BillingAddress = z.infer<typeof billingAddressSchema>

const columnRefinements = {
  onboardingStatus: core.createSafeZodEnum(BusinessOnboardingStatus),
  defaultCurrency: core.createSafeZodEnum(CurrencyCode),
  billingAddress: billingAddressSchema,
  contactEmail: z.string().email().nullable(),
  featureFlags: z.record(z.string(), z.boolean()),
}

export const organizationsSelectSchema = createSelectSchema(
  organizations,
  {
    ...newBaseZodSelectSchemaColumns,
    ...columnRefinements,
  }
)

export const organizationsInsertSchema = enhancedCreateInsertSchema(
  organizations,
  columnRefinements
)

export const organizationsUpdateSchema = organizationsInsertSchema
  .partial()
  .extend({
    id: z.string(),
  })

const hiddenColumns = {
  feePercentage: true,
  stripeAccountId: true,
  stripeConnectContractType: true,
} as const

const readOnlyColumns = {
  stripeAccountId: true,
  payoutsEnabled: true,
  onboardingStatus: true,
  subdomainSlug: true,
  domain: true,
  tagline: true,
  defaultCurrency: true,
  featureFlags: true,
} as const

export const organizationsClientSelectSchema =
  organizationsSelectSchema.omit(hiddenColumns)

export const organizationsClientUpdateSchema =
  organizationsUpdateSchema.omit({
    ...hiddenColumns,
    ...readOnlyColumns,
  })

export const organizationsClientInsertSchema =
  organizationsInsertSchema.omit({
    ...hiddenColumns,
    ...readOnlyColumns,
  })

export namespace Organization {
  export type Insert = z.infer<typeof organizationsInsertSchema>
  export type Update = z.infer<typeof organizationsUpdateSchema>
  export type Record = z.infer<typeof organizationsSelectSchema>
  export type ClientInsert = z.infer<
    typeof organizationsClientInsertSchema
  >
  export type ClientRecord = z.infer<
    typeof organizationsClientSelectSchema
  >
  export type ClientUpdate = z.infer<
    typeof organizationsClientUpdateSchema
  >
}

export const createOrganizationSchema = z.object({
  organization: organizationsClientInsertSchema,
})

export type CreateOrganizationInput = z.infer<
  typeof createOrganizationSchema
>

export const editOrganizationSchema = z.object({
  organization: organizationsClientUpdateSchema,
})

export type EditOrganizationInput = z.infer<
  typeof editOrganizationSchema
>
