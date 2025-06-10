import { BillingPeriod } from '@/db/schema/billingPeriods'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { selectCurrentBillingPeriodForSubscription } from '@/db/tableMethods/billingPeriodMethods'
import {
  bulkCreateOrUpdateSubscriptionItems,
  expireSubscriptionItem,
  selectCurrentlyActiveSubscriptionItems,
} from '@/db/tableMethods/subscriptionItemMethods'
import {
  isSubscriptionInTerminalState,
  selectSubscriptionById,
} from '@/db/tableMethods/subscriptionMethods'
import {
  SubscriptionAdjustmentTiming,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import { DbTransaction } from '@/db/types'
import { bulkInsertBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import { createBillingRun } from './billingRunHelpers'
import { Subscription } from '@/db/schema/subscriptions'
import { AdjustSubscriptionParams } from './schemas'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'

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

  if (
    timing !== SubscriptionAdjustmentTiming.Immediately ||
    !adjustment.prorateCurrentBillingPeriod
  ) {
    return { subscription, subscriptionItems }
  }

  const split = calculateSplitInBillingPeriodBasedOnAdjustmentDate(
    adjustmentDate,
    currentBillingPeriodForSubscription
  )

  const removedAdjustments: BillingPeriodItem.Insert[] =
    existingSubscriptionItemsToRemove.map((item) => ({
      billingPeriodId: currentBillingPeriodForSubscription.id,
      quantity: item.quantity,
      unitPrice: -Math.round(item.unitPrice * split.afterPercentage),
      name: `Proration: Removal of ${item.name ?? ''} x ${
        item.quantity
      }`,
      DiscountRedemptionId: null,
      description: `Prorated removal adjustment for unused period; ${split.afterPercentage}% of billing period remaining (from ${adjustmentDate} - ${currentBillingPeriodForSubscription.endDate})`,
      livemode: item.livemode,
      type: SubscriptionItemType.Static,
      usageMeterId: null,
      usageEventsPerUnit: null,
      discountRedemptionId: null,
    }))

  const addedAdjustments: BillingPeriodItem.Insert[] =
    newSubscriptionItems
      .filter((item) => !('id' in item))
      .map((item) => ({
        billingPeriodId: currentBillingPeriodForSubscription.id,
        quantity: item.quantity,
        unitPrice: Math.round(item.unitPrice * split.afterPercentage),
        name: `Proration: Addition of ${item.name} x ${item.quantity}`,
        DiscountRedemptionId: null,
        description: `Prorated addition adjustment for remaining period; ${split.afterPercentage}% of billing period remaining (from ${adjustmentDate} - ${currentBillingPeriodForSubscription.endDate})`,
        livemode: subscription.livemode,
        type: SubscriptionItemType.Static,
        usageMeterId: null,
        usageEventsPerUnit: null,
        discountRedemptionId: null,
      }))

  const prorationAdjustments: BillingPeriodItem.Insert[] = [
    ...removedAdjustments,
    ...addedAdjustments,
  ]

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
  return { subscription, subscriptionItems }
}
