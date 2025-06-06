import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  createUpsertFunction,
  ORMMethodCreatorConfig,
  createBulkInsertOrDoNothingFunction,
} from '@/db/tableUtils'
import {
  LedgerAccount,
  ledgerAccounts,
  ledgerAccountsInsertSchema,
  ledgerAccountsSelectSchema,
  ledgerAccountsUpdateSchema,
} from '@/db/schema/ledgerAccounts'
import { DbTransaction } from '../types'
import { selectSubscriptionById } from './subscriptionMethods'

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

export const insertLedgerAccount = createInsertFunction(
  ledgerAccounts,
  config
)

export const updateLedgerAccount = createUpdateFunction(
  ledgerAccounts,
  config
)

export const selectLedgerAccounts = createSelectFunction(
  ledgerAccounts,
  config
)

export const upsertLedgerAccountByEccaDefinition =
  createUpsertFunction(
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

const bulkInsertOrDoNothingLedgerAccounts =
  createBulkInsertOrDoNothingFunction(ledgerAccounts, config)
export const bulkInsertLedgerAccountsBySubscriptionIdAndUsageMeterId =
  async (
    insertParams: LedgerAccount.Insert[],
    transaction: DbTransaction
  ) => {
    return bulkInsertOrDoNothingLedgerAccounts(
      insertParams,
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
    const subscription = await selectSubscriptionById(
      subscriptionId,
      transaction
    )
    const ledgerAccountInserts: LedgerAccount.Insert[] =
      unAccountedForUsageMeterIds.map((usageMeterId) => ({
        subscriptionId,
        usageMeterId,
        organizationId: subscription.organizationId,
        livemode: subscription.livemode,
      }))
    const createdLedgerAccounts =
      await bulkInsertLedgerAccountsBySubscriptionIdAndUsageMeterId(
        ledgerAccountInserts,
        transaction
      )
    return [...ledgerAccounts, ...createdLedgerAccounts]
  }
