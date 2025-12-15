import { eq } from 'drizzle-orm'
import type { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Organization } from '@/db/schema/organizations'
import {
  type SubscriptionItem,
  subscriptionItems,
} from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import { bulkInsertBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import { selectCurrentBillingPeriodForSubscription } from '@/db/tableMethods/billingPeriodMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import { selectPrices } from '@/db/tableMethods/priceMethods'
import {
  bulkCreateOrUpdateSubscriptionItems,
  expireSubscriptionItems,
  selectCurrentlyActiveSubscriptionItems,
} from '@/db/tableMethods/subscriptionItemMethods'
import {
  isSubscriptionInTerminalState,
  selectSubscriptionById,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import type { DbTransaction } from '@/db/types'
import {
  FeatureFlag,
  PaymentStatus,
  PriceType,
  SubscriptionAdjustmentTiming,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import { hasFeatureFlag } from '@/utils/organizationHelpers'
import { sumNetTotalSettledPaymentsForBillingPeriod } from '@/utils/paymentHelpers'
import { createBillingRun } from './billingRunHelpers'
import type { AdjustSubscriptionParams } from './schemas'
import { isNonManualSubscriptionItem } from './subscriptionItemHelpers'

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
  const allActiveSubscriptionItems =
    await selectCurrentlyActiveSubscriptionItems(
      { subscriptionId },
      currentTime,
      transaction
    )
  const activeItems = allActiveSubscriptionItems.filter(
    isNonManualSubscriptionItem
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
  organization: Organization.Record,
  transaction: DbTransaction
): Promise<{
  subscription: Subscription.StandardRecord
  subscriptionItems: SubscriptionItem.Record[]
}> => {
  const { adjustment, id } = params
  const { newSubscriptionItems, timing } = adjustment

  if (
    timing === SubscriptionAdjustmentTiming.Immediately &&
    !hasFeatureFlag(
      organization,
      FeatureFlag.ImmediateSubscriptionAdjustments
    )
  ) {
    throw new Error(
      'Immediate adjustments are in private preview. Please let us know you use this feature: https://github.com/flowglad/flowglad/issues/616'
    )
  }
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
  if (subscription.doNotCharge) {
    throw new Error(
      'Cannot adjust doNotCharge subscriptions. Cancel and create a new subscription instead.'
    )
  }

  // Filter out manual items first
  const nonManualSubscriptionItems = newSubscriptionItems.filter(
    isNonManualSubscriptionItem
  )

  const priceIds = nonManualSubscriptionItems
    .map((item) => item.priceId)
    .filter((id): id is string => id !== null)
  const prices = await selectPrices({ id: priceIds }, transaction)
  const priceMap = new Map(prices.map((price) => [price.id, price]))
  nonManualSubscriptionItems.forEach((item) => {
    const price = priceMap.get(item.priceId!)
    if (!price) {
      throw new Error(`Price ${item.priceId} not found`)
    }
    if (price.type !== PriceType.Subscription) {
      throw new Error(
        `Only recurring prices can be used in subscriptions. Price ${price.id} is of type ${price.type}`
      )
    }
  })

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

  await expireSubscriptionItems(
    existingSubscriptionItemsToRemove.map((item) => item.id),
    adjustmentDate,
    transaction
  )

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
  const oldPlanTotalPrice = existingSubscriptionItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  )
  const newPlanTotalPrice = newSubscriptionItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  )

  // Use the new correct proration calculation
  const { netChargeAmount, message } =
    await calculateCorrectProrationAmount(
      currentBillingPeriodForSubscription,
      oldPlanTotalPrice,
      newPlanTotalPrice,
      split.beforePercentage,
      transaction
    )

  // Add info about existing and new items to the message
  let detailedMessage = message
  const existingNames = existingSubscriptionItems
    .map((item) => item.name || '(unnamed)')
    .join(', ')
  const newNames = newSubscriptionItems
    .map((item) => item.name || '(unnamed)')
    .join(', ')
  if (existingNames) {
    detailedMessage += `\nExisting subscription items: ${existingNames}`
  }
  if (newNames) {
    detailedMessage += `\nNew subscription items: ${newNames}`
  }

  // Create detailed proration adjustments for transparency, even if net charge is 0
  const prorationAdjustments: BillingPeriodItem.Insert[] = []

  const adjustmentNeeded = netChargeAmount
  if (adjustmentNeeded > 0) {
    // no refunds for downgrades
    prorationAdjustments.push({
      billingPeriodId: currentBillingPeriodForSubscription.id,
      quantity: 1,
      unitPrice: adjustmentNeeded,
      name: `Proration: Net charge adjustment`,
      description: detailedMessage,
      livemode: subscription.livemode,
      type: SubscriptionItemType.Static,
      discountRedemptionId: null,
    })
  }

  await bulkInsertBillingPeriodItems(
    prorationAdjustments,
    transaction
  )
  const paymentMethodId: string | null =
    subscription.defaultPaymentMethodId ??
    subscription.backupPaymentMethodId ??
    null
  /**
   * FIXME: create a more helpful message for adjustment subscriptions on trial
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
  // TODO: maybe only create billing run if prorationAdjustments.length > 0
  await createBillingRun(
    {
      billingPeriod: currentBillingPeriodForSubscription,
      paymentMethod,
      scheduledFor: new Date(),
      isAdjustment: true,
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
