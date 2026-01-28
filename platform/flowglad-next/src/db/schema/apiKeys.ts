import { sql } from 'drizzle-orm'
import { boolean, pgTable, text } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import * as R from 'ramda'
import { z } from 'zod'
import { organizations } from '@/db/schema/organizations'
import { pricingModels } from '@/db/schema/pricingModels'
import {
  clientWriteOmitsConstructor,
  constructIndex,
  hiddenColumnsForClientSchema,
  idInputSchema,
  livemodePolicyTable,
  merchantPolicy,
  notNullStringForeignKey,
  ommittedColumnsForInsertSchema,
  orgIdEqualsCurrentSQL,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
  timestampWithTimezoneColumn,
} from '@/db/tableUtils'
import { FlowgladApiKeyType } from '@/types'

import core from '@/utils/core'
import { buildSchemas } from '../createZodSchemas'

const TABLE_NAME = 'api_keys'

export const apiKeys = pgTable(
  TABLE_NAME,
  {
    ...tableBase('apikey'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
    name: text('name').notNull(),
    token: text('token').notNull(),
    active: boolean('active').notNull().default(true),
    unkeyId: text('unkey_id'),
    type: pgEnumColumn({
      enumName: 'apiKeyType',
      columnName: 'type',
      enumBase: FlowgladApiKeyType,
    }).notNull(),
    expiresAt: timestampWithTimezoneColumn('expires_at'),
    stackAuthHostedBillingUserId: text(
      'stack_auth_hosted_billing_user_id'
    ),
    hashText: text('hash_text'),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    merchantPolicy('Enable all actions for own organizations', {
      as: 'permissive',
      for: 'all',
      using: orgIdEqualsCurrentSQL(),
    }),
  ])
).enableRLS()

const columnRefinements = {
  type: core.createSafeZodEnum(FlowgladApiKeyType),
}

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
  token: true,
} as const

const createOnlyColumns = {
  pricingModelId: true,
} as const

const hiddenColumns = {
  unkeyId: true,
  ...hiddenColumnsForClientSchema,
} as const

// Publishable API key schemas
const publishableApiKeyColumns = {
  type: z.literal(FlowgladApiKeyType.Publishable),
}

export const {
  insert: publishableApiKeysInsertSchema,
  select: publishableApiKeysSelectSchema,
  update: publishableApiKeysUpdateSchema,
  client: {
    select: publishableApiKeysClientSelectSchema,
    insert: publishableApiKeysClientInsertSchema,
    update: publishableApiKeysClientUpdateSchema,
  },
} = buildSchemas(apiKeys, {
  refine: {
    ...columnRefinements,
    ...publishableApiKeyColumns,
  },
  client: {
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
  },
})

// Secret API key schemas
const secretApiKeyColumns = {
  type: z.literal(FlowgladApiKeyType.Secret),
}

export const {
  insert: secretApiKeysInsertSchema,
  select: secretApiKeysSelectSchema,
  update: secretApiKeysUpdateSchema,
  client: {
    select: secretApiKeysClientSelectSchema,
    insert: secretApiKeysClientInsertSchema,
    update: secretApiKeysClientUpdateSchema,
  },
} = buildSchemas(apiKeys, {
  refine: {
    ...columnRefinements,
    ...secretApiKeyColumns,
  },
  client: {
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
  },
  entityName: 'SecretApiKey',
})

// Combined discriminated union schemas
export const apiKeysInsertSchema = z.discriminatedUnion('type', [
  secretApiKeysInsertSchema,
  publishableApiKeysInsertSchema,
])

export const apiKeysSelectSchema = z.discriminatedUnion('type', [
  secretApiKeysSelectSchema,
  publishableApiKeysSelectSchema,
])

export const apiKeysUpdateSchema = z.discriminatedUnion('type', [
  secretApiKeysUpdateSchema,
  publishableApiKeysUpdateSchema,
])

/*
 * client schemas
 */
