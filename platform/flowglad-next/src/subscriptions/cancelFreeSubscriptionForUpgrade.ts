import { DbTransaction } from '@/db/types'
import { Subscription } from '@/db/schema/subscriptions'
import { SubscriptionStatus, CancellationReason } from '@/types'
import {
  selectSubscriptions,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'

/**
 * Cancels an active free subscription when a customer is upgrading to a paid plan.
 * This is used during the setup intent success flow to handle the transition
 * from free to paid subscriptions.
 *
 * Tested via integration tests in processSetupIntent.upgrade.test.ts
 *
 * @param customerId - The customer whose free subscription should be canceled
 * @param transaction - Database transaction to ensure atomicity
 * @returns The canceled subscription if one was found and canceled, null otherwise
 */
export const cancelFreeSubscriptionForUpgrade = async (
  customerId: string,
  transaction: DbTransaction
): Promise<Subscription.Record | null> => {
  // Find active subscriptions for the customer
  const activeSubscriptions = await selectSubscriptions(
    {
      customerId,
      status: SubscriptionStatus.Active,
    },
    transaction
  )

  // Filter for free subscriptions (isFreePlan = true)
  const freeSubscriptions = activeSubscriptions.filter(
    (sub) => sub.isFreePlan === true
  )

  if (freeSubscriptions.length === 0) {
    return null
  }

  // If multiple free subscriptions exist (edge case), cancel the most recent one
  const subscriptionToCancel = freeSubscriptions.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime()
  )[0]

  // Cancel the free subscription with special reason
  // Include the renews field from the original subscription for schema validation
  const canceledSubscription = await updateSubscription(
    {
      id: subscriptionToCancel.id,
      renews: subscriptionToCancel.renews,
      status: SubscriptionStatus.Canceled,
      canceledAt: Date.now(),
      cancellationReason: CancellationReason.UpgradedToPaid,
    },
    transaction
  )

  return canceledSubscription
}

/**
 * Links a canceled free subscription to its replacement paid subscription
 * by updating the replacedBySubscriptionId field.
 *
 * @param oldSubscription - The canceled free subscription record
 * @param newSubscriptionId - The ID of the new paid subscription
 * @param transaction - Database transaction
 */
export const linkUpgradedSubscriptions = async (
  oldSubscription: Subscription.Record,
  newSubscriptionId: string,
  transaction: DbTransaction
): Promise<void> => {
  await updateSubscription(
    {
      id: oldSubscription.id,
      renews: oldSubscription.renews,
      replacedBySubscriptionId: newSubscriptionId,
    },
    transaction
  )
}
