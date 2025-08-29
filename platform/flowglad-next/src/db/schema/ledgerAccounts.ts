import {
  boolean,
  text,
  pgTable,
  pgPolicy,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import {
  tableBase,
  notNullStringForeignKey,
  nullableStringForeignKey,
  constructIndex,
  constructUniqueIndex,
  ommittedColumnsForInsertSchema,
  livemodePolicy,
  pgEnumColumn,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { subscriptions } from '@/db/schema/subscriptions'
import { usageMeters } from '@/db/schema/usageMeters'
import { NormalBalanceType } from '@/types'
import core from '@/utils/core'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'

const TABLE_NAME = 'ledger_accounts'

export const ledgerAccounts = pgTable(
  TABLE_NAME,
  {
    ...tableBase('la'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    subscriptionId: notNullStringForeignKey(
      'subscription_id',
      subscriptions
    ),
    usageMeterId: nullableStringForeignKey(
      'usage_meter_id',
      usageMeters
    ),
    // TODO: add currency column
    // currency: text('currency').notNull(),
    normalBalance: pgEnumColumn({
      enumName: 'NormalBalanceType',
      columnName: 'normal_balance',
      enumBase: NormalBalanceType,
    })
      .notNull()
      .default(NormalBalanceType.CREDIT),
    postedCreditsSum: text('posted_credits_sum')
      .notNull()
      .default('0'),
    postedDebitsSum: text('posted_debits_sum').notNull().default('0'),
    pendingCreditsSum: text('pending_credits_sum')
      .notNull()
      .default('0'),
    pendingDebitsSum: text('pending_debits_sum')
      .notNull()
      .default('0'),
    version: integer('version').notNull().default(0),
    livemode: boolean('livemode').notNull(),
    description: text('description'),
    metadata: jsonb('metadata'),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.subscriptionId]),
      constructUniqueIndex(TABLE_NAME, [
        table.subscriptionId,
        table.usageMeterId,
        //   table.currency,
      ]),
      pgPolicy('Enable read for own organizations', {
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
  normalBalance: core.createSafeZodEnum(NormalBalanceType),
  version: core.safeZodPositiveIntegerOrZero,
}

export const ledgerAccountsInsertSchema = createInsertSchema(ledgerAccounts).omit(ommittedColumnsForInsertSchema).extend(columnRefinements).extend({
  version: columnRefinements.version.optional(),
  normalBalance: columnRefinements.normalBalance.optional(),
})

export const ledgerAccountsSelectSchema =
  createSelectSchema(ledgerAccounts).extend(columnRefinements)

export const ledgerAccountsUpdateSchema = ledgerAccountsInsertSchema.partial().extend({ id: z.string() })

export namespace LedgerAccount {
  export type Insert = z.infer<typeof ledgerAccountsInsertSchema>
  export type Update = z.infer<typeof ledgerAccountsUpdateSchema>
  export type Record = z.infer<typeof ledgerAccountsSelectSchema>
}
