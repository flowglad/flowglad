import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { buildSchemas } from '../createZodSchemas'
import { NormalBalanceType } from '../enums'
import {
  constructIndex,
  constructUniqueIndex,
  livemodePolicyTable,
  merchantPolicy,
  merchantRole,
  notNullStringForeignKey,
  ommittedColumnsForInsertSchema,
  orgIdEqualsCurrentSQL,
  pgEnumColumn,
  tableBase,
} from '../tableUtils'
import core from '../utils'
import { organizations } from './organizations'
import { pricingModels } from './pricingModels'
import { subscriptions } from './subscriptions'
import { usageMeters } from './usageMeters'

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
    usageMeterId: notNullStringForeignKey(
      'usage_meter_id',
      usageMeters
    ),
    // FIXME: add currency column
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
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.subscriptionId]),
    constructUniqueIndex(TABLE_NAME, [
      table.subscriptionId,
      table.usageMeterId,
      //   table.currency,
    ]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        for: 'all',
        using: orgIdEqualsCurrentSQL(),
      }
    ),
  ])
).enableRLS()

const columnRefinements = {
  normalBalance: core.createSafeZodEnum(NormalBalanceType),
  version: core.safeZodPositiveIntegerOrZero,
}

export const {
  insert: ledgerAccountsInsertSchema,
  select: ledgerAccountsSelectSchema,
  update: ledgerAccountsUpdateSchema,
} = buildSchemas(ledgerAccounts, {
  refine: columnRefinements,
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  entityName: 'LedgerAccount',
})

export namespace LedgerAccount {
  export type Insert = z.infer<typeof ledgerAccountsInsertSchema>
  export type Update = z.infer<typeof ledgerAccountsUpdateSchema>
  export type Record = z.infer<typeof ledgerAccountsSelectSchema>
}