// Combined client discriminated union schemas
export const apiKeysClientInsertSchema = z
  .discriminatedUnion('type', [secretApiKeysClientInsertSchema])
  .meta({ id: 'ApiKeysClientInsertSchema' })

export const apiKeysClientSelectSchema = z
  .discriminatedUnion('type', [
    secretApiKeysClientSelectSchema,
    publishableApiKeysClientSelectSchema,
  ])
  .meta({ id: 'ApiKeysClientSelectSchema' })

export const apiKeysClientUpdateSchema = z
  .discriminatedUnion('type', [
    secretApiKeysClientUpdateSchema,
    publishableApiKeysClientUpdateSchema,
  ])
  .meta({ id: 'ApiKeysClientUpdateSchema' })

export const apiKeyClientWhereClauseSchema = z
  .union([
    secretApiKeysClientSelectSchema.partial(),
    publishableApiKeysClientSelectSchema.partial(),
  ])
  .meta({ id: 'ApiKeyClientWhereClauseSchema' })

export const secretApiKeyMetadataSchema = z.object({
  type: z.literal(FlowgladApiKeyType.Secret),
  userId: z.string(),
  organizationId: z.string().optional(),
})

export const apiKeyMetadataSchema = secretApiKeyMetadataSchema

export namespace ApiKey {
  // Base types
  export type Insert = z.infer<typeof apiKeysInsertSchema>
  export type Update = z.infer<typeof apiKeysUpdateSchema>
  export type Record = z.infer<typeof apiKeysSelectSchema>
  export type ClientInsert = z.infer<typeof apiKeysClientInsertSchema>
  export type ClientUpdate = z.infer<typeof apiKeysClientUpdateSchema>
  export type ClientRecord = z.infer<typeof apiKeysClientSelectSchema>
  export type ClientWhereClause = z.infer<
    typeof apiKeyClientWhereClauseSchema
  >

  // Secret API Key types
  export type SecretInsert = z.infer<typeof secretApiKeysInsertSchema>
  export type SecretUpdate = z.infer<typeof secretApiKeysUpdateSchema>
  export type SecretRecord = z.infer<typeof secretApiKeysSelectSchema>
  export type SecretClientInsert = z.infer<
    typeof secretApiKeysClientInsertSchema
  >
  export type SecretClientUpdate = z.infer<
    typeof secretApiKeysClientUpdateSchema
  >
  export type SecretClientRecord = z.infer<
    typeof secretApiKeysClientSelectSchema
  >
  export type SecretMetadata = z.infer<
    typeof secretApiKeyMetadataSchema
  >
  // Publishable API Key types
  export type PublishableInsert = z.infer<
    typeof publishableApiKeysInsertSchema
  >
  export type PublishableUpdate = z.infer<
    typeof publishableApiKeysUpdateSchema
  >
  export type PublishableRecord = z.infer<
    typeof publishableApiKeysSelectSchema
  >
  export type PublishableClientInsert = z.infer<
    typeof publishableApiKeysClientInsertSchema
  >
  export type PublishableClientUpdate = z.infer<
    typeof publishableApiKeysClientUpdateSchema
  >
  export type PublishableClientRecord = z.infer<
    typeof publishableApiKeysClientSelectSchema
  >

  export type ApiKeyMetadata = z.infer<typeof apiKeyMetadataSchema>
  export type Where = SelectConditions<typeof apiKeys>
}

export const createApiKeyInputSchema = z.object({
  apiKey: apiKeysClientInsertSchema,
})

export type CreateApiKeyInput = z.infer<
  typeof createApiKeyInputSchema
>

export const editApiKeyInputSchema = z.object({
  apiKey: apiKeysClientUpdateSchema,
})

export type EditApiKeyInput = z.infer<typeof editApiKeyInputSchema>

export const revealApiKeySchema = idInputSchema

export type RevealApiKeyInput = z.infer<typeof revealApiKeySchema>

export const rotateApiKeySchema = idInputSchema

export type RotateApiKeyInput = z.infer<typeof rotateApiKeySchema>
