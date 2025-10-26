import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createBulkInsertFunction,
  createBulkInsertOrDoNothingFunction,
} from '@/db/tableUtils'
import {
  usageCredits,
  usageCreditsInsertSchema,
  usageCreditsSelectSchema,
  usageCreditsUpdateSchema,
  UsageCredit,
} from '@/db/schema/usageCredits'
import { DbTransaction } from '../types'
import { UsageCreditStatus } from '@/types'
import { Payment } from '../schema/payments'
import { inArray } from 'drizzle-orm'
import { UsageMeter } from '../schema/usageMeters'

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

export const insertUsageCredit = createInsertFunction(
  usageCredits,
  config
)

export const updateUsageCredit = createUpdateFunction(
  usageCredits,
  config
)

export const selectUsageCredits = createSelectFunction(
  usageCredits,
  config
)

export const bulkInsertUsageCredits = createBulkInsertFunction(
  usageCredits,
  config
)

export const bulkInsertOrDoNothingUsageCredits =
  createBulkInsertOrDoNothingFunction(usageCredits, config)

export const bulkInsertOrDoNothingUsageCreditsByPaymentSubscriptionAndUsageMeter =
  async (
    usageCreditInserts: UsageCredit.Insert[],
    transaction: DbTransaction
  ) => {
    return bulkInsertOrDoNothingUsageCredits(
      usageCreditInserts,
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
