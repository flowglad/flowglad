import {
  boolean,
  text,
  pgTable,
  pgPolicy,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import {
  tableBase,
  notNullStringForeignKey,
  constructIndex,
  enhancedCreateInsertSchema,
  livemodePolicy,
  createUpdateSchema,
  constructUniqueIndex,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { createSelectSchema } from 'drizzle-zod'
import core from '@/utils/core'
import { subscriptions } from './subscriptions'
import { usageMeters } from './usageMeters'

const TABLE_NAME = 'usage_transactions'

export const usageTransactions = pgTable(
  TABLE_NAME,
  {
    ...tableBase('usage_transaction'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    initiatingSourceType: text('initiating_source_type'),
    initiatingSourceId: text('initiating_source_id'),
    description: text('description'),
    metadata: jsonb('metadata'),
    subscriptionId: notNullStringForeignKey(
      'subscription_id',
      subscriptions
    ),
    usageMeterId: notNullStringForeignKey(
      'usage_meter_id',
      usageMeters
    ),
    idempotencyKey: text('idempotency_key'),
  },
  (table) => [
    constructIndex(TABLE_NAME, [
      table.initiatingSourceType,
      table.initiatingSourceId,
    ]),
    constructIndex(TABLE_NAME, [table.usageMeterId]),
    constructIndex(TABLE_NAME, [table.subscriptionId]),
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructUniqueIndex(TABLE_NAME, [
      table.idempotencyKey,
      table.usageMeterId,
      table.subscriptionId,
    ]),
    pgPolicy('Enable read for own organizations', {
      as: 'permissive',
      to: 'authenticated',
      for: 'all',
      using: sql`"organization_id" in (select "organization_id" from "memberships")`,
    }),
    livemodePolicy(),
  ]
)

const columnRefinements = {
  metadata: z.record(z.string(), z.any()).nullable(),
  createdAt: core.safeZodDate,
}

export const usageTransactionsInsertSchema =
  enhancedCreateInsertSchema(usageTransactions, columnRefinements)

export const usageTransactionsSelectSchema =
  createSelectSchema(usageTransactions).extend(columnRefinements)

export const usageTransactionsUpdateSchema = createUpdateSchema(
  usageTransactions,
  columnRefinements
)

const createOnlyColumns = {} as const
const readOnlyColumns = {
  organizationId: true,
  livemode: true,
} as const
const hiddenColumns = {
  createdByCommit: true,
  updatedByCommit: true,
} as const
const clientWriteOmits = {
  organizationId: true,
  livemode: true,
} as const

export const usageTransactionClientInsertSchema =
  usageTransactionsInsertSchema.omit(clientWriteOmits)
export const usageTransactionClientUpdateSchema =
  usageTransactionsUpdateSchema.omit({ ...clientWriteOmits })
export const usageTransactionClientSelectSchema =
  usageTransactionsSelectSchema.omit(hiddenColumns)

export namespace UsageTransaction {
  export type Insert = z.infer<typeof usageTransactionsInsertSchema>
  export type Update = z.infer<typeof usageTransactionsUpdateSchema>
  export type Record = z.infer<typeof usageTransactionsSelectSchema>
  export type ClientInsert = z.infer<
    typeof usageTransactionClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof usageTransactionClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof usageTransactionClientSelectSchema
  >
}

export const createUsageTransactionInputSchema = z.object({
  usageTransaction: usageTransactionClientInsertSchema,
})
export type CreateUsageTransactionInput = z.infer<
  typeof createUsageTransactionInputSchema
>

export const editUsageTransactionInputSchema = z.object({
  usageTransaction: usageTransactionClientUpdateSchema,
})
export type EditUsageTransactionInput = z.infer<
  typeof editUsageTransactionInputSchema
>
