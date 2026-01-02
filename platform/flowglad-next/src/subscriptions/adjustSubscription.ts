import { eq } from 'drizzle-orm'
import type { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Organization } from '@/db/schema/organizations'
import {
  type SubscriptionItem,
  subscriptionItems,
} from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import { standardSubscriptionSelectSchema } from '@/db/schema/subscriptions'
import { bulkInsertBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import { selectCurrentBillingPeriodForSubscription } from '@/db/tableMethods/billingPeriodMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import {
  selectPriceById,
  selectPrices,
} from '@/db/tableMethods/priceMethods'
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
import { attemptBillingRunTask } from '@/trigger/attempt-billing-run'
import { idempotentSendCustomerSubscriptionAdjustedNotification } from '@/trigger/notifications/send-customer-subscription-adjusted-notification'
import { idempotentSendOrganizationSubscriptionAdjustedNotification } from '@/trigger/notifications/send-organization-subscription-adjusted-notification'
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
import {
  createBillingRun,
  executeBillingRun,
} from './billingRunHelpers'
import type { AdjustSubscriptionParams } from './schemas'
import {
  handleSubscriptionItemAdjustment,
  isNonManualSubscriptionItem,
} from './subscriptionItemHelpers'

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
 * Returns both the raw net charge (before capping) and the capped net charge amount.
 */
