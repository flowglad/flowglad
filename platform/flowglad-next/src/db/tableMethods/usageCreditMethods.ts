import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
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
import { UsageCreditSourceReferenceType, UsageCreditStatus } from '@/types'
import { isNil } from '@/utils/core'
import type { Payment } from '../schema/payments'
import type { UsageMeter } from '../schema/usageMeters'
import type { DbTransaction } from '../types'
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

export const insertUsageCreditOrDoNothing = async (
  usageCreditInsert: UsageCredit.Insert,
  transaction: DbTransaction
): Promise<UsageCredit.Record | undefined> => {
  const pricingModelId = usageCreditInsert.pricingModelId
    ? usageCreditInsert.pricingModelId
    : await derivePricingModelIdFromUsageMeter(
        usageCreditInsert.usageMeterId,
        transaction
      )

  // Check if a row already exists with the same unique constraint values
  // PostgreSQL unique constraints allow multiple NULLs, so we need to check explicitly
  const existingQuery = transaction.select().from(usageCredits)

  if (
    usageCreditInsert.sourceReferenceType ===
      UsageCreditSourceReferenceType.ManualAdjustment &&
    !usageCreditInsert.featureId
  ) {
    throw new Error(
      'ManualAdjustment usage credits must have a featureId for deduplication.'
    )
  }

  // For ManualAdjustment, we rely on the database unique index (with NULLS NOT DISTINCT) and ON CONFLICT
  // to prevent duplicates atomically. We skip the pre-select check to avoid race conditions.
  // For other types, we retain the application-level check (for now).
  if (
    usageCreditInsert.sourceReferenceType !==
    UsageCreditSourceReferenceType.ManualAdjustment
  ) {
    existingQuery.where(
      and(
        isNil(usageCreditInsert.sourceReferenceId)
          ? isNull(usageCredits.sourceReferenceId)
          : eq(
              usageCredits.sourceReferenceId,
              usageCreditInsert.sourceReferenceId
            ),
        eq(
          usageCredits.sourceReferenceType,
          usageCreditInsert.sourceReferenceType
        ),
        isNil(usageCreditInsert.billingPeriodId)
          ? isNull(usageCredits.billingPeriodId)
          : eq(
              usageCredits.billingPeriodId,
              usageCreditInsert.billingPeriodId
            )
      )
    )
    const existing = await existingQuery.limit(1)

    if (existing.length > 0) {
      return undefined
    }
  }

  const insertQuery = transaction
    .insert(usageCredits)
    .values({
      ...usageCreditInsert,
      pricingModelId,
    })

  if (
    usageCreditInsert.sourceReferenceType ===
    UsageCreditSourceReferenceType.ManualAdjustment
  ) {
    // Use the new partial unique index
    insertQuery.onConflictDoNothing({
      target: [
        usageCredits.subscriptionId,
        usageCredits.billingPeriodId,
        usageCredits.featureId,
        usageCredits.usageMeterId,
      ],
      where: sql`"source_reference_type" = 'ManualAdjustment' AND "feature_id" IS NOT NULL`,
    })
  } else {
    // No unique constraint for other types currently?
    // Using onConflictDoNothing without target might not work if no constraint violation.
    // If we removed the old index, this is just a standard insert.
    // But we did the select check above.
    insertQuery.onConflictDoNothing()
  }

  const [result] = await insertQuery.returning()

  if (!result) {
    return undefined
  }

  return usageCreditsSelectSchema.parse(result)
}

export const updateUsageCredit = createUpdateFunction(
  usageCredits,
  config
)

export const selectUsageCredits = createSelectFunction(
  usageCredits,
  config
)

export const selectUsageCreditBySourceReferenceAndBillingPeriod =
  async (
    params: Pick<
      UsageCredit.Record,
      'sourceReferenceId' | 'sourceReferenceType' | 'billingPeriodId'
    >,
    transaction: DbTransaction
  ): Promise<UsageCredit.Record | undefined> => {
    const [result] = await transaction
      .select()
      .from(usageCredits)
      .where(
        and(
          params.sourceReferenceId === null
            ? isNull(usageCredits.sourceReferenceId)
            : eq(
                usageCredits.sourceReferenceId,
                params.sourceReferenceId
              ),
          eq(
            usageCredits.sourceReferenceType,
            params.sourceReferenceType
          ),
          params.billingPeriodId === null
            ? isNull(usageCredits.billingPeriodId)
            : eq(usageCredits.billingPeriodId, params.billingPeriodId)
        )
      )
      .limit(1)

    return result ? usageCreditsSelectSchema.parse(result) : undefined
  }

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
        pricingModelIdMap.get(usageCreditInsert.usageMeterId)
      if (!pricingModelId) {
        throw new Error(
          `Pricing model id not found for usage meter ${usageCreditInsert.usageMeterId}`
        )
      }
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

/**
 * Bulk inserts usage credits and ignores duplicates by the dedupe unique index:
 * (sourceReferenceId, sourceReferenceType, billingPeriodId).
 *
 * This is used for idempotency in cases where it's safe/expected to retry the same
 * logical issuance (e.g. billing period transitions).
 */
export const bulkInsertOrDoNothingUsageCreditsBySourceReferenceAndBillingPeriod =
  async (
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
          pricingModelIdMap.get(usageCreditInsert.usageMeterId)
        if (!pricingModelId) {
          throw new Error(
            `Pricing model id not found for usage meter ${usageCreditInsert.usageMeterId}`
          )
        }
        return {
          ...usageCreditInsert,
          pricingModelId,
        }
      }
    )
    return baseBulkInsertOrDoNothingUsageCredits(
      usageCreditsWithPricingModelId,
      [
        usageCredits.sourceReferenceId,
        usageCredits.sourceReferenceType,
        usageCredits.billingPeriodId,
      ],
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
          pricingModelIdMap.get(usageCreditInsert.usageMeterId)
        if (!pricingModelId) {
          throw new Error(
            `Pricing model id not found for usage meter ${usageCreditInsert.usageMeterId}`
          )
        }
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
