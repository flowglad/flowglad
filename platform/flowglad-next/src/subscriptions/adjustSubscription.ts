import { BillingPeriod } from '@/db/schema/billingPeriods'
import {
  SubscriptionItem,
  subscriptionItems,
} from '@/db/schema/subscriptionItems'
import { selectCurrentBillingPeriodForSubscription } from '@/db/tableMethods/billingPeriodMethods'
import {
  bulkCreateOrUpdateSubscriptionItems,
  expireSubscriptionItem,
  selectCurrentlyActiveSubscriptionItems,
} from '@/db/tableMethods/subscriptionItemMethods'
import {
  isSubscriptionInTerminalState,
  selectSubscriptionById,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import {
  SubscriptionAdjustmentTiming,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import { DbTransaction } from '@/db/types'
import { eq } from 'drizzle-orm'
import { bulkInsertBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import { createBillingRun } from './billingRunHelpers'
import { Subscription } from '@/db/schema/subscriptions'
import { AdjustSubscriptionParams } from './schemas'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { sumNetTotalSettledPaymentsForBillingPeriod } from '@/utils/paymentHelpers'
import { PaymentStatus } from '@/types'

export const calculateSplitInBillingPeriodBasedOnAdjustmentDate = (
  adjustmentDate: Date | number,
  billingPeriod: BillingPeriod.Record
) => {
  const adjustmentTimestamp = new Date(adjustmentDate).getTime()
  if (adjustmentTimestamp < billingPeriod.startDate) {
    throw new Error(
      'Adjustment date is before billing period start date'
    )
  }
  if (adjustmentTimestamp > billingPeriod.endDate) {
    throw new Error(
      'Adjustment date is after billing period end date'
    )
  }
  const billingPeriodStartMs = billingPeriod.startDate
  const billingPeriodEndMs = billingPeriod.endDate
  const adjustmentDateMs = adjustmentTimestamp

  const totalBillingPeriodMs =
    billingPeriodEndMs - billingPeriodStartMs
  const beforeAbsoluteMilliseconds =
    adjustmentDateMs - billingPeriodStartMs
  const afterAbsoluteMilliseconds =
    billingPeriodEndMs - adjustmentDateMs

  const beforePercentage =
    beforeAbsoluteMilliseconds / totalBillingPeriodMs
  const afterPercentage =
    afterAbsoluteMilliseconds / totalBillingPeriodMs

  return {
    beforeAbsoluteMilliseconds,
    afterAbsoluteMilliseconds,
    beforePercentage,
    afterPercentage,
  }
}

/**
 * Calculates the correct proration amount by considering existing payments and fair value distribution.
 * Prevents double-charging by only charging the difference between fair value and already-paid amounts.
 */
const calculateCorrectProrationAmount = async (
  currentBillingPeriod: BillingPeriod.Record,
  oldPlanTotalPrice: number,
  newPlanTotalPrice: number,
  percentThroughPeriod: number,
  transaction: DbTransaction
): Promise<{ netChargeAmount: number; message: string }> => {
  // Get all payments for the current billing period
  const { payments: existingPayments } =
    await sumNetTotalSettledPaymentsForBillingPeriod(
      currentBillingPeriod.id,
      transaction
    )

  // Calculate fair value for the full billing period
  const oldPlanValue = Math.round(
    oldPlanTotalPrice * percentThroughPeriod
  )
  const newPlanValue = Math.round(
    newPlanTotalPrice * (1 - percentThroughPeriod)
  )
  const totalFairValue = oldPlanValue + newPlanValue

  // Calculate total amount from processing OR succeeded payments
  // Note: We include Processing payments because they represent committed charges
  const totalExistingAmount = existingPayments.reduce(
    (sum, payment) => {
      if (
        payment.status === PaymentStatus.Processing ||
        payment.status === PaymentStatus.Succeeded
      ) {
        return sum + payment.amount
      }
      // Ignore failed payments - don't deduct from fair value calculation
      return sum
    },
    0
  )

  // Calculate net charge (fair value - already paid/processing)
  const rawNetCharge = totalFairValue - totalExistingAmount

  // IMPORTANT: Never issue credits/refunds for downgrades - cap at 0
  const netChargeAmount = Math.max(0, rawNetCharge)

  let message = `Fair value: $${(totalFairValue / 100).toFixed(2)} (${(percentThroughPeriod * 100).toFixed(1)}% old plan + ${((1 - percentThroughPeriod) * 100).toFixed(1)}% new plan)`
  message += `, Already paid/processing: $${(totalExistingAmount / 100).toFixed(2)}`

  if (netChargeAmount === 0) {
    if (rawNetCharge < 0) {
      message += `, No refund for downgrade (would have been -$${(Math.abs(rawNetCharge) / 100).toFixed(2)})`
    } else {
      message += ', No additional charge needed'
    }
    return { netChargeAmount: 0, message }
  } else {
    message += `, Net charge: $${(netChargeAmount / 100).toFixed(2)}`
  }

  return { netChargeAmount, message }
}

/**
 * Synchronizes the subscription record with the currently active and most expensive subscription item.
 * This ensures the subscription header reflects what the customer is actually being charged for.
 * Uses the provided time to determine what's active at that specific moment.
 */
export const syncSubscriptionWithActiveItems = async (
  params: {
    subscriptionId: string
    currentTime: Date | number
  },
  transaction: DbTransaction
): Promise<Subscription.StandardRecord> => {
  const { subscriptionId, currentTime } = params
  // Get all currently active subscription items at the specified time
  const activeItems = await selectCurrentlyActiveSubscriptionItems(
    { subscriptionId },
    currentTime,
    transaction
  )

  if (activeItems.length === 0) {
    // No currently active items - this can happen for "AtEndOfCurrentBillingPeriod" timing
    // where old items are expired but new items haven't started yet.
    // In this case, don't update the subscription record and return current state.
    const currentSubscription = (await selectSubscriptionById(
      subscriptionId,
      transaction
    )) as Subscription.StandardRecord
    return currentSubscription
  }

  // Find the most expensive active item (by unitPrice * quantity)
  // If there's a tie, newer item wins (based on addedDate)
  const primaryItem = activeItems.reduce((mostExpensive, current) => {
    const currentTotal = current.unitPrice * current.quantity
    const mostExpensiveTotal =
      mostExpensive.unitPrice * mostExpensive.quantity

    if (currentTotal > mostExpensiveTotal) {
      return current
    } else if (currentTotal === mostExpensiveTotal) {
      // Tie-breaker: newer item wins
      return current.addedDate > mostExpensive.addedDate
        ? current
        : mostExpensive
    } else {
      return mostExpensive
    }
  })

  // Get current subscription to preserve required fields
  const currentSubscription = await selectSubscriptionById(
    subscriptionId,
    transaction
  )

  // Update subscription record with primary item info
  const subscriptionUpdate: Subscription.Update = {
    id: subscriptionId,
    name: primaryItem.name,
    priceId: primaryItem.priceId,
    renews: currentSubscription.renews, // Preserve existing renews value
  }

  return (await updateSubscription(
    subscriptionUpdate,
    transaction
  )) as Subscription.StandardRecord
}

/**
 * This function
 * 1. Creates new subscription items if inputs are provided that do not have an id (meanign they don't exist yet)
 * 2. Updates existing subscription items if inputs are provided that have an id (meaning they already exist)
 * 3. Expires any existing subscription items on the subscription that are not included in the inputs
 * @param params
 * @param transaction
 * @returns
 */
export const adjustSubscription = async (
  params: AdjustSubscriptionParams,
  transaction: DbTransaction
): Promise<{
  subscription: Subscription.StandardRecord
  subscriptionItems: SubscriptionItem.Record[]
}> => {
  const { adjustment, id } = params
  const { newSubscriptionItems, timing } = adjustment
  const subscription = await selectSubscriptionById(id, transaction)
  if (isSubscriptionInTerminalState(subscription.status)) {
    throw new Error('Subscription is in terminal state')
  }
  if (subscription.status === SubscriptionStatus.CreditTrial) {
    throw new Error('Credit trial subscriptions cannot be adjusted.')
  }
  if (!subscription.renews) {
    throw new Error(
      `Subscription ${subscription.id} is a non-renewing subscription. Non-renewing subscriptions cannot be adjusted.`
    )
  }
  let adjustmentDate: number
  if (timing === SubscriptionAdjustmentTiming.Immediately) {
    adjustmentDate = Date.now()
  } else if (
    timing ===
    SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
  ) {
    adjustmentDate = subscription.currentBillingPeriodEnd!
  } else {
    throw new Error('Invalid timing')
  }

  const existingSubscriptionItems =
    await selectCurrentlyActiveSubscriptionItems(
      { subscriptionId: subscription.id },
      new Date(),
      transaction
    )

  const existingSubscriptionItemsToRemove =
    existingSubscriptionItems.filter(
      (existingItem) =>
        !newSubscriptionItems.some(
          (newItem) =>
            (newItem as SubscriptionItem.Record).id ===
            existingItem.id
        )
    )

  const subscriptionItemUpserts: SubscriptionItem.ClientUpsert[] =
    newSubscriptionItems.map((item) => ({
      ...item,
      subscriptionId: subscription.id,
      addedDate: adjustmentDate,
      livemode: subscription.livemode,
    }))

  for (const item of existingSubscriptionItemsToRemove) {
    await expireSubscriptionItem(item.id, adjustmentDate, transaction)
  }
  const subscriptionItems = await bulkCreateOrUpdateSubscriptionItems(
    // @ts-expect-error - upsert type mismatch
    subscriptionItemUpserts,
    transaction
  )

  const currentBillingPeriodForSubscription =
    await selectCurrentBillingPeriodForSubscription(
      subscription.id,
      transaction
    )

  if (!currentBillingPeriodForSubscription) {
    throw new Error('Current billing period not found')
  }

  // Only sync for immediate adjustments - future adjustments will sync during billing period rollover
  if (
    timing === SubscriptionAdjustmentTiming.Immediately &&
    !adjustment.prorateCurrentBillingPeriod
  ) {
    const updatedSubscription = await syncSubscriptionWithActiveItems(
      {
        subscriptionId: subscription.id,
        currentTime: adjustmentDate,
      },
      transaction
    )
    return { subscription: updatedSubscription, subscriptionItems }
  }

  // For future adjustments (AtEndOfCurrentBillingPeriod), don't sync now
  // The sync will happen when the billing period rolls over
  if (
    timing ===
    SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
  ) {
    return { subscription, subscriptionItems }
  }

  const split = calculateSplitInBillingPeriodBasedOnAdjustmentDate(
    adjustmentDate,
    currentBillingPeriodForSubscription
  )

  // Calculate total prices for old and new plans
  const oldPlanTotalPrice = existingSubscriptionItemsToRemove.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  )
  const newPlanTotalPrice = newSubscriptionItems
    .filter((item) => !('id' in item))
    .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

  // Use the new correct proration calculation
  const { netChargeAmount, message } =
    await calculateCorrectProrationAmount(
      currentBillingPeriodForSubscription,
      oldPlanTotalPrice,
      newPlanTotalPrice,
      split.beforePercentage,
      transaction
    )

  // Create detailed proration adjustments for transparency, even if net charge is 0
  const prorationAdjustments: BillingPeriodItem.Insert[] = []

  // Add removal adjustments for old items (credits)
  const removedAdjustments: BillingPeriodItem.Insert[] =
    existingSubscriptionItemsToRemove.map((item) => ({
      billingPeriodId: currentBillingPeriodForSubscription.id,
      quantity: item.quantity,
      unitPrice: -Math.round(item.unitPrice * split.afterPercentage),
      name: `Proration: Removal of ${item.name ?? ''} x ${item.quantity}`,
      description: `Prorated removal adjustment for unused period; ${(split.afterPercentage * 100).toFixed(1)}% of billing period remaining (from ${adjustmentDate} - ${currentBillingPeriodForSubscription.endDate})`,
      livemode: item.livemode,
      type: SubscriptionItemType.Static,
      usageMeterId: null,
      usageEventsPerUnit: null,
      discountRedemptionId: null,
    }))

  // Add addition adjustments for new items
  const addedAdjustments: BillingPeriodItem.Insert[] =
    newSubscriptionItems
      .filter((item) => !('id' in item))
      .map((item) => ({
        billingPeriodId: currentBillingPeriodForSubscription.id,
        quantity: item.quantity,
        unitPrice: Math.round(item.unitPrice * split.afterPercentage),
        name: `Proration: Addition of ${item.name} x ${item.quantity}`,
        description: `Prorated addition adjustment for remaining period; ${split.afterPercentage}% of billing period remaining (from ${adjustmentDate} - ${currentBillingPeriodForSubscription.endDate})`,
        livemode: subscription.livemode,
        type: SubscriptionItemType.Static,
        usageMeterId: null,
        usageEventsPerUnit: null,
        discountRedemptionId: null,
      }))

  prorationAdjustments.push(
    ...removedAdjustments,
    ...addedAdjustments
  )

  // Add a correction adjustment to reach the correct net charge
  // The netChargeAmount is the total amount that should be charged to the customer
  // The proration adjustments may not add up to this amount, so we need a correction
  const currentTotal = prorationAdjustments.reduce(
    (sum, adj) => sum + adj.unitPrice * adj.quantity,
    0
  )
  const adjustmentNeeded = netChargeAmount - currentTotal

  if (Math.abs(adjustmentNeeded) > 0) {
    prorationAdjustments.push({
      billingPeriodId: currentBillingPeriodForSubscription.id,
      quantity: 1,
      unitPrice: adjustmentNeeded,
      name: `Proration: Net charge adjustment`,
      description: `Adjustment to reach correct net charge. ${message}. Current total: $${(currentTotal / 100).toFixed(2)}, Target: $${(netChargeAmount / 100).toFixed(2)}`,
      livemode: subscription.livemode,
      type: SubscriptionItemType.Static,
      usageMeterId: null,
      usageEventsPerUnit: null,
      discountRedemptionId: null,
    })
  }

  await bulkInsertBillingPeriodItems(
    prorationAdjustments,
    transaction
  )
  let paymentMethodId: string | null =
    subscription.defaultPaymentMethodId ??
    subscription.backupPaymentMethodId ??
    null
  /**
   * TODO: create a more helpful message for adjustment subscriptions on trial
   */
  if (!paymentMethodId) {
    throw new Error(
      `Proration adjust for subscription ${subscription.id} failed. No default or backup payment method was found for the subscription`
    )
  }
  const paymentMethod = await selectPaymentMethodById(
    paymentMethodId,
    transaction
  )
  await createBillingRun(
    {
      billingPeriod: currentBillingPeriodForSubscription,
      paymentMethod,
      scheduledFor: new Date(),
    },
    transaction
  )

  // Sync subscription record with currently active items (including new ones)
  // For immediate adjustments with proration
  const updatedSubscription = await syncSubscriptionWithActiveItems(
    {
      subscriptionId: subscription.id,
      currentTime: adjustmentDate,
    },
    transaction
  )
  return { subscription: updatedSubscription, subscriptionItems }
}