const calculateCorrectProrationAmount = async (
  currentBillingPeriod: BillingPeriod.Record,
  oldPlanTotalPrice: number,
  newPlanTotalPrice: number,
  percentThroughPeriod: number,
  transaction: DbTransaction
): Promise<{ rawNetCharge: number; netChargeAmount: number }> => {
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
  return { rawNetCharge, netChargeAmount }
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
  if (!primaryItem.priceId) {
    throw new Error(
      `syncSubscriptionWithActiveItems: No price id found for primary item ${primaryItem.id}`
    )
  }
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
 * Adjusts a subscription by changing its subscription items and handling proration.
 *
 * For adjustments with a net charge (> 0):
 * - Calculates proration based on fair value (old plan for time used + new plan for time remaining)
 * - Creates billing period items for the proration amount
 * - Creates and executes a billing run immediately to charge the customer
 * - Subscription items are updated in processOutcomeForBillingRun after payment succeeds
 *
 * For zero-amount adjustments (downgrades with no refund):
 * - Handles subscription item changes directly via handleSubscriptionItemAdjustment
 * - Syncs the subscription record with updated items
 * - No billing run is created since no payment is needed
 *
 * @param input - The adjustment parameters including new subscription items and timing
 * @param organization - The organization making the adjustment
 * @param transaction - The database transaction
 * @returns The updated subscription and currently active subscription items
 */
export const adjustSubscription = async (
  input: AdjustSubscriptionParams,
  organization: Organization.Record,
  transaction: DbTransaction
): Promise<{
  subscription: Subscription.StandardRecord
  subscriptionItems: SubscriptionItem.Record[]
}> => {
  const { adjustment, id } = input
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

  const currentBillingPeriodForSubscription =
    await selectCurrentBillingPeriodForSubscription(
      subscription.id,
      transaction
    )
  if (!currentBillingPeriodForSubscription) {
    throw new Error('Current billing period not found')
  }

  // Users should not be passing in manuallyCreated items here
  // Just in case, we will filter them out
  const nonManualSubscriptionItems = newSubscriptionItems.filter(
    isNonManualSubscriptionItem
  )

  // Validate quantity and unitPrice for non-manual items
  nonManualSubscriptionItems.forEach((item) => {
    if (item.quantity <= 0) {
      throw new Error(
        `Subscription item quantity must be greater than zero. Received: ${item.quantity}`
      )
    }
    if (item.unitPrice < 0) {
      throw new Error(
        `Subscription item unit price cannot be negative. Received: ${item.unitPrice}`
      )
    }
  })

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

  const adjustmentDate =
    timing === SubscriptionAdjustmentTiming.Immediately
      ? Date.now()
      : currentBillingPeriodForSubscription.endDate

  const existingSubscriptionItems =
    await selectCurrentlyActiveSubscriptionItems(
      { subscriptionId: subscription.id },
      new Date(),
      transaction
    )

  const split = calculateSplitInBillingPeriodBasedOnAdjustmentDate(
    adjustmentDate,
    currentBillingPeriodForSubscription
  )

  // Calculate total prices for old and new plans
  const oldPlanTotalPrice = existingSubscriptionItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  )
  const newPlanTotalPrice = nonManualSubscriptionItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  )

  // Use the new correct proration calculation
  const { rawNetCharge, netChargeAmount } =
    await calculateCorrectProrationAmount(
      currentBillingPeriodForSubscription,
      oldPlanTotalPrice,
      newPlanTotalPrice,
      split.beforePercentage,
      transaction
    )

  // Validate: End-of-period adjustments should only be used for downgrades (zero or negative net charge)
  if (
    timing ===
      SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod &&
    rawNetCharge > 0
  ) {
    throw new Error(
      'EndOfCurrentBillingPeriod adjustments are only allowed for downgrades (zero or negative net charge). ' +
        'For upgrades or adjustments with a positive charge, use Immediately timing instead.'
    )
  }

  // Create proration adjustments when there's a net charge
  const prorationAdjustments: BillingPeriodItem.Insert[] = []

  if (netChargeAmount > 0) {
    // Format description similar to createSubscription pattern: single-line with key info
    const prorationPercentage = (split.afterPercentage * 100).toFixed(
      1
    )
    const adjustmentDateStr = new Date(adjustmentDate)
      .toISOString()
      .split('T')[0]
    const periodEndStr = new Date(
      currentBillingPeriodForSubscription.endDate
    )
      .toISOString()
      .split('T')[0]

    prorationAdjustments.push({
      billingPeriodId: currentBillingPeriodForSubscription.id,
      quantity: 1,
      unitPrice: netChargeAmount,
      name: `Proration: Net charge adjustment`,
      description: `Prorated adjustment for ${prorationPercentage}% of billing period (${adjustmentDateStr} to ${periodEndStr})`,
      livemode: subscription.livemode,
      type: SubscriptionItemType.Static,
      discountRedemptionId: null,
    })

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
    const billingRun = await createBillingRun(
      {
        billingPeriod: currentBillingPeriodForSubscription,
        paymentMethod,
        scheduledFor: new Date(),
        isAdjustment: true,
      },
      transaction
    )

    // Execute billing run immediately after creation
    // executeBillingRun uses its own transactions internally
    // handleSubscriptionItemAdjustment will handle creating/updating subscription items in processOutcomeForBillingRun
    await attemptBillingRunTask.trigger({
      billingRun,
      adjustmentParams: {
        newSubscriptionItems:
          nonManualSubscriptionItems as SubscriptionItem.Record[],
        adjustmentDate,
      },
    })
  } else {
    // Zero-amount adjustment: handle subscription items directly (no payment needed)
    // Prepare items with required fields (livemode) before passing to handleSubscriptionItemAdjustment
    const preparedItems = nonManualSubscriptionItems.map((item) => ({
      ...item,
      livemode: subscription.livemode,
    }))

    await handleSubscriptionItemAdjustment({
      subscriptionId: id,
      newSubscriptionItems: preparedItems,
      adjustmentDate: adjustmentDate,
      transaction,
    })

    // For AtEndOfCurrentBillingPeriod, don't sync with future-dated items
    // Sync using current time to preserve the current subscription state
    // The subscription will sync when the items actually become active at the end of the period
    const syncTime =
      timing ===
      SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
        ? Date.now()
        : adjustmentDate

    await syncSubscriptionWithActiveItems(
      {
        subscriptionId: id,
        currentTime: syncTime,
      },
      transaction
    )

    // Send downgrade notifications
    // Use subscription.id + adjustmentDate for idempotency (unique per adjustment)
    const adjustmentId = `${id}-${adjustmentDate}`
    const price = await selectPriceById(
      subscription.priceId,
      transaction
    )

    if (!price) {
      throw new Error(
        `Price ${subscription.priceId} not found for subscription ${subscription.id}`
      )
    }

    await idempotentSendCustomerSubscriptionAdjustedNotification({
      adjustmentId,
      subscriptionId: id,
      customerId: subscription.customerId,
      organizationId: subscription.organizationId,
      adjustmentType: 'downgrade',
      previousItems: existingSubscriptionItems.map((item) => ({
        name: item.name ?? '',
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
      newItems: nonManualSubscriptionItems.map((item) => ({
        name: item.name ?? '',
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
      prorationAmount: null,
      effectiveDate: adjustmentDate,
    })

    await idempotentSendOrganizationSubscriptionAdjustedNotification({
      adjustmentId,
      subscriptionId: id,
      customerId: subscription.customerId,
      organizationId: subscription.organizationId,
      adjustmentType: 'downgrade',
      previousItems: existingSubscriptionItems.map((item) => ({
        name: item.name ?? '',
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
      newItems: nonManualSubscriptionItems.map((item) => ({
        name: item.name ?? '',
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
      prorationAmount: null,
      effectiveDate: adjustmentDate,
      currency: price.currency,
    })
  }

  // Get currently active subscription items to return
  // Note: New items will be created in processOutcomeForBillingRun after payment succeeds
  const currentSubscriptionItems =
    await selectCurrentlyActiveSubscriptionItems(
      { subscriptionId: id },
      new Date(),
      transaction
    )

  const updatedSubscription = await selectSubscriptionById(
    id,
    transaction
  )
  return {
    subscription: standardSubscriptionSelectSchema.parse(
      updatedSubscription
    ),
    subscriptionItems: currentSubscriptionItems,
  }
}
