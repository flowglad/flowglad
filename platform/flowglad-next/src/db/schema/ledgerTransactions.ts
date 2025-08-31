import { text, pgTable, pgPolicy, jsonb } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import {
  tableBase,
  notNullStringForeignKey,
  constructIndex,
  ommittedColumnsForInsertSchema,
  livemodePolicy,
  constructUniqueIndex,
  pgEnumColumn,
  merchantRole,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import core from '@/utils/core'
import { subscriptions } from './subscriptions'
import { LedgerTransactionType } from '@/types'

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
  },
  (table) => [
    constructIndex(TABLE_NAME, [
      table.initiatingSourceType,
      table.initiatingSourceId,
    ]),
    constructIndex(TABLE_NAME, [table.subscriptionId]),
    constructIndex(TABLE_NAME, [table.organizationId]),
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
    pgPolicy(`Enable read for own organizations (${TABLE_NAME})`, {
      as: 'permissive',
      to: merchantRole,
      for: 'all',
      using: sql`"organization_id" in (select "organization_id" from "memberships")`,
    }),
    livemodePolicy(),
  ]
)

const columnRefinements = {
  metadata: z.record(z.string(), z.any()).nullable(),
  type: core.createSafeZodEnum(LedgerTransactionType),
}

export const ledgerTransactionsInsertSchema = createInsertSchema(
  ledgerTransactions
)
  .omit(ommittedColumnsForInsertSchema)
  .extend(columnRefinements)

export const ledgerTransactionsSelectSchema = createSelectSchema(
  ledgerTransactions
).extend(columnRefinements)

export const ledgerTransactionsUpdateSchema =
  ledgerTransactionsInsertSchema.partial().extend({ id: z.string() })

const hiddenColumns = {
  createdByCommit: true,
  updatedByCommit: true,
} as const
const clientWriteOmits = {
  organizationId: true,
  livemode: true,
} as const

export const ledgerTransactionClientInsertSchema =
  ledgerTransactionsInsertSchema.omit(clientWriteOmits).meta({
    id: 'LedgerTransactionInsert',
  })
export const ledgerTransactionClientUpdateSchema =
  ledgerTransactionsUpdateSchema.omit({ ...clientWriteOmits }).meta({
    id: 'LedgerTransactionUpdate',
  })
export const ledgerTransactionClientSelectSchema =
  ledgerTransactionsSelectSchema.omit(hiddenColumns).meta({
    id: 'LedgerTransactionRecord',
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
