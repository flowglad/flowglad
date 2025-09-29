import { BillingPeriod } from '@/db/schema/billingPeriods'
import { SubscriptionItem, subscriptionItems } from '@/db/schema/subscriptionItems'
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
  adjustmentDate: Date,
  billingPeriod: BillingPeriod.Record
) => {
  if (adjustmentDate < billingPeriod.startDate) {
    throw new Error(
      'Adjustment date is before billing period start date'
    )
  }
  if (adjustmentDate > billingPeriod.endDate) {
    throw new Error(
      'Adjustment date is after billing period end date'
    )
  }
  const billingPeriodStartMs = billingPeriod.startDate.getTime()
  const billingPeriodEndMs = billingPeriod.endDate.getTime()
  const adjustmentDateMs = adjustmentDate.getTime()

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
  const { payments: existingPayments } = await sumNetTotalSettledPaymentsForBillingPeriod(
    currentBillingPeriod.id,
    transaction
  )

  // Calculate fair value for the full billing period
  const oldPlanValue = Math.round(oldPlanTotalPrice * percentThroughPeriod)
  const newPlanValue = Math.round(newPlanTotalPrice * (1 - percentThroughPeriod))
  const totalFairValue = oldPlanValue + newPlanValue

  // Calculate total amount from processing OR succeeded payments
  // Note: We include Processing payments because they represent committed charges
  const totalExistingAmount = existingPayments.reduce((sum, payment) => {
    if (payment.status === PaymentStatus.Processing || payment.status === PaymentStatus.Succeeded) {
      return sum + payment.amount
    }
    // Ignore failed payments - don't deduct from fair value calculation
    return sum
  }, 0)

  // Calculate net charge (fair value - already paid/processing)
  const rawNetCharge = totalFairValue - totalExistingAmount
  
  // IMPORTANT: Never issue credits/refunds for downgrades - cap at 0
  const netChargeAmount = Math.max(0, rawNetCharge)

  let message = `Prorated for ${(percentThroughPeriod * 100).toFixed(0)}% of billing period used`

  if (netChargeAmount === 0) {
    if (rawNetCharge < 0) {
      message += `, No additional charge for downgrade`
    } else {
      message += ', No additional charge needed'
    }
    return { netChargeAmount: 0, message }
  } else {
    message += `, Additional charge: $${(netChargeAmount / 100).toFixed(2)}`
  }

  return { netChargeAmount, message }
}

/**
 * Synchronizes the subscription record with the currently active and most expensive subscription item.
 * This ensures the subscription header reflects what the customer is actually being charged for.
 * Always uses the current time to determine what's active NOW.
 */
