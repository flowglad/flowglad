import * as R from 'ramda'
import type { CreditGrantRecognizedLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import { selectCurrentBillingPeriodForSubscription } from '@/db/tableMethods/billingPeriodMethods'
import {
  expireSubscriptionItemFeature,
  selectSubscriptionItemFeatures,
} from '@/db/tableMethods/subscriptionItemFeatureMethods'
import {
  bulkCreateOrUpdateSubscriptionItems,
  expireSubscriptionItems,
  selectCurrentlyActiveSubscriptionItems,
} from '@/db/tableMethods/subscriptionItemMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import {
  insertUsageCredit,
  selectUsageCredits,
} from '@/db/tableMethods/usageCreditMethods'
import type { DbTransaction } from '@/db/types'
import {
  FeatureType,
  FeatureUsageGrantFrequency,
  LedgerTransactionType,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'
import { calculateSplitInBillingPeriodBasedOnAdjustmentDate } from './adjustSubscription'
import { createSubscriptionFeatureItems } from './subscriptionItemFeatureHelpers'

/**
 * Determines if a subscription item is currently active based on its expiry date.
 * An item is active if it has no expiry date or if the expiry date is in the future.
 */
export const isSubscriptionItemActive = (
  item: Pick<SubscriptionItem.ClientUpsert, 'expiredAt'>
): boolean => {
  return !item.expiredAt || item.expiredAt > Date.now()
}

/**
 * Determines if a subscription item is a non-manuallyCreated.
 * non-manuallyCreated items are billable subscription items that come from a price/product.
 */
export const isNonManualSubscriptionItem = (
  item: Pick<
    SubscriptionItem.ClientUpsert,
    'manuallyCreated' | 'priceId'
  >
): boolean => {
  return (
    !item.manuallyCreated &&
    item.priceId !== null &&
    item.priceId !== undefined
  )
}

/**
 * Determines if a subscription item is an active and not manuallyCreated.
 */
export const isSubscriptionItemActiveAndNonManual = (
  item: Pick<
    SubscriptionItem.ClientUpsert,
    'manuallyCreated' | 'priceId' | 'expiredAt'
  >
): boolean => {
  return (
    isNonManualSubscriptionItem(item) &&
    isSubscriptionItemActive(item)
  )
}

/**
 * Grants prorated usage credits for subscription item features created mid-billing period.
 *
 * This prevents double-granting by checking if credits were already granted at period start,
 * and only grants prorated credits for the remaining portion of the billing period.
 *
 * @param params - The proration parameters
 * @param params.subscription - The subscription record
 * @param params.features - The subscription item features to potentially grant credits for
 * @param params.adjustmentDate - The date/time when the adjustment occurred
 * @param params.transaction - The database transaction
 * @returns Array of ledger commands for the granted credits (if any)
 */
const grantProratedCreditsForFeatures = async (params: {
  subscription: Subscription.Record
  features: SubscriptionItemFeature.Record[]
  adjustmentDate: Date | number
  transaction: DbTransaction
}): Promise<CreditGrantRecognizedLedgerCommand[]> => {
  const { subscription, features, adjustmentDate, transaction } =
    params

  if (R.isEmpty(features)) {
    return []
  }

  const currentBillingPeriod =
    await selectCurrentBillingPeriodForSubscription(
      subscription.id,
      transaction
    )

  if (!currentBillingPeriod) {
    return [] // No billing period = no proration needed
  }

  const adjustmentTimestamp = new Date(adjustmentDate).getTime()
  const isMidPeriod =
    adjustmentTimestamp > currentBillingPeriod.startDate &&
    adjustmentTimestamp < currentBillingPeriod.endDate

  if (!isMidPeriod) {
    return [] // Not mid-period = credits will be granted at next transition
  }

  // Calculate proration split
  const split = calculateSplitInBillingPeriodBasedOnAdjustmentDate(
    adjustmentDate,
    currentBillingPeriod
  )

  // Process only UsageCreditGrant features
  const creditGrantFeatures = features.filter(
    (feature) => feature.type === FeatureType.UsageCreditGrant
  )

  const ledgerCommands: CreditGrantRecognizedLedgerCommand[] = []

  for (const feature of creditGrantFeatures) {
    if (!feature.usageMeterId || !feature.amount) {
      continue
    }

    // Check if credits were already granted for this feature in this period
    const existingCredits = await selectUsageCredits(
      {
        subscriptionId: subscription.id,
        billingPeriodId: currentBillingPeriod.id,
        usageMeterId: feature.usageMeterId,
        sourceReferenceId: feature.id,
      },
      transaction
    )

    if (existingCredits.length > 0) {
      // Credits already granted at period start - don't grant again
      continue
    }

    // Only grant prorated credits for EveryBillingPeriod features
    // (Once features are granted immediately when added manually)
    if (
      feature.renewalFrequency ===
      FeatureUsageGrantFrequency.EveryBillingPeriod
    ) {
      // Calculate prorated amount for remaining time
      const proratedAmount = Math.round(
        feature.amount * split.afterPercentage
      )

      if (proratedAmount > 0) {
        const usageCredit = await insertUsageCredit(
          {
            subscriptionId: subscription.id,
            organizationId: subscription.organizationId,
            livemode: subscription.livemode,
            creditType: UsageCreditType.Grant,
            sourceReferenceId: feature.id,
            sourceReferenceType:
              UsageCreditSourceReferenceType.ManualAdjustment,
            billingPeriodId: currentBillingPeriod.id,
            usageMeterId: feature.usageMeterId,
            paymentId: null,
            issuedAmount: proratedAmount,
            issuedAt: Date.now(),
            expiresAt: currentBillingPeriod.endDate,
            status: UsageCreditStatus.Posted,
            notes: null,
            metadata: null,
          },
          transaction
        )

        const ledgerCommand: CreditGrantRecognizedLedgerCommand = {
          type: LedgerTransactionType.CreditGrantRecognized,
          organizationId: subscription.organizationId,
          livemode: subscription.livemode,
          subscriptionId: subscription.id,
          payload: {
            usageCredit,
          },
        }

        ledgerCommands.push(ledgerCommand)
      }
    }
  }

  return ledgerCommands
}

/**
 * Handles all subscription item adjustment logic for subscription adjustments.
 *
 * This function uses a "heavy hand" approach for simplicity:
 * 1. Fetches all currently active subscription items for the subscription
 * 2. Matches existing non-manual items to new items by priceId + quantity + unitPrice
 * 3. Expires only non-manual items that don't match new items (allows overlapping items to persist)
 * 4. Keeps all manuallyCreated subscription items (and their features persist)
 * 5. Creates/updates subscription items from the provided list
 * 6. Creates features for newly created/updated subscription items
 * 7. Expires manual features that overlap with plan features (plan takes precedence)
 * 8. Grants prorated credits for overlapping items with credit-granting features
 *
 * Note: manuallyCreated subscription items have priceId = null, unitPrice = 0, quantity = 0
 * and are preserved through adjustments. Their features are expired only if they overlap
 * with plan features.
 *
 * @param params - The adjustment parameters
 * @param params.subscriptionId - The subscription ID to adjust
 * @param params.newSubscriptionItems - The subscription items that should exist after adjustment (Insert format)
 * @param params.adjustmentDate - The date/time when the adjustment occurs
 * @param params.transaction - The database transaction
 * @returns A promise resolving to the newly created/updated subscription items and features
 */
export const handleSubscriptionItemAdjustment = async (params: {
  subscriptionId: string
  newSubscriptionItems: SubscriptionItem.Insert[]
  adjustmentDate: Date | number
  transaction: DbTransaction
}): Promise<{
  createdSubscriptionItems: SubscriptionItem.Record[]
  createdFeatures: SubscriptionItemFeature.Record[]
}> => {
  const {
    subscriptionId,
    newSubscriptionItems,
    adjustmentDate,
    transaction,
  } = params

  // Get all currently active subscription items
  const currentlyActiveItems =
    await selectCurrentlyActiveSubscriptionItems(
      { subscriptionId },
      adjustmentDate,
      transaction
    )

  // Separate manuallyCreated items from non-manuallyCreated items
  const nonManuallyCreatedItems = currentlyActiveItems.filter(
    isNonManualSubscriptionItem
  )

  // Match existing items to new items by priceId + quantity + unitPrice
  // This allows overlapping items to persist (solving Issue 2: credit regranting)
  const itemsToExpire = nonManuallyCreatedItems.filter(
    (existingItem) => {
      return !newSubscriptionItems.some(
        (newItem) =>
          newItem.priceId === existingItem.priceId &&
          newItem.quantity === existingItem.quantity &&
          newItem.unitPrice === existingItem.unitPrice
      )
    }
  )

  // Expire only items that don't match (allows overlapping items to persist)
  if (!R.isEmpty(itemsToExpire)) {
    await expireSubscriptionItems(
      itemsToExpire.map((item) => item.id),
      adjustmentDate,
      transaction
    )
  }

  // Get manual subscription item (for checking feature overlaps later)
  const manualItems = currentlyActiveItems.filter(
    (item) => item.manuallyCreated
  )
  const manualItem = manualItems.length > 0 ? manualItems[0] : null

  // Create/update subscription items from the provided list
  // bulkCreateOrUpdateSubscriptionItems will update existing items if they have IDs
  // For new items without IDs, it will create them
  const subscriptionItemUpserts: (
    | SubscriptionItem.Insert
    | SubscriptionItem.Update
  )[] = newSubscriptionItems.map((newItem) => {
    // Try to find matching existing item to preserve its ID
    const matchingExistingItem = nonManuallyCreatedItems.find(
      (existing) =>
        existing.priceId === newItem.priceId &&
        existing.quantity === newItem.quantity &&
        existing.unitPrice === newItem.unitPrice &&
        !existing.expiredAt
    )

    if (matchingExistingItem) {
      // Return as Update to preserve the existing item
      return {
        id: matchingExistingItem.id,
        ...newItem,
        subscriptionId,
        addedDate: matchingExistingItem.addedDate, // Preserve original addedDate
      } as SubscriptionItem.Update
    } else {
      // Return as Insert for new items
      return {
        ...newItem,
        subscriptionId,
        addedDate: adjustmentDate,
      } as SubscriptionItem.Insert
    }
  })

  const createdOrUpdatedSubscriptionItems = R.isEmpty(
    subscriptionItemUpserts
  )
    ? []
    : await bulkCreateOrUpdateSubscriptionItems(
        subscriptionItemUpserts,
        transaction
      )

  // Create features for newly created/updated subscription items
  // createSubscriptionFeatureItems already filters out items without priceId,
  // so manuallyCreated items (which have priceId = null) won't get features created
  const createdFeatures = R.isEmpty(createdOrUpdatedSubscriptionItems)
    ? []
    : await createSubscriptionFeatureItems(
        createdOrUpdatedSubscriptionItems,
        transaction
      )

  // Plan takes precedence: Expire manual features that overlap with plan features
  if (manualItem && createdFeatures.length > 0) {
    const manualFeatures = await selectSubscriptionItemFeatures(
      {
        subscriptionItemId: manualItem.id,
        expiredAt: null,
      },
      transaction
    )

    // Get unique featureIds from newly created plan features
    const planFeatureIds = new Set(
      createdFeatures.map((feature) => feature.featureId)
    )

    // Find manual features that overlap with plan features
    const overlappingManualFeatures = manualFeatures.filter(
      (manualFeature) => planFeatureIds.has(manualFeature.featureId)
    )

    // Expire overlapping manual features (plan takes precedence)
    if (!R.isEmpty(overlappingManualFeatures)) {
      await Promise.all(
        overlappingManualFeatures.map((feature) =>
          expireSubscriptionItemFeature(
            feature,
            adjustmentDate,
            transaction
          )
        )
      )
    }
  }

  // Grant prorated credits for overlapping items with credit-granting features
  const subscription = await selectSubscriptionById(
    subscriptionId,
    transaction
  )
  await grantProratedCreditsForFeatures({
    subscription,
    features: createdFeatures,
    adjustmentDate,
    transaction,
  })

  return {
    createdSubscriptionItems: createdOrUpdatedSubscriptionItems,
    createdFeatures,
  }
}
