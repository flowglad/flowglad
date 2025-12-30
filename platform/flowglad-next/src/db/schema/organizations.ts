import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
} from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import * as R from 'ramda'
import { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import { countries } from '@/db/schema/countries'
import {
  clientWriteOmitsConstructor,
  constructIndex,
  constructUniqueIndex,
  hiddenColumnsForClientSchema,
  merchantPolicy,
  merchantRole,
  newBaseZodSelectSchemaColumns,
  notNullStringForeignKey,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
} from '@/db/tableUtils'
import {
  BusinessOnboardingStatus,
  CurrencyCode,
  StripeConnectContractType,
} from '@/types'
import { generateRandomBytes } from '@/utils/backendCore'
import core, { zodOptionalNullableString } from '@/utils/core'

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
    feePercentage: text('fee_percentage').notNull().default('0.65'),
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
    externalId: text('external_id').unique(),
    securitySalt: text('security_salt')
      .$defaultFn(() => nanoid(128))
      .notNull(),
    monthlyBillingVolumeFreeTier: integer(
      'monthly_billing_volume_free_tier'
    )
      .notNull()
      .default(100000),
    upfrontProcessingCredits: integer('upfront_processing_credits')
      .notNull()
      .default(0),
    codebaseMarkdownHash: text('codebase_markdown_hash'),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.name]),
      constructUniqueIndex(TABLE_NAME, [table.stripeAccountId]),
      constructUniqueIndex(TABLE_NAME, [table.domain]),
      constructUniqueIndex(TABLE_NAME, [table.externalId]),
      constructIndex(TABLE_NAME, [table.countryId]),
      merchantPolicy(
        `Enable read for own organizations (${TABLE_NAME})`,
        {
          as: 'permissive',
          for: 'select',
          using: sql`id IN ( SELECT memberships.organization_id
   FROM memberships
  WHERE (memberships.user_id = requesting_user_id() and memberships.organization_id = current_organization_id()))`,
        }
      ),
    ]
  }
).enableRLS()

const billingAddressSchemaColumns = {
  name: zodOptionalNullableString,
  firstName: zodOptionalNullableString,
  lastName: zodOptionalNullableString,
  email: z.email().nullable().optional(),
  address: z.object({
    name: zodOptionalNullableString,
    line1: zodOptionalNullableString,
    line2: zodOptionalNullableString,
    city: zodOptionalNullableString,
    state: zodOptionalNullableString,
    postal_code: zodOptionalNullableString,
    country: z.string(),
  }),
  phone: zodOptionalNullableString,
}

export const billingAddressSchema = z
  .object(billingAddressSchemaColumns)
  .meta({
    id: 'BillingAddress',
  })

export type BillingAddress = z.infer<typeof billingAddressSchema>

// Column refinements for both SELECT and INSERT schemas
const commonColumnRefinements = {
  onboardingStatus: core.createSafeZodEnum(BusinessOnboardingStatus),
  defaultCurrency: core.createSafeZodEnum(CurrencyCode),
  billingAddress: billingAddressSchema.nullable().optional(),
  contactEmail: z.email().nullable().optional(),
  featureFlags: z.record(z.string(), z.boolean()),
  stripeConnectContractType: z.nativeEnum(StripeConnectContractType),
  monthlyBillingVolumeFreeTier: core.safeZodNonNegativeInteger,
}

export const {
  select: organizationsSelectSchema,
  insert: organizationsInsertSchema,
  update: organizationsUpdateSchema,
  client: {
    select: organizationsClientSelectSchema,
    insert: organizationsClientInsertSchema,
    update: organizationsClientUpdateSchema,
  },
} = buildSchemas(organizations, {
  refine: commonColumnRefinements,
  insertRefine: {
    monthlyBillingVolumeFreeTier:
      core.safeZodNonNegativeInteger.optional(),
    stripeConnectContractType: z
      .nativeEnum(StripeConnectContractType)
      .optional(),
  },
  client: {
    hiddenColumns: {
      feePercentage: true,
      stripeAccountId: true,
      externalId: true,
      ...hiddenColumnsForClientSchema,
      securitySalt: true,
      upfrontProcessingCredits: true,
      codebaseMarkdownHash: true,
    },
    readOnlyColumns: {
      stripeAccountId: true,
      payoutsEnabled: true,
      onboardingStatus: true,
      subdomainSlug: true,
      domain: true,
      tagline: true,
      defaultCurrency: true,
      featureFlags: true,
    },
    createOnlyColumns: {
      stripeConnectContractType: true,
    },
  },
  entityName: 'Organization',
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
  export type Where = SelectConditions<typeof organizations>
}

export const createOrganizationSchema = z.object({
  organization: organizationsClientInsertSchema,
  codebaseMarkdown: z.string().optional(),
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

export const updateFocusedMembershipSchema = z.object({
  organizationId: z.string(),
})

export type UpdateFocusedMembershipInput = z.infer<
  typeof updateFocusedMembershipSchema
>
