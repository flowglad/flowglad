import { sql } from 'drizzle-orm'
import { jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import { organizations } from '@/db/schema/organizations'
import {
  constructIndex,
  constructUniqueIndex,
  livemodePolicy,
  merchantPolicy,
  notNullStringForeignKey,
  pgEnumColumn,
  tableBase,
} from '@/db/tableUtils'
import { LedgerTransactionType } from '@/types'
import core from '@/utils/core'
import { pricingModels } from './pricingModels'
import { subscriptions } from './subscriptions'

const TABLE_NAME = 'ledger_transactions'

export const ledgerTransactions = pgTable(
  TABLE_NAME,
  {
    ...tableBase('ledger_transaction'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    type: pgEnumColumn({
      enumName: 'LedgerTransactionType',
      columnName: 'type',
      enumBase: LedgerTransactionType,
    }).notNull(),
    initiatingSourceType: text('initiating_source_type'),
    initiatingSourceId: text('initiating_source_id'),
    description: text('description'),
    metadata: jsonb('metadata'),
    subscriptionId: notNullStringForeignKey(
      'subscription_id',
      subscriptions
    ),
    idempotencyKey: text('idempotency_key'),
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
  },
  (table) => [
    constructIndex(TABLE_NAME, [
      table.initiatingSourceType,
      table.initiatingSourceId,
    ]),
    constructIndex(TABLE_NAME, [table.subscriptionId]),
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    constructUniqueIndex(TABLE_NAME, [
      table.idempotencyKey,
      table.subscriptionId,
    ]),
    constructUniqueIndex(TABLE_NAME, [
      table.type,
      table.initiatingSourceType,
      table.initiatingSourceId,
      table.livemode,
      table.organizationId,
    ]),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        to: 'merchant',
        for: 'all',
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
      }
    ),
    livemodePolicy(TABLE_NAME),
  ]
)

const columnRefinements = {
  metadata: z.record(z.string(), z.any()).nullable(),
  type: core.createSafeZodEnum(LedgerTransactionType),
}

const readOnlyColumns = {
  pricingModelId: true,
} as const

export const {
  insert: ledgerTransactionsInsertSchema,
  select: ledgerTransactionsSelectSchema,
  update: ledgerTransactionsUpdateSchema,
  client: {
    insert: ledgerTransactionClientInsertSchema,
    update: ledgerTransactionClientUpdateSchema,
    select: ledgerTransactionClientSelectSchema,
  },
} = buildSchemas(ledgerTransactions, {
  refine: columnRefinements,
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    readOnlyColumns,
  },
  entityName: 'LedgerTransaction',
})

export namespace LedgerTransaction {
  export type Insert = z.infer<typeof ledgerTransactionsInsertSchema>
  export type Update = z.infer<typeof ledgerTransactionsUpdateSchema>
  export type Record = z.infer<typeof ledgerTransactionsSelectSchema>
  export type ClientInsert = z.infer<
    typeof ledgerTransactionClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof ledgerTransactionClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof ledgerTransactionClientSelectSchema
  >
}

export const createLedgerTransactionInputSchema = z.object({
  ledgerTransaction: ledgerTransactionClientInsertSchema,
})

export type CreateLedgerTransactionInput = z.infer<
  typeof createLedgerTransactionInputSchema
>

export const editLedgerTransactionInputSchema = z.object({
  ledgerTransaction: ledgerTransactionClientUpdateSchema,
})
export type EditLedgerTransactionInput = z.infer<
  typeof editLedgerTransactionInputSchema
>
