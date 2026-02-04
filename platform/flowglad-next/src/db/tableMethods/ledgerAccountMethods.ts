import { NormalBalanceType } from '@db-core/enums'
import {
  type LedgerAccount,
  ledgerAccounts,
  ledgerAccountsInsertSchema,
  ledgerAccountsSelectSchema,
  ledgerAccountsUpdateSchema,
} from '@db-core/schema/ledgerAccounts'
import {
  createBulkInsertOrDoNothingFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  type ORMMethodCreatorConfig,
} from '@db-core/tableUtils'
import { Result } from 'better-result'
import { panic } from '@/errors'
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
          panic(
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
  ): Promise<
    Result<
      LedgerAccount.Record[],
      import('@db-core/tableUtils').NotFoundError
    >
  > => {
    const { subscriptionId, usageMeterIds } = params
    const ledgerAccountsResult = await selectLedgerAccounts(
      {
        subscriptionId,
        usageMeterId: usageMeterIds,
      },
      transaction
    )
    const unAccountedForUsageMeterIds: string[] =
      usageMeterIds.filter(
        (usageMeterId) =>
          !ledgerAccountsResult.some(
            (ledgerAccount) =>
              ledgerAccount.usageMeterId === usageMeterId
          )
      )
    if (unAccountedForUsageMeterIds.length === 0) {
      return Result.ok(ledgerAccountsResult)
    }
    const subscriptionResult = await selectSubscriptionById(
      subscriptionId,
      transaction
    )
    if (Result.isError(subscriptionResult)) {
      return subscriptionResult
    }
    const subscription = subscriptionResult.unwrap()
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
    return Result.ok([
      ...ledgerAccountsResult,
      ...createdLedgerAccounts,
    ])
  }
