import type { Subscription } from '@db-core/schema/subscriptions'
import { Result } from 'better-result'
import type { AuthenticatedProcedureTransactionParams } from '@/db/authenticatedTransaction'
import { selectSubscriptionItemsIncludingScheduled } from '@/db/tableMethods/subscriptionItemMethods'
import { expireSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods.server'
import {
  isSubscriptionCurrent,
  selectSubscriptionById,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import type { TransactionEffectsContext } from '@/db/types'
import { NotFoundError, ValidationError } from '@/errors'
import type { CancelScheduledAdjustmentParams } from '@/subscriptions/schemas'
import { CacheDependency } from '@/utils/cache'

/**
 * Checks if a subscription has a scheduled adjustment pending.
 */
export const hasScheduledAdjustment = (
  subscription: Subscription.Record
): boolean => {
  return subscription.scheduledAdjustmentAt !== null
}

export interface CancelScheduledAdjustmentResult {
  subscription: Subscription.Record
  canceledItemCount: number
}

export type CancelScheduledAdjustmentError =
  | NotFoundError
  | ValidationError

/**
 * Cancels a scheduled adjustment for a subscription.
 *
 * This function:
 * 1. Validates the subscription exists and has a scheduled adjustment
 * 2. Finds all subscription items scheduled for the future (addedDate > now)
 * 3. Expires those items immediately
 * 4. Clears scheduledAdjustmentAt on the subscription
 *
 * @param subscriptionId - The ID of the subscription
 * @param ctx - Transaction context with database transaction and effect callbacks
 * @returns Result with the updated subscription and count of canceled items
 */
export const cancelScheduledAdjustment = async (
  subscriptionId: string,
  ctx: TransactionEffectsContext
): Promise<
  Result<
    CancelScheduledAdjustmentResult,
    CancelScheduledAdjustmentError
  >
> => {
  const { transaction, invalidateCache } = ctx

  // Fetch the subscription
  const subscriptionResult = await selectSubscriptionById(
    subscriptionId,
    transaction
  )
  if (Result.isError(subscriptionResult)) {
    return Result.err(
      new NotFoundError('Subscription', subscriptionId)
    )
  }
  const subscription = subscriptionResult.value

  // Check if there's a scheduled adjustment
  if (!hasScheduledAdjustment(subscription)) {
    return Result.err(
      new ValidationError(
        'subscription',
        `Subscription ${subscriptionId} does not have a scheduled adjustment to cancel.`
      )
    )
  }

  // Find all subscription items, including those scheduled for the future
  const now = Date.now()
  const allItems = await selectSubscriptionItemsIncludingScheduled(
    { subscriptionId },
    now,
    transaction
  )

  // Filter to find items scheduled for the future (addedDate > now)
  // These are the items that were created as part of the scheduled adjustment
  const scheduledItems = allItems.filter(
    (item) => item.addedDate > now
  )

  // Expire the scheduled items
  if (scheduledItems.length > 0) {
    const itemIds = scheduledItems.map((item) => item.id)
    await expireSubscriptionItems(itemIds, now, transaction)

    // Invalidate cache for each expired subscription item's features
    invalidateCache(
      ...itemIds.map((itemId) =>
        CacheDependency.subscriptionItemFeatures(itemId)
      )
    )
  }

  // Clear the scheduledAdjustmentAt field
  const updatedSubscription = await updateSubscription(
    {
      id: subscriptionId,
      scheduledAdjustmentAt: null,
      renews: subscription.renews,
    },
    transaction
  )

  // Invalidate cache for customer subscriptions
  invalidateCache(
    CacheDependency.customerSubscriptions(subscription.customerId)
  )

  return Result.ok({
    subscription: updatedSubscription,
    canceledItemCount: scheduledItems.length,
  })
}

type CancelScheduledAdjustmentProcedureParams =
  AuthenticatedProcedureTransactionParams<
    CancelScheduledAdjustmentParams,
    { apiKey?: string }
  >

/**
 * Procedure transaction handler for canceling scheduled adjustments.
 *
 * @param params - Procedure transaction parameters
 * @param params.input - Cancel request with subscription ID
 * @param params.transactionCtx - Transaction context with database transaction and effect callbacks
 * @returns Promise resolving to Result with the updated subscription (formatted for client) and canceled item count
 */
export const cancelScheduledAdjustmentProcedureTransaction = async ({
  input,
  transactionCtx,
}: CancelScheduledAdjustmentProcedureParams): Promise<
  Result<
    {
      subscription: Subscription.ClientRecord
      canceledItemCount: number
    },
    Error
  >
> => {
  const {
    transaction,
    cacheRecomputationContext,
    invalidateCache,
    emitEvent,
    enqueueLedgerCommand,
  } = transactionCtx

  const ctx: TransactionEffectsContext = {
    transaction,
    cacheRecomputationContext,
    invalidateCache,
    emitEvent,
    enqueueLedgerCommand,
  }

  const result = await cancelScheduledAdjustment(input.id, ctx)
  if (Result.isError(result)) {
    return Result.err(result.error)
  }

  const { subscription, canceledItemCount } = result.value

  return Result.ok({
    subscription: {
      ...subscription,
      current: isSubscriptionCurrent(
        subscription.status,
        subscription.cancellationReason
      ),
    },
    canceledItemCount,
  })
}
