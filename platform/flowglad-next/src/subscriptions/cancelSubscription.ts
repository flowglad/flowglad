import { Subscription } from '@/db/schema/subscriptions'
import {
  scheduleSubscriptionCancellationSchema,
  ScheduleSubscriptionCancellationParams,
} from '@/subscriptions/schemas'
import {
  safelyUpdateBillingPeriodStatus,
  selectBillingPeriods,
  selectCurrentBillingPeriodForSubscription,
  updateBillingPeriod,
} from '@/db/tableMethods/billingPeriodMethods'
import {
  isSubscriptionInTerminalState,
  safelyUpdateSubscriptionStatus,
  selectSubscriptionById,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import {
  selectBillingRuns,
  updateBillingRun,
} from '@/db/tableMethods/billingRunMethods'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  SubscriptionCancellationArrangement,
  SubscriptionStatus,
} from '@/types'
import { DbTransaction } from '@/db/types'
import { idempotentSendOrganizationSubscriptionCanceledNotification } from '@/trigger/notifications/send-organization-subscription-canceled-notification'

// Abort all scheduled billing runs for a subscription
export const abortScheduledBillingRuns = async (
  subscriptionId: string,
  transaction: DbTransaction
) => {
  const scheduledBillingRuns = await selectBillingRuns(
    {
      subscriptionId,
      status: BillingRunStatus.Scheduled,
    },
    transaction
  )
  for (const billingRun of scheduledBillingRuns) {
    await updateBillingRun(
      { id: billingRun.id, status: BillingRunStatus.Aborted },
      transaction
    )
  }
}

// Cancel a subscription immediately
export const cancelSubscriptionImmediately = async (
  subscription: Subscription.Record,
  transaction: DbTransaction
) => {
  if (isSubscriptionInTerminalState(subscription.status)) {
    return subscription
  }
  const endDate = Date.now()
  const status = SubscriptionStatus.Canceled

  const billingPeriodsForSubscription = await selectBillingPeriods(
    { subscriptionId: subscription.id },
    transaction
  )
  const earliestBillingPeriod = billingPeriodsForSubscription.sort(
    (a, b) => a.startDate - b.startDate
  )[0]
  if (
    earliestBillingPeriod &&
    endDate < earliestBillingPeriod.startDate
  ) {
    throw new Error(
      `Cannot end a subscription before its start date. Subscription start date: ${new Date(earliestBillingPeriod.startDate).toISOString()}, received end date: ${new Date(endDate).toISOString()}`
    )
  }

  let updatedSubscription = await updateSubscription(
    {
      id: subscription.id,
      canceledAt: endDate,
      cancelScheduledAt: endDate,
      status,
      renews: subscription.renews,
    },
    transaction
  )

  const result = await safelyUpdateSubscriptionStatus(
    subscription,
    status,
    transaction
  )
  /**
   * Mark all billing periods that have not started yet as canceled
   */
  for (const billingPeriod of billingPeriodsForSubscription) {
    if (billingPeriod.startDate > endDate) {
      await safelyUpdateBillingPeriodStatus(
        billingPeriod,
        BillingPeriodStatus.Canceled,
        transaction
      )
    }
    /**
     * Mark the billing period with the cancellation date as completed
     */
    if (
      billingPeriod.startDate < endDate &&
      billingPeriod.endDate > endDate
    ) {
      await safelyUpdateBillingPeriodStatus(
        billingPeriod,
        BillingPeriodStatus.Completed,
        transaction
      )
      await updateBillingPeriod(
        { id: billingPeriod.id, endDate },
        transaction
      )
    }
    /**
     * Mark all prior billing periods with PastDue status as Canceled
     */
    if (billingPeriod.status === BillingPeriodStatus.PastDue) {
      await safelyUpdateBillingPeriodStatus(
        billingPeriod,
        BillingPeriodStatus.Canceled,
        transaction
      )
    }
  }

  /**
   * Abort all scheduled billing runs for the subscription
   */
  await abortScheduledBillingRuns(subscription.id, transaction)

  if (result) {
    updatedSubscription = result
  }
  return updatedSubscription
}

// Schedule a subscription cancellation for the future
export const scheduleSubscriptionCancellation = async (
  params: ScheduleSubscriptionCancellationParams,
  transaction: DbTransaction
): Promise<Subscription.Record> => {
  const { id, cancellation } =
    scheduleSubscriptionCancellationSchema.parse(params)
  const { timing } = cancellation
  const subscription = await selectSubscriptionById(id, transaction)
  if (isSubscriptionInTerminalState(subscription.status)) {
    return subscription
  }

  let endDate: number

  if (
    timing ===
    SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod
  ) {
    const currentBillingPeriod =
      await selectCurrentBillingPeriodForSubscription(
        subscription.id,
        transaction
      )
    if (!currentBillingPeriod) {
      throw new Error('No current billing period found')
    }
    endDate = currentBillingPeriod.endDate
  } else if (
    timing === SubscriptionCancellationArrangement.AtFutureDate
  ) {
    if (!cancellation.endDate) {
      throw new Error(
        'End date is required for future date cancellation'
      )
    }
    endDate = cancellation.endDate
  } else if (
    timing === SubscriptionCancellationArrangement.Immediately
  ) {
    endDate = Date.now()
  } else {
    throw new Error('Invalid cancellation arrangement')
  }

  const status = SubscriptionStatus.CancellationScheduled

  const billingPeriodsForSubscription = await selectBillingPeriods(
    { subscriptionId: subscription.id },
    transaction
  )
  const earliestBillingPeriod = billingPeriodsForSubscription.sort(
    (a, b) => a.startDate - b.startDate
  )[0]
  if (
    earliestBillingPeriod &&
    endDate < earliestBillingPeriod.startDate
  ) {
    throw new Error(
      `Cannot end a subscription before its start date. Subscription start date: ${new Date(earliestBillingPeriod.startDate).toISOString()}, received end date: ${new Date(endDate).toISOString()}`
    )
  }
  // For AtEndOfCurrentBillingPeriod we set the scheduled end date; for AtFutureDate we keep it null per original logic.
  const cancelScheduledAt =
    timing ===
    SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod
      ? endDate
      : undefined
  if (!subscription.renews) {
    throw new Error(
      `Subscription ${subscription.id} is a non-renewing subscription. Non-renewing subscriptions cannot be cancelled (Should never hit this)`
    )
  }
  let updatedSubscription = await updateSubscription(
    {
      id: subscription.id,
      cancelScheduledAt,
      status,
      renews: subscription.renews,
    },
    transaction
  )

  /**
   * Mark all billing periods that have not started yet as scheduled to cancel
   */
  for (const billingPeriod of billingPeriodsForSubscription) {
    if (billingPeriod.startDate > endDate) {
      await safelyUpdateBillingPeriodStatus(
        billingPeriod,
        BillingPeriodStatus.ScheduledToCancel,
        transaction
      )
    }
  }

  /**
   * Abort all scheduled billing runs for the subscription
   */
  await abortScheduledBillingRuns(subscription.id, transaction)

  const result = await safelyUpdateSubscriptionStatus(
    subscription,
    status,
    transaction
  )
  if (result) {
    updatedSubscription = result
  }
  await idempotentSendOrganizationSubscriptionCanceledNotification(
    updatedSubscription
  )
  return updatedSubscription
}
