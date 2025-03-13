import { Subscription } from '@/db/schema/subscriptions'
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
  BillingPeriodStatus,
  SubscriptionCancellationArrangement,
  SubscriptionStatus,
} from '@/types'
import { DbTransaction } from '@/db/types'
import { z } from 'zod'

// Cancel a subscription immediately
export const cancelSubscriptionImmediately = async (
  subscription: Subscription.Record,
  transaction: DbTransaction
) => {
  if (isSubscriptionInTerminalState(subscription.status)) {
    return subscription
  }
  const endDate = new Date()
  const status = SubscriptionStatus.Canceled

  const billingPeriodsForSubscription = await selectBillingPeriods(
    { subscriptionId: subscription.id },
    transaction
  )
  const earliestBillingPeriod = billingPeriodsForSubscription.sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime()
  )[0]
  if (
    earliestBillingPeriod &&
    endDate < earliestBillingPeriod.startDate
  ) {
    throw new Error(
      `Cannot end a subscription before its start date. Subscription start date: ${earliestBillingPeriod.startDate.toISOString()}, received end date: ${endDate.toISOString()}`
    )
  }
  const canceledAt = endDate
  const cancelScheduledAt = null

  let updatedSubscription = await updateSubscription(
    { id: subscription.id, canceledAt, cancelScheduledAt },
    transaction
  )

  const result = await safelyUpdateSubscriptionStatus(
    subscription,
    status,
    transaction
  )
  /**
   * Mark all billing periods that have not started yet as cancelled
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
  }

  if (result) {
    updatedSubscription = result
  }
  return updatedSubscription
}

const cancellationParametersSchema = z.discriminatedUnion('timing', [
  z.object({
    timing: z.literal(
      SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod
    ),
  }),
  z.object({
    timing: z.literal(
      SubscriptionCancellationArrangement.AtFutureDate
    ),
    endDate: z.date(),
  }),
  z.object({
    timing: z.literal(
      SubscriptionCancellationArrangement.Immediately
    ),
  }),
])

export const scheduleSubscriptionCancellationSchema = z.object({
  id: z.string(),
  cancellation: cancellationParametersSchema,
})

export type ScheduleSubscriptionCancellationParams = z.infer<
  typeof scheduleSubscriptionCancellationSchema
>

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

  let endDate: Date

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
    endDate = new Date()
  } else {
    throw new Error('Invalid cancellation arrangement')
  }

  const status = SubscriptionStatus.CancellationScheduled

  const billingPeriodsForSubscription = await selectBillingPeriods(
    { subscriptionId: subscription.id },
    transaction
  )
  const earliestBillingPeriod = billingPeriodsForSubscription.sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime()
  )[0]
  if (
    earliestBillingPeriod &&
    endDate < earliestBillingPeriod.startDate
  ) {
    throw new Error(
      `Cannot end a subscription before its start date. Subscription start date: ${earliestBillingPeriod.startDate.toISOString()}, received end date: ${endDate.toISOString()}`
    )
  }
  const canceledAt = null
  // For AtEndOfCurrentBillingPeriod we set the scheduled end date; for AtFutureDate we keep it null per original logic.
  const cancelScheduledAt =
    timing ===
    SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod
      ? endDate
      : null

  let updatedSubscription = await updateSubscription(
    { id: subscription.id, canceledAt, cancelScheduledAt },
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

  const result = await safelyUpdateSubscriptionStatus(
    subscription,
    status,
    transaction
  )
  if (result) {
    updatedSubscription = result
  }
  return updatedSubscription
}
