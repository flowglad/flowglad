import * as R from 'ramda'
import {
  type LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '@/db/schema/ledgerEntries'
import { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageCredit } from '@/db/schema/usageCredits'
import { selectCurrentBillingPeriodForSubscription } from '@/db/tableMethods/billingPeriodMethods'
import { findOrCreateLedgerAccountsForSubscriptionAndUsageMeters } from '@/db/tableMethods/ledgerAccountMethods'
import { bulkInsertLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import { insertLedgerTransaction } from '@/db/tableMethods/ledgerTransactionMethods'
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
  bulkInsertUsageCredits,
  selectUsageCredits,
} from '@/db/tableMethods/usageCreditMethods'
import type { DbTransaction } from '@/db/types'
import {
  FeatureType,
  FeatureUsageGrantFrequency,
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  LedgerTransactionInitiatingSourceType,
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
 * Grants prorated usage credits for subscription item features during mid-period adjustments.
 * Uses bulk operations for consistency with billing period transition grants.
 *
 * For EveryBillingPeriod features: grants prorated amount based on remaining time in period
 * For Once features: grants full amount immediately (no proration, no expiration)
 *
 * @param params.subscription - The subscription record
 * @param params.features - Array of subscription item features to potentially grant credits for
 * @param params.adjustmentDate - The date/time of the adjustment
 * @param params.transaction - The database transaction
 * @returns Object containing granted usage credits and created ledger entries
 */
const grantProratedCreditsForFeatures = async (params: {
  subscription: Subscription.Record
  features: SubscriptionItemFeature.Record[]
  adjustmentDate: Date | number
  transaction: DbTransaction
}): Promise<{
  usageCredits: UsageCredit.Record[]
  ledgerEntries: LedgerEntry.CreditGrantRecognizedRecord[]
}> => {
  const { subscription, features, adjustmentDate, transaction } =
    params

  // Filter to UsageCreditGrant features with usageMeterId
  const creditGrantFeatures = features.filter(
    (feature) => feature.type === FeatureType.UsageCreditGrant
  )

  if (R.isEmpty(creditGrantFeatures)) {
    return { usageCredits: [], ledgerEntries: [] }
  }

  const currentBillingPeriod =
    await selectCurrentBillingPeriodForSubscription(
      subscription.id,
      transaction
    )

  if (!currentBillingPeriod) {
    return { usageCredits: [], ledgerEntries: [] }
  }

  const adjustmentTimestamp = new Date(adjustmentDate).getTime()
  const isMidPeriod =
    adjustmentTimestamp > currentBillingPeriod.startDate &&
    adjustmentTimestamp < currentBillingPeriod.endDate

  if (!isMidPeriod) {
    return { usageCredits: [], ledgerEntries: [] }
  }

  // Calculate proration split
  const split = calculateSplitInBillingPeriodBasedOnAdjustmentDate(
    adjustmentDate,
    currentBillingPeriod
  )

  // Check for existing credits (to avoid double-granting) - batch query
  const existingCredits = await selectUsageCredits(
    {
      subscriptionId: subscription.id,
      billingPeriodId: currentBillingPeriod.id,
      sourceReferenceId: creditGrantFeatures.map(
        (feature) => feature.id
      ),
    },
    transaction
  )
  const existingFeatureIds = new Set(
    existingCredits.map(
      (existingCredit) => existingCredit.sourceReferenceId
    )
  )

  // Build usage credit inserts for features that don't already have credits
  const usageCreditInserts: UsageCredit.Insert[] = creditGrantFeatures
    .filter((feature) => !existingFeatureIds.has(feature.id))
    .map((feature) => {
      const isEveryBillingPeriod =
        feature.renewalFrequency ===
        FeatureUsageGrantFrequency.EveryBillingPeriod

      const issuedAmount = isEveryBillingPeriod
        ? Math.round(feature.amount! * split.afterPercentage)
        : feature.amount! // Once features get full amount

      return {
        subscriptionId: subscription.id,
        organizationId: subscription.organizationId,
        livemode: subscription.livemode,
        creditType: UsageCreditType.Grant,
        sourceReferenceId: feature.id,
        sourceReferenceType:
          UsageCreditSourceReferenceType.ManualAdjustment,
        billingPeriodId: currentBillingPeriod.id,
        usageMeterId: feature.usageMeterId!,
        paymentId: null,
        issuedAmount,
        issuedAt: Date.now(),
        // EveryBillingPeriod credits expire at period end, Once credits don't expire
        expiresAt: isEveryBillingPeriod
          ? currentBillingPeriod.endDate
          : null,
        status: UsageCreditStatus.Posted,
        notes: null,
        metadata: null,
      }
    })
    .filter((insert) => insert.issuedAmount > 0) // Skip zero-amount credits

  if (R.isEmpty(usageCreditInserts)) {
    return { usageCredits: [], ledgerEntries: [] }
  }

  // Bulk insert all usage credits
  const usageCredits = await bulkInsertUsageCredits(
    usageCreditInserts,
    transaction
  )

  // Find or create ledger accounts for the usage meters
  const usageMeterIds = R.uniq(
    usageCredits.map((usageCredit) => usageCredit.usageMeterId)
  )
  const ledgerAccounts =
    await findOrCreateLedgerAccountsForSubscriptionAndUsageMeters(
      {
        subscriptionId: subscription.id,
        usageMeterIds,
      },
      transaction
    )
  const ledgerAccountsByMeterId = new Map(
    ledgerAccounts.map((ledgerAccount) => [
      ledgerAccount.usageMeterId,
      ledgerAccount,
    ])
  )

  // Create a single ledger transaction for all the grants
  const ledgerTransaction = await insertLedgerTransaction(
    {
      organizationId: subscription.organizationId,
      livemode: subscription.livemode,
      type: LedgerTransactionType.CreditGrantRecognized,
      description: 'Mid-period adjustment credit grants',
      metadata: null,
      initiatingSourceType:
        LedgerTransactionInitiatingSourceType.ManualAdjustment,
      initiatingSourceId: subscription.id,
      subscriptionId: subscription.id,
    },
    transaction
  )

  // Build ledger entry inserts
  const ledgerEntryInserts: LedgerEntry.CreditGrantRecognizedInsert[] =
    usageCredits.map((usageCredit) => ({
      ...ledgerEntryNulledSourceIdColumns,
      ledgerTransactionId: ledgerTransaction.id,
      ledgerAccountId: ledgerAccountsByMeterId.get(
        usageCredit.usageMeterId
      )!.id,
      claimedByBillingRunId: null,
      subscriptionId: subscription.id,
      organizationId: subscription.organizationId,
      status: LedgerEntryStatus.Posted,
      livemode: subscription.livemode,
      entryTimestamp: Date.now(),
      metadata: {},
      amount: usageCredit.issuedAmount,
      direction: LedgerEntryDirection.Credit,
      entryType: LedgerEntryType.CreditGrantRecognized,
      discardedAt: null,
      sourceUsageCreditId: usageCredit.id,
      usageMeterId: usageCredit.usageMeterId,
      billingPeriodId: currentBillingPeriod.id,
    }))

  // Bulk insert all ledger entries
  const ledgerEntries = await bulkInsertLedgerEntries(
    ledgerEntryInserts,
    transaction
  )

  return {
    usageCredits,
    ledgerEntries:
      ledgerEntries as LedgerEntry.CreditGrantRecognizedRecord[],
  }
}

/**
 * Handles subscription item adjustment logic using explicit client contract:
 * - Items WITH `id` = keep/update the existing item
 * - Items WITHOUT `id` = create a new item
 * - Existing items NOT in the array = expire them
 *
 * Steps:
 * 1. Fetches all currently active subscription items for the subscription
 * 2. Expires non-manual items whose `id` is NOT in newSubscriptionItems
 * 3. Keeps all manuallyCreated subscription items (preserved through adjustments)
 * 4. Updates existing items (those with matching `id`) or creates new items (no `id`)
 * 5. Creates features for newly created/updated subscription items
 * 6. Expires manual features that overlap with plan features (plan takes precedence)
 * 7. Grants prorated credits for mid-period adjustments with credit-granting features
 *
 * Note: manuallyCreated subscription items have priceId = null, unitPrice = 0, quantity = 0
 * and are preserved through adjustments. Their features are expired only if they overlap
 * with plan features.
 *
 * @param params - The adjustment parameters
 * @param params.subscriptionId - The subscription ID to adjust
 * @param params.newSubscriptionItems - Items to keep/update (with `id`) or create (without `id`)
 * @param params.adjustmentDate - The date/time when the adjustment occurs
 * @param params.transaction - The database transaction
 * @returns A promise resolving to the created/updated items, features, credits, and ledger entries
 */
export const handleSubscriptionItemAdjustment = async (params: {
  subscriptionId: string
  newSubscriptionItems: (
    | SubscriptionItem.Insert
    | SubscriptionItem.Record
  )[]
  adjustmentDate: Date | number
  transaction: DbTransaction
}): Promise<{
  createdSubscriptionItems: SubscriptionItem.Record[]
  createdFeatures: SubscriptionItemFeature.Record[]
  usageCredits: UsageCredit.Record[]
  ledgerEntries: LedgerEntry.CreditGrantRecognizedRecord[]
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
  const currentNonManuallyCreatedItems = currentlyActiveItems.filter(
    isNonManualSubscriptionItem
  )

  // Extract IDs from newSubscriptionItems that have them (items to keep/update)
  // Client contract: items with id = keep/update, items without id = create
  const newSubscriptionItemIds = new Set(
    newSubscriptionItems
      .map((item) => (item as SubscriptionItem.Record).id)
      .filter(Boolean)
  )

  // Expire non-manual items whose id is NOT in newSubscriptionItems
  // AKA existing items the client did not specify
  const itemsToExpire = currentNonManuallyCreatedItems.filter(
    (existingItem) => !newSubscriptionItemIds.has(existingItem.id)
  )

  if (!R.isEmpty(itemsToExpire)) {
    await expireSubscriptionItems(
      itemsToExpire.map((item) => item.id),
      adjustmentDate,
      transaction
    )
  }

  // Get manual subscription item (for checking feature overlaps later)
  // We only check the first manually created susbcription item because
  // there should only ever be one of these (at the current moment)
  const currentManualItems = currentlyActiveItems.filter(
    (item) => item.manuallyCreated
  )
  const manualItem =
    currentManualItems.length > 0 ? currentManualItems[0] : null

  // Build a map of existing items by ID for quick lookup
  const existingItemsById = new Map(
    currentNonManuallyCreatedItems.map((item) => [item.id, item])
  )

  // Create/update subscription items from the provided list
  // Items with id = update existing, items without id = create new
  const subscriptionItemUpserts: (
    | SubscriptionItem.Insert
    | SubscriptionItem.Update
  )[] = newSubscriptionItems.map((newItem) => {
    const existingId = (newItem as SubscriptionItem.Record).id
    const existingItem = existingId
      ? existingItemsById.get(existingId)
      : undefined

    if (existingItem) {
      // Return as Update to update the existing item
      return {
        ...newItem,
        id: existingItem.id,
        subscriptionId,
        addedDate: existingItem.addedDate, // Preserve original addedDate
      } as SubscriptionItem.Update
    } else {
      // Return as Insert for new items (no id provided)
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
    const createdFeatureIds = new Set(
      createdFeatures.map((feature) => feature.featureId)
    )

    // Find manual features that overlap with plan features
    const overlappingManualFeatures = manualFeatures.filter(
      (manualFeature) =>
        createdFeatureIds.has(manualFeature.featureId)
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

  // Grant prorated credits for credit-granting features
  const subscription = await selectSubscriptionById(
    subscriptionId,
    transaction
  )
  const { usageCredits, ledgerEntries } =
    await grantProratedCreditsForFeatures({
      subscription,
      features: createdFeatures,
      adjustmentDate,
      transaction,
    })

  return {
    createdSubscriptionItems: createdOrUpdatedSubscriptionItems,
    createdFeatures,
    usageCredits,
    ledgerEntries,
  }
}