export const syncSubscriptionWithActiveItems = async (
  subscriptionId: string,
  transaction: DbTransaction
): Promise<Subscription.StandardRecord> => {
  // Get all currently active subscription items at the current time
  const activeItems = await selectCurrentlyActiveSubscriptionItems(
    { subscriptionId },
    new Date(), // Always use current time - what's active NOW
    transaction
  )
  
  if (activeItems.length === 0) {
    // No currently active items - this can happen for "AtEndOfCurrentBillingPeriod" timing
    // where old items are expired but new items haven't started yet.
    // In this case, don't update the subscription record and return current state.
    const currentSubscription = await selectSubscriptionById(subscriptionId, transaction) as Subscription.StandardRecord
    return currentSubscription
  }
  
  // Find the most expensive active item (by unitPrice * quantity)
  // If there's a tie, newer item wins (based on addedDate)
  const primaryItem = activeItems.reduce((mostExpensive, current) => {
    const currentTotal = current.unitPrice * current.quantity
    const mostExpensiveTotal = mostExpensive.unitPrice * mostExpensive.quantity
    
    if (currentTotal > mostExpensiveTotal) {
      return current
    } else if (currentTotal === mostExpensiveTotal) {
      // Tie-breaker: newer item wins
      return current.addedDate > mostExpensive.addedDate ? current : mostExpensive
    } else {
      return mostExpensive
    }
  })
  
  // Get current subscription to preserve required fields
  const currentSubscription = await selectSubscriptionById(subscriptionId, transaction)
  
  // Update subscription record with primary item info
  const subscriptionUpdate: Subscription.Update = {
    id: subscriptionId,
    name: primaryItem.name,
    priceId: primaryItem.priceId,
    renews: currentSubscription.renews, // Preserve existing renews value
  }
  
  return await updateSubscription(subscriptionUpdate, transaction) as Subscription.StandardRecord
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
  let adjustmentDate: Date
  if (timing === SubscriptionAdjustmentTiming.Immediately) {
    adjustmentDate = new Date()
  } else if (
    timing ===
    SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
  ) {
    adjustmentDate = subscription.currentBillingPeriodEnd
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
  if (timing === SubscriptionAdjustmentTiming.Immediately && !adjustment.prorateCurrentBillingPeriod) {
    const updatedSubscription = await syncSubscriptionWithActiveItems(
      subscription.id,
      transaction
    )
    return { subscription: updatedSubscription, subscriptionItems }
  }
  
  // For future adjustments (AtEndOfCurrentBillingPeriod), don't sync now
  // The sync will happen when the billing period rolls over
  if (timing === SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod) {
    return { subscription, subscriptionItems }
  }

  const split = calculateSplitInBillingPeriodBasedOnAdjustmentDate(
    adjustmentDate,
    currentBillingPeriodForSubscription
  )

  // Calculate total prices for old and new plans
  const oldPlanTotalPrice = existingSubscriptionItemsToRemove.reduce(
    (sum, item) => sum + (item.unitPrice * item.quantity),
    0
  )
  const newPlanTotalPrice = newSubscriptionItems
    .filter((item) => !('id' in item))
    .reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)

  // Handle different scenarios
  let netChargeAmount: number
  let message: string

  if (existingSubscriptionItemsToRemove.length === 0 && newSubscriptionItems.filter((item) => !('id' in item)).length > 0) {
    // Add-only scenario: only adding new items, no removals
    // Calculate prorated amount for new items only
    const proratedNewPlanPrice = Math.round(newPlanTotalPrice * split.afterPercentage)
    netChargeAmount = proratedNewPlanPrice
    message = `Add-on prorated for ${(split.afterPercentage * 100).toFixed(0)}% of remaining billing period`
  } else if (existingSubscriptionItemsToRemove.length > 0 && newSubscriptionItems.filter((item) => !('id' in item)).length === 0) {
    // Remove-only scenario: only removing items, no additions
    // No net charge for remove-only scenarios
    netChargeAmount = 0
    message = `Items removed for ${(split.afterPercentage * 100).toFixed(0)}% of remaining billing period`
  } else {
    // Upgrade/downgrade scenario: using the existing proration calculation
    const result = await calculateCorrectProrationAmount(
      currentBillingPeriodForSubscription,
      oldPlanTotalPrice,
      newPlanTotalPrice,
      split.beforePercentage,
      transaction
    )
    netChargeAmount = result.netChargeAmount
    message = result.message
  }

  // Create single net adjustment item for clean customer experience
  const prorationAdjustments: BillingPeriodItem.Insert[] = []
  
  // Create adjustment for audit trail when there are new items to track
  if (newSubscriptionItems.length > 0) {
    // Format plan names with proper English grammar for multiple items
    const formatPlanNames = (items: SubscriptionItem.Record[], isNew: boolean) => {
      if (items.length === 0) return isNew ? 'new plan' : 'previous plan'
      if (items.length === 1) return items[0].name
      if (items.length === 2) return `${items[0].name} and ${items[1].name}`
      if (items.length >= 3) {
        const allButLast = items.slice(0, -1).map(item => item.name).join(', ')
        const last = items[items.length - 1].name
        return `${allButLast}, and ${last}`
      }
    }

    const oldPlanName = formatPlanNames(existingSubscriptionItemsToRemove, false)
    const newPlanName = formatPlanNames(
      newSubscriptionItems.filter((item) => !('id' in item)) as SubscriptionItem.Record[], 
      true
    )
    
    // Format dates for display
    const adjustmentDateStr = adjustmentDate.toISOString().split('T')[0]
    const billingPeriodEndDateStr = currentBillingPeriodForSubscription.endDate.toISOString().split('T')[0]
    
    // Create appropriate description based on scenario
    let description: string
    if (existingSubscriptionItemsToRemove.length === 0 && newSubscriptionItems.filter((item) => !('id' in item)).length > 0) {
      // Add-only scenario
      description = `Added ${newPlanName} on ${adjustmentDateStr}. ${message}`
    } else if (existingSubscriptionItemsToRemove.length > 0 && newSubscriptionItems.filter((item) => !('id' in item)).length === 0) {
      // Remove-only scenario (shouldn't happen since netChargeAmount would be 0)
      description = `Removed ${oldPlanName} on ${adjustmentDateStr}. ${message}`
    } else {
      // Upgrade/downgrade scenario
      description = `Changed from ${oldPlanName} to ${newPlanName} on ${adjustmentDateStr}. ${message}`
    }
    
    prorationAdjustments.push({
      billingPeriodId: currentBillingPeriodForSubscription.id,
      quantity: 1,
      unitPrice: netChargeAmount,
      name: `${newPlanName} (${adjustmentDateStr} - ${billingPeriodEndDateStr})`,
      description,
      livemode: subscription.livemode,
      type: SubscriptionItemType.Static,
      usageMeterId: null,
      usageEventsPerUnit: null,
      discountRedemptionId: null,
    })
  }
  
  await bulkInsertBillingPeriodItems(prorationAdjustments, transaction)
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
    subscription.id,
    transaction
  )
  return { subscription: updatedSubscription, subscriptionItems }
}
