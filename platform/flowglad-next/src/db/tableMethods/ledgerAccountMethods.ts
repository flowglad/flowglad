<<<<<<< HEAD
import { NormalBalanceType } from '@db-core/enums'
||||||| parent of b097e5ae (Delete original src/db schema utils and update all imports to @db-core)
import {
  type LedgerAccount,
  ledgerAccounts,
  ledgerAccountsInsertSchema,
  ledgerAccountsSelectSchema,
  ledgerAccountsUpdateSchema,
} from '@/db/schema/ledgerAccounts'
import {
=======
>>>>>>> b097e5ae (Delete original src/db schema utils and update all imports to @db-core)
import {
  createBulkInsertOrDoNothingFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  type ORMMethodCreatorConfig,
} from '@db-core/tableUtils'
import {
  type LedgerAccount,
  ledgerAccounts,
  ledgerAccountsInsertSchema,
  ledgerAccountsSelectSchema,
  ledgerAccountsUpdateSchema,
} from '@/db/schema/ledgerAccounts'
<<<<<<< HEAD
||||||| parent of b097e5ae (Delete original src/db schema utils and update all imports to @db-core)
} from '@/db/tableUtils'
import { NormalBalanceType } from '@/types'
=======
import { NormalBalanceType } from '@/types'
>>>>>>> b097e5ae (Delete original src/db schema utils and update all imports to @db-core)
import type { DbTransaction } from '../types'
import { selectSubscriptionById } from './subscriptionMethods'
import {
  derivePricingModelIdFromUsageMeter,
  pricingModelIdsForUsageMeters,
} from './usageMeterMethods'

const TABLE_NAME = 'ledger_accounts'

const config: ORMMethodCreatorConfig<
  typeof ledgerAccounts,
  typeof ledgerAccountsSelectSchema,
  typeof ledgerAccountsInsertSchema,
  typeof ledgerAccountsUpdateSchema
> = {
  selectSchema: ledgerAccountsSelectSchema,
  insertSchema: ledgerAccountsInsertSchema,
  updateSchema: ledgerAccountsUpdateSchema,
  tableName: TABLE_NAME,
}

export const selectLedgerAccountById = createSelectById(
  ledgerAccounts,
  config
)

const baseInsertLedgerAccount = createInsertFunction(
  ledgerAccounts,
  config
)

export const insertLedgerAccount = async (
  ledgerAccountInsert: LedgerAccount.Insert,
  transaction: DbTransaction
): Promise<LedgerAccount.Record> => {
  const pricingModelId = ledgerAccountInsert.pricingModelId
    ? ledgerAccountInsert.pricingModelId
    : await derivePricingModelIdFromUsageMeter(
        ledgerAccountInsert.usageMeterId,
        transaction
      )
  return baseInsertLedgerAccount(
    {
      ...ledgerAccountInsert,
      pricingModelId,
    },
    transaction
  )
}

export const updateLedgerAccount = createUpdateFunction(
  ledgerAccounts,
  config
)

export const selectLedgerAccounts = createSelectFunction(
  ledgerAccounts,
  config
)

const baseUpsertLedgerAccountByEccaDefinition = createUpsertFunction(
  ledgerAccounts,
  [
    ledgerAccounts.organizationId,
    ledgerAccounts.subscriptionId,
    ledgerAccounts.usageMeterId,
    //   ledgerAccounts.currency,
    ledgerAccounts.livemode,
  ],
  config
)

export const upsertLedgerAccountByEccaDefinition = async (
  ledgerAccountInsert: LedgerAccount.Insert,
  transaction: DbTransaction
): Promise<LedgerAccount.Record> => {
  const pricingModelId = ledgerAccountInsert.pricingModelId
    ? ledgerAccountInsert.pricingModelId
    : await derivePricingModelIdFromUsageMeter(
        ledgerAccountInsert.usageMeterId,
        transaction
      )
  const results = await baseUpsertLedgerAccountByEccaDefinition(
    {
      ...ledgerAccountInsert,
      pricingModelId,
    },
    transaction
  )
  return results[0]!
}

const baseBulkInsertOrDoNothingLedgerAccounts =
  createBulkInsertOrDoNothingFunction(ledgerAccounts, config)
export const bulkInsertLedgerAccountsBySubscriptionIdAndUsageMeterId =
  async (
    insertParams: LedgerAccount.Insert[],
    transaction: DbTransaction
  ): Promise<LedgerAccount.Record[]> => {
    const pricingModelIdMap = await pricingModelIdsForUsageMeters(
      insertParams.map((insert) => insert.usageMeterId),
      transaction
    )
    const ledgerAccountsWithPricingModelId = insertParams.map(
      (ledgerAccountInsert): LedgerAccount.Insert => {
        const pricingModelId =
          ledgerAccountInsert.pricingModelId ??
          pricingModelIdMap.get(ledgerAccountInsert.usageMeterId)
        if (!pricingModelId) {
          throw new Error(
            `Pricing model id not found for usage meter ${ledgerAccountInsert.usageMeterId}`
          )
        }
        return {
          ...ledgerAccountInsert,
          pricingModelId,
        }
      }
    )
    return baseBulkInsertOrDoNothingLedgerAccounts(
      ledgerAccountsWithPricingModelId,
      [ledgerAccounts.subscriptionId, ledgerAccounts.usageMeterId],
      transaction
    )
  }

export const findOrCreateLedgerAccountsForSubscriptionAndUsageMeters =
  async (
    params: {
      subscriptionId: string
      usageMeterIds: string[]
    },
    transaction: DbTransaction
  ) => {
    const { subscriptionId, usageMeterIds } = params
    const ledgerAccounts = await selectLedgerAccounts(
      {
        subscriptionId,
        usageMeterId: usageMeterIds,
      },
      transaction
    )
    const unAccountedForUsageMeterIds: string[] =
      usageMeterIds.filter(
        (usageMeterId) =>
          !ledgerAccounts.some(
            (ledgerAccount) =>
              ledgerAccount.usageMeterId === usageMeterId
          )
      )
    if (unAccountedForUsageMeterIds.length === 0) {
      return ledgerAccounts
    }
    const subscription = (
      await selectSubscriptionById(subscriptionId, transaction)
    ).unwrap()
    const ledgerAccountInserts: LedgerAccount.Insert[] =
      unAccountedForUsageMeterIds.map((usageMeterId) => ({
        subscriptionId,
        usageMeterId,
        organizationId: subscription.organizationId,
        livemode: subscription.livemode,
        normalBalance: NormalBalanceType.CREDIT,
        version: 0,
      }))
    const createdLedgerAccounts =
      await bulkInsertLedgerAccountsBySubscriptionIdAndUsageMeterId(
        ledgerAccountInserts,
        transaction
      )
    return [...ledgerAccounts, ...createdLedgerAccounts]
  }
