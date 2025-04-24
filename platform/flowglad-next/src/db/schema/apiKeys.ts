import {
  boolean,
  text,
  timestamp,
  pgTable,
  pgPolicy,
  pgEnum,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  tableBase,
  notNullStringForeignKey,
  constructIndex,
  enhancedCreateInsertSchema,
  createUpdateSchema,
  livemodePolicy,
  idInputSchema,
  pgEnumColumn,
  ommittedColumnsForInsertSchema,
  SelectConditions,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { FlowgladApiKeyType } from '@/types'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import core from '@/utils/core'

const TABLE_NAME = 'api_keys'

export const apiKeys = pgTable(
  TABLE_NAME,
  {
    ...tableBase('apikey'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
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
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
    }),
    stackAuthHostedBillingUserId: text(
      'stack_auth_hosted_billing_user_id'
    ),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      pgPolicy('Enable all actions for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

const columnRefinements = {
  type: core.createSafeZodEnum(FlowgladApiKeyType),
}

/*
 * database schemas
 */
export const coreApiKeysInsertSchema = createInsertSchema(
  apiKeys,
  columnRefinements
).omit(ommittedColumnsForInsertSchema)

export const coreApiKeysSelectSchema = createSelectSchema(
  apiKeys,
  columnRefinements
).extend(columnRefinements)

export const coreApiKeysUpdateSchema = createUpdateSchema(
  apiKeys,
  columnRefinements
)

const hostedBillingApiKeyColumns = {
  type: z.literal(FlowgladApiKeyType.BillingPortalToken),
  expiresAt: z.date(),
  stackAuthHostedBillingUserId: z.string(),
}

// Hosted billing portal schemas
export const hostedBillingPortalApiKeysInsertSchema =
  coreApiKeysInsertSchema.extend(hostedBillingApiKeyColumns)
export const hostedBillingPortalApiKeysSelectSchema =
  coreApiKeysSelectSchema.extend(hostedBillingApiKeyColumns)
export const hostedBillingPortalApiKeysUpdateSchema =
  coreApiKeysUpdateSchema.extend(hostedBillingApiKeyColumns)

// Secret API key schemas
const secretApiKeyColumns = {
  type: z.literal(FlowgladApiKeyType.Secret),
}
export const secretApiKeysInsertSchema =
  coreApiKeysInsertSchema.extend(secretApiKeyColumns)
export const secretApiKeysSelectSchema =
  coreApiKeysSelectSchema.extend(secretApiKeyColumns)
export const secretApiKeysUpdateSchema =
  coreApiKeysUpdateSchema.extend(secretApiKeyColumns)

// Publishable API key schemas
const publishableApiKeyColumns = {
  type: z.literal(FlowgladApiKeyType.Publishable),
}
export const publishableApiKeysInsertSchema =
  coreApiKeysInsertSchema.extend(publishableApiKeyColumns)
export const publishableApiKeysSelectSchema =
  coreApiKeysSelectSchema.extend(publishableApiKeyColumns)
export const publishableApiKeysUpdateSchema =
  coreApiKeysUpdateSchema.extend(publishableApiKeyColumns)

// Combined discriminated union schemas
export const apiKeysInsertSchema = z.discriminatedUnion('type', [
  secretApiKeysInsertSchema,
  publishableApiKeysInsertSchema,
  hostedBillingPortalApiKeysInsertSchema,
])

export const apiKeysSelectSchema = z.discriminatedUnion('type', [
  secretApiKeysSelectSchema,
  publishableApiKeysSelectSchema,
  hostedBillingPortalApiKeysSelectSchema,
])

export const apiKeysUpdateSchema = z.discriminatedUnion('type', [
  secretApiKeysUpdateSchema,
  publishableApiKeysUpdateSchema,
  hostedBillingPortalApiKeysUpdateSchema,
])

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
  token: true,
} as const

const hiddenColumns = {
  unkeyId: true,
} as const

const nonClientEditableColumns = {
  ...hiddenColumns,
  ...readOnlyColumns,
} as const

// Client schemas
export const secretApiKeysClientInsertSchema =
  secretApiKeysInsertSchema.omit(nonClientEditableColumns)
export const secretApiKeysClientSelectSchema =
  secretApiKeysSelectSchema.omit(hiddenColumns)
export const secretApiKeysClientUpdateSchema =
  secretApiKeysUpdateSchema.omit({
    ...nonClientEditableColumns,
    expiresAt: true,
  })

export const publishableApiKeysClientInsertSchema =
  publishableApiKeysInsertSchema.omit(nonClientEditableColumns)
export const publishableApiKeysClientSelectSchema =
  publishableApiKeysSelectSchema.omit(hiddenColumns)
export const publishableApiKeysClientUpdateSchema =
  publishableApiKeysUpdateSchema.omit({
    ...nonClientEditableColumns,
    expiresAt: true,
  })

export const hostedBillingPortalApiKeysClientInsertSchema =
  hostedBillingPortalApiKeysInsertSchema.omit(
    nonClientEditableColumns
  )
export const hostedBillingPortalApiKeysClientSelectSchema =
  hostedBillingPortalApiKeysSelectSchema.omit(hiddenColumns)
export const hostedBillingPortalApiKeysClientUpdateSchema =
  hostedBillingPortalApiKeysUpdateSchema.omit({
    ...nonClientEditableColumns,
    expiresAt: true,
  })

/*
 * client schemas
 */
// Combined client discriminated union schemas
export const apiKeysClientInsertSchema = z.discriminatedUnion(
  'type',
  [
    secretApiKeysClientInsertSchema,
    publishableApiKeysClientInsertSchema,
    hostedBillingPortalApiKeysClientInsertSchema,
  ]
)

export const apiKeysClientSelectSchema = z.discriminatedUnion(
  'type',
  [
    secretApiKeysClientSelectSchema,
    publishableApiKeysClientSelectSchema,
    hostedBillingPortalApiKeysClientSelectSchema,
  ]
)

export const apiKeysClientUpdateSchema = z.discriminatedUnion(
  'type',
  [
    secretApiKeysClientUpdateSchema,
    publishableApiKeysClientUpdateSchema,
    hostedBillingPortalApiKeysClientUpdateSchema,
  ]
)

export const apiKeyClientWhereClauseSchema =
  coreApiKeysSelectSchema.partial()

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
  export type SecretSelect = z.infer<typeof secretApiKeysSelectSchema>
  export type SecretClientInsert = z.infer<
    typeof secretApiKeysClientInsertSchema
  >
  export type SecretClientUpdate = z.infer<
    typeof secretApiKeysClientUpdateSchema
  >
  export type SecretClientSelect = z.infer<
    typeof secretApiKeysClientSelectSchema
  >

  // Publishable API Key types
  export type PublishableInsert = z.infer<
    typeof publishableApiKeysInsertSchema
  >
  export type PublishableUpdate = z.infer<
    typeof publishableApiKeysUpdateSchema
  >
  export type PublishableSelect = z.infer<
    typeof publishableApiKeysSelectSchema
  >
  export type PublishableClientInsert = z.infer<
    typeof publishableApiKeysClientInsertSchema
  >
  export type PublishableClientUpdate = z.infer<
    typeof publishableApiKeysClientUpdateSchema
  >
  export type PublishableClientSelect = z.infer<
    typeof publishableApiKeysClientSelectSchema
  >

  // Billing Portal API Key types
  export type BillingPortalInsert = z.infer<
    typeof hostedBillingPortalApiKeysInsertSchema
  >
  export type BillingPortalUpdate = z.infer<
    typeof hostedBillingPortalApiKeysUpdateSchema
  >
  export type BillingPortalSelect = z.infer<
    typeof hostedBillingPortalApiKeysSelectSchema
  >
  export type BillingPortalClientInsert = z.infer<
    typeof hostedBillingPortalApiKeysClientInsertSchema
  >
  export type BillingPortalClientUpdate = z.infer<
    typeof hostedBillingPortalApiKeysClientUpdateSchema
  >
  export type BillingPortalClientSelect = z.infer<
    typeof hostedBillingPortalApiKeysClientSelectSchema
  >
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
