import { z } from 'zod'
import {
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { createSelectSchema } from 'drizzle-zod'
import {
  nullableStringForeignKey,
  pgEnumColumn,
  enhancedCreateInsertSchema,
  constructIndex,
  tableBase,
  newBaseZodSelectSchemaColumns,
  notNullStringForeignKey,
  livemodePolicy,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { users } from '@/db/schema/users'
import { IntegrationMethod, IntegrationStatus } from '@/types'
import core from '@/utils/core'

const TABLE_NAME = 'integrations'

export const integrations = pgTable(
  TABLE_NAME,
  {
    ...tableBase('integration'),
    UserId: nullableStringForeignKey('user_id', users),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    provider: text('provider').notNull(),
    method: pgEnumColumn({
      enumName: 'IntegrationMethod',
      columnName: 'method',
      enumBase: IntegrationMethod,
    }).notNull(),
    encryptedAccessToken: text('encrypted_access_token'),
    encryptedRefreshToken: text('encrypted_refresh_token'),
    encryptedApiKey: text('encrypted_api_key'),
    status: pgEnumColumn({
      enumName: 'IntegrationStatus',
      columnName: 'status',
      enumBase: IntegrationStatus,
    }).notNull(),
    scope: text('scope'), // Store granted scopes
    tokenExpiresAt: timestamp('token_expires_at'),
    lastTokenRefresh: timestamp('last_token_refresh'),
    providerConfig: jsonb('provider_config'), // JSON string of additional provider settings
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.UserId]),
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.provider]),
      constructIndex(TABLE_NAME, [table.status]),
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"organization_id" in (select "organization_id" from "memberships") OR "user_id" = requesting_user_id()`,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

const integrationRefinementColumns = {
  UserId: z.string().nullable(),
  method: core.createSafeZodEnum(IntegrationMethod),
  status: core.createSafeZodEnum(IntegrationStatus),
}

const readOnlyColumns = {
  organizationId: true,
  UserId: true,
  status: true,
  method: true,
  livemode: true,
} as const

const baseIntegrationsSelectSchema = createSelectSchema(
  integrations
).extend({
  ...newBaseZodSelectSchemaColumns,
  ...integrationRefinementColumns,
})

const oauthRefinements = {
  method: z.literal(IntegrationMethod.OAuth),
  encryptedAccessToken: z.string(),
  encryptedRefreshToken: z.string().nullable(),
  tokenExpiresAt: core.safeZodDate.nullable(),
  lastTokenRefresh: core.safeZodDate.nullable(),
  scope: z.string().nullable(),
  encryptedApiKey: z.null(),
}

const apiKeyRefinements = {
  method: z.literal(IntegrationMethod.ApiKey),
  encryptedApiKey: z.string(),
  encryptedAccessToken: z.null(),
  encryptedRefreshToken: z.null(),
  tokenExpiresAt: z.null(),
  lastTokenRefresh: z.null(),
  scope: z.null(),
}

export const oauthIntegrationsSelectSchema =
  baseIntegrationsSelectSchema.extend(oauthRefinements)

export const apiIntegrationsSelectSchema =
  baseIntegrationsSelectSchema.extend(apiKeyRefinements)

export const integrationsSelectSchema = z.discriminatedUnion(
  'method',
  [oauthIntegrationsSelectSchema, apiIntegrationsSelectSchema]
)

const createOnlyColumns = {
  provider: true,
} as const

const hiddenColumns = {
  scope: true,
  encryptedAccessToken: true,
  encryptedRefreshToken: true,
  encryptedApiKey: true,
  tokenExpiresAt: true,
  lastTokenRefresh: true,
  providerConfig: true,
} as const

export const oauthIntegrationsClientSelectSchema =
  oauthIntegrationsSelectSchema.omit(hiddenColumns)

export const apiIntegrationsClientSelectSchema =
  apiIntegrationsSelectSchema.omit(hiddenColumns)

export const integrationsClientSelectSchema = z.discriminatedUnion(
  'method',
  [
    oauthIntegrationsClientSelectSchema,
    apiIntegrationsClientSelectSchema,
  ]
)

const baseIntegrationsInsertSchema = enhancedCreateInsertSchema(
  integrations,
  integrationRefinementColumns
).extend(integrationRefinementColumns)

export const oauthIntegrationsInsertSchema =
  baseIntegrationsInsertSchema.extend({
    method: z.literal(IntegrationMethod.OAuth),
    encryptedAccessToken: z.string(),
    /**
     * Some oauth providers don't return a refresh token,
     * e.g. Github and Slack.
     */
    encryptedRefreshToken: z.string().nullable(),
    encryptedApiKey: z.null(),
  })

export const apiIntegrationsInsertSchema =
  baseIntegrationsInsertSchema.extend({
    method: z.literal(IntegrationMethod.ApiKey),
    encryptedApiKey: z.string(),
    encryptedAccessToken: z.null(),
    encryptedRefreshToken: z.null(),
  })

export const integrationsInsertSchema = z.discriminatedUnion(
  'method',
  [oauthIntegrationsInsertSchema, apiIntegrationsInsertSchema]
)

const apiIntegrationsClientInsertSchema =
  apiIntegrationsInsertSchema.omit({
    ...hiddenColumns,
    ...createOnlyColumns,
  })

const oauthIntegrationsClientInsertSchema =
  oauthIntegrationsInsertSchema.omit({
    ...hiddenColumns,
    ...createOnlyColumns,
  })

export const integrationsClientInsertSchema = z.discriminatedUnion(
  'method',
  [
    oauthIntegrationsClientInsertSchema,
    apiIntegrationsClientInsertSchema,
  ]
)

export const oauthIntegrationsUpdateSchema =
  oauthIntegrationsInsertSchema.partial().extend({
    id: z.string(),
    method: z.literal(IntegrationMethod.OAuth),
  })

export const apiIntegrationsUpdateSchema = apiIntegrationsInsertSchema
  .partial()
  .extend({
    id: z.string(),
    method: z.literal(IntegrationMethod.ApiKey),
  })

export const integrationsUpdateSchema = z.discriminatedUnion(
  'method',
  [oauthIntegrationsUpdateSchema, apiIntegrationsUpdateSchema]
)

export const integrationsClientUpdateSchema = z.discriminatedUnion(
  'method',
  [oauthIntegrationsUpdateSchema, apiIntegrationsUpdateSchema]
)

export namespace Integration {
  export type Insert = z.infer<typeof integrationsInsertSchema>
  export type Update = z.infer<typeof integrationsUpdateSchema>
  export type Record = z.infer<typeof integrationsSelectSchema>
  export type ClientInsert = z.infer<
    typeof integrationsClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof integrationsClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof integrationsClientSelectSchema
  >
}

export const createIntegrationInputSchema = z.object({
  integration: integrationsClientInsertSchema,
})

export type CreateIntegrationInput = z.infer<
  typeof createIntegrationInputSchema
>

export const editIntegrationInputSchema = z.object({
  integration: integrationsUpdateSchema,
})

export type EditIntegrationInput = z.infer<
  typeof editIntegrationInputSchema
>
