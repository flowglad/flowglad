import { inArray } from 'drizzle-orm'
import {
  type UsageCredit,
  usageCredits,
  usageCreditsInsertSchema,
  usageCreditsSelectSchema,
  usageCreditsUpdateSchema,
} from '@/db/schema/usageCredits'
import {
  createBulkInsertFunction,
  createBulkInsertOrDoNothingFunction,
  createDerivePricingModelId,
  createDerivePricingModelIds,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import { UsageCreditStatus } from '@/types'
import type { Payment } from '../schema/payments'
import type { UsageMeter } from '../schema/usageMeters'
import type { DbTransaction } from '../types'
import { derivePricingModelIdFromMap } from './pricingModelIdHelpers'
import {
  derivePricingModelIdFromUsageMeter,
  pricingModelIdsForUsageMeters,
} from './usageMeterMethods'

const config: ORMMethodCreatorConfig<
  typeof usageCredits,
  typeof usageCreditsSelectSchema,
  typeof usageCreditsInsertSchema,
  typeof usageCreditsUpdateSchema
> = {
  tableName: 'usage_credits',
  selectSchema: usageCreditsSelectSchema,
  insertSchema: usageCreditsInsertSchema,
  updateSchema: usageCreditsUpdateSchema,
}

export const selectUsageCreditById = createSelectById(
  usageCredits,
  config
)

/**
 * Derives pricingModelId from a usage credit (via usage meter).
 * Used for usageCreditApplications and usageCreditBalanceAdjustments.
 */
export const derivePricingModelIdFromUsageCredit =
  createDerivePricingModelId(
    usageCredits,
    config,
    selectUsageCreditById
  )

export const pricingModelIdsForUsageCredits =
  createDerivePricingModelIds(usageCredits, config)

const baseInsertUsageCredit = createInsertFunction(
  usageCredits,
  config
)

export const insertUsageCredit = async (
  usageCreditInsert: UsageCredit.Insert,
  transaction: DbTransaction
): Promise<UsageCredit.Record> => {
  const pricingModelId = usageCreditInsert.pricingModelId
    ? usageCreditInsert.pricingModelId
    : await derivePricingModelIdFromUsageMeter(
        usageCreditInsert.usageMeterId,
        transaction
      )
  return baseInsertUsageCredit(
    {
      ...usageCreditInsert,
      pricingModelId,
    },
    transaction
  )
}

export const updateUsageCredit = createUpdateFunction(
  usageCredits,
  config
)

export const selectUsageCredits = createSelectFunction(
  usageCredits,
  config
)

const baseBulkInsertUsageCredits = createBulkInsertFunction(
  usageCredits,
  config
)

export const bulkInsertUsageCredits = async (
  usageCreditInserts: UsageCredit.Insert[],
  transaction: DbTransaction
): Promise<UsageCredit.Record[]> => {
  const pricingModelIdMap = await pricingModelIdsForUsageMeters(
    usageCreditInserts.map((insert) => insert.usageMeterId),
    transaction
  )
  const usageCreditsWithPricingModelId = usageCreditInserts.map(
    (usageCreditInsert): UsageCredit.Insert => {
      const pricingModelId =
        usageCreditInsert.pricingModelId ??
        derivePricingModelIdFromMap({
          entityId: usageCreditInsert.usageMeterId,
          entityType: 'usageMeter',
          pricingModelIdMap,
        }).unwrap()

      return {
        ...usageCreditInsert,
        pricingModelId,
      }
    }
  )
  return baseBulkInsertUsageCredits(
    usageCreditsWithPricingModelId,
    transaction
  )
}

const baseBulkInsertOrDoNothingUsageCredits =
  createBulkInsertOrDoNothingFunction(usageCredits, config)

export const bulkInsertOrDoNothingUsageCreditsByPaymentSubscriptionAndUsageMeter =
  async (
    usageCreditInserts: UsageCredit.Insert[],
    transaction: DbTransaction
  ) => {
    const pricingModelIdMap = await pricingModelIdsForUsageMeters(
      usageCreditInserts.map((insert) => insert.usageMeterId),
      transaction
    )
    const usageCreditsWithPricingModelId = usageCreditInserts.map(
      (usageCreditInsert): UsageCredit.Insert => {
        const pricingModelId =
          usageCreditInsert.pricingModelId ??
          derivePricingModelIdFromMap({
            entityId: usageCreditInsert.usageMeterId,
            entityType: 'usageMeter',
            pricingModelIdMap,
          }).unwrap()

        return {
          ...usageCreditInsert,
          pricingModelId,
        }
      }
    )
    return baseBulkInsertOrDoNothingUsageCredits(
      usageCreditsWithPricingModelId,
      [
        usageCredits.paymentId,
        usageCredits.subscriptionId,
        usageCredits.usageMeterId,
      ],
      transaction
    )
  }

/**
 * Safely finalizes usage credits for a succeeded payment.
 * This will set the status of all pending usage credits for the payment to posted.
 * This will not fail if some of the usage credits are already posted.
 *
 * FIXME: design question: should this be for ALL usage meters? Or just one per?
 */
export const safelyFinalizeUsageCreditForSucceededPayment = async (
  payment: Payment.Record,
  usageMeter: UsageMeter.Record,
  transaction: DbTransaction
) => {
  const usageCreditResults = await selectUsageCredits(
    {
      subscriptionId: payment.subscriptionId!,
      status: UsageCreditStatus.Pending,
      usageMeterId: usageMeter.id,
    },
    transaction
  )
  await transaction
    .update(usageCredits)
    .set({
      status: UsageCreditStatus.Posted,
    })
    .where(
      inArray(
        usageCredits.id,
        usageCreditResults.map((usageCredit) => usageCredit.id)
      )
    )
}
