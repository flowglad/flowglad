import {
  FeatureType,
  FeatureUsageGrantFrequency,
  LedgerTransactionType,
} from '@db-core/enums'
import { Result } from 'better-result'
import { and, eq, inArray } from 'drizzle-orm'
import * as R from 'ramda'
import {
  type LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '@/db/schema/ledgerEntries'
import {
  SubscriptionItemFeature,
  subscriptionItemFeatures,
} from '@/db/schema/subscriptionItemFeatures'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  type UsageCredit,
  usageCredits as usageCreditsTable,
} from '@/db/schema/usageCredits'
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
  selectCurrentlyActiveSubscriptionItems,
} from '@/db/tableMethods/subscriptionItemMethods'
import { expireSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods.server'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { bulkInsertUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import type { NotFoundError } from '@/errors'
import {
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  LedgerTransactionInitiatingSourceType,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'
import { CacheDependency } from '@/utils/cache'
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
 * DELTA CALCULATION: When a usage meter already has credits in the current billing period
 * (from BillingPeriodTransition or previous ManualAdjustment), this function calculates
 * the delta (new prorated amount - existing credits) and only grants the difference.
 * This correctly handles upgrade scenarios:
 *   - Pro (360 credits) -> Mega (900 credits) mid-period at 50% remaining
 *   - Existing: 360 credits (from BillingPeriodTransition at period start)
 *   - New prorated: 450 credits (900 * 0.5)
 *   - Delta granted: 90 credits (450 - 360)
 *   - Total customer credits: 360 + 90 = 450 (not 360 + 450 = 810)
 *
 * For downgrades where new credits <= existing credits, delta is 0 or negative,
 * so no additional credits are granted (customer keeps existing credits).
 *
 * IMPORTANT: Deduplication is based on usageMeterId, NOT subscription_item_feature.id or featureId.
 * This is because BillingPeriodTransition credits don't have a sourceReferenceId pointing to
 * subscription_item_features - they only have usageMeterId. Using usageMeterId ensures we
 * correctly detect and account for credits from billing period start.
 *
 * ASSUMPTION: UsageCreditGrant features always have a non-null usageMeterId.
 * This is enforced by the feature schema where UsageCreditGrant type requires usageMeterId.
 * The non-null assertion (feature.usageMeterId!) at credit insert time relies on this invariant.
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
}): Promise<
  Result<
    {
      usageCredits: UsageCredit.Record[]
      ledgerEntries: LedgerEntry.CreditGrantRecognizedRecord[]
    },
    NotFoundError
  >
> => {
  const { subscription, features, adjustmentDate, transaction } =
    params

  // Filter to UsageCreditGrant features with usageMeterId
  const creditGrantFeatures = features.filter(
    (feature) => feature.type === FeatureType.UsageCreditGrant
  )

  if (R.isEmpty(creditGrantFeatures)) {
    return Result.ok({ usageCredits: [], ledgerEntries: [] })
  }

  const currentBillingPeriod =
    await selectCurrentBillingPeriodForSubscription(
      subscription.id,
      transaction
    )

  if (!currentBillingPeriod) {
    return Result.ok({ usageCredits: [], ledgerEntries: [] })
  }

  const adjustmentTimestamp = new Date(adjustmentDate).getTime()
  const isMidPeriod =
    adjustmentTimestamp > currentBillingPeriod.startDate &&
    adjustmentTimestamp < currentBillingPeriod.endDate

  if (!isMidPeriod) {
    return Result.ok({ usageCredits: [], ledgerEntries: [] })
  }

  // Calculate proration split
  const split = calculateSplitInBillingPeriodBasedOnAdjustmentDate(
    adjustmentDate,
    currentBillingPeriod
  )

  // Extract usage meter IDs from the features we're about to grant credits for
  // UsageMeterId is the stable identifier that connects old plan and new plan credits
  const creditGrantUsageMeterIds = R.uniq(
    creditGrantFeatures
      .map((feature) => feature.usageMeterId)
      .filter((id): id is string => id !== null)
  )

  // If no usage meter IDs, skip (shouldn't happen for valid credit grant features)
  if (creditGrantUsageMeterIds.length === 0) {
    return Result.ok({ usageCredits: [], ledgerEntries: [] })
  }

  // Query ALL existing credits for these usage meters in this billing period
  // This includes BOTH:
  // - BillingPeriodTransition credits (from billing period start, no sourceReferenceId)
  // - ManualAdjustment credits (from previous mid-period adjustments)
  // We query by usageMeterId since BillingPeriodTransition credits don't have sourceReferenceId
  const existingCredits = await transaction
    .select()
    .from(usageCreditsTable)
    .where(
      and(
        eq(usageCreditsTable.subscriptionId, subscription.id),
        eq(
          usageCreditsTable.billingPeriodId,
          currentBillingPeriod.id
        ),
        inArray(
          usageCreditsTable.usageMeterId,
          creditGrantUsageMeterIds
        )
      )
    )

  // Build a map of usageMeterId -> total existing credits in this billing period
  // This allows us to calculate delta (new amount - existing amount) for upgrades
  const existingCreditsByUsageMeterId = new Map<string, number>()
  for (const credit of existingCredits) {
    const usageMeterId = credit.usageMeterId
    const currentTotal =
      existingCreditsByUsageMeterId.get(usageMeterId) ?? 0
    existingCreditsByUsageMeterId.set(
      usageMeterId,
      currentTotal + credit.issuedAmount
    )
  }

  // Build usage credit inserts using delta calculation
  // If existing credits exist for this usage meter, only grant the difference (new - existing)
  // This handles upgrades correctly: Pro (360) -> Mega (900) grants delta of 540, not full 900
  //
  // IMPORTANT: When multiple features share the same usageMeterId, we must:
  // 1. Calculate the total new prorated amount per meter (sum of all features)
  // 2. Calculate ONE delta per meter (total new - existing)
  // 3. Distribute that delta across features, granting each feature up to its prorated amount
  //
  // Without this, existing credits would be subtracted from each feature individually,
  // causing double-subtraction and under-granting credits.

  // Filter features with valid meter IDs
  const featuresWithMeter = creditGrantFeatures.filter(
    (feature) => feature.usageMeterId !== null
  )

  // Step 1: Calculate prorated amounts and aggregate totals per meter
  const featureProratedAmounts = new Map<string, number>()
  const totalNewAmountsByMeter = new Map<string, number>()

  for (const feature of featuresWithMeter) {
    const isEveryBillingPeriod =
      feature.renewalFrequency ===
      FeatureUsageGrantFrequency.EveryBillingPeriod
    const proratedAmount = isEveryBillingPeriod
      ? Math.round(feature.amount * split.afterPercentage)
      : feature.amount // Once features get full amount

    featureProratedAmounts.set(feature.id, proratedAmount)

    const meterId = feature.usageMeterId!
    const currentTotal = totalNewAmountsByMeter.get(meterId) ?? 0
    totalNewAmountsByMeter.set(meterId, currentTotal + proratedAmount)
  }

  // Step 2: Calculate delta per meter and track remaining allocation
  const remainingDeltaByMeter = new Map<string, number>()
  for (const [meterId, totalNew] of totalNewAmountsByMeter) {
    const existingCredits =
      existingCreditsByUsageMeterId.get(meterId) ?? 0
    const delta = totalNew - existingCredits
    if (delta > 0) {
      remainingDeltaByMeter.set(meterId, delta)
    }
  }

  // Step 3: Create credit inserts, distributing delta across features
  // Each feature gets up to its prorated amount, but only if delta remains
  const usageCreditInserts: UsageCredit.Insert[] = []
  for (const feature of featuresWithMeter) {
    const meterId = feature.usageMeterId!
    const remainingDelta = remainingDeltaByMeter.get(meterId) ?? 0

    if (remainingDelta <= 0) {
      continue // No delta left for this meter
    }

    const featureProrated = featureProratedAmounts.get(feature.id)!
    // Grant up to the feature's prorated amount, but no more than remaining delta
    const amountToGrant = Math.min(featureProrated, remainingDelta)

    if (amountToGrant <= 0) {
      continue
    }

    // Subtract from remaining delta for this meter
    remainingDeltaByMeter.set(meterId, remainingDelta - amountToGrant)

    const isEveryBillingPeriod =
      feature.renewalFrequency ===
      FeatureUsageGrantFrequency.EveryBillingPeriod

    usageCreditInserts.push({
      subscriptionId: subscription.id,
      organizationId: subscription.organizationId,
      livemode: subscription.livemode,
      creditType: UsageCreditType.Grant,
      sourceReferenceId: feature.id,
      sourceReferenceType:
        UsageCreditSourceReferenceType.ManualAdjustment,
      billingPeriodId: currentBillingPeriod.id,
      usageMeterId: meterId,
      paymentId: null,
      issuedAmount: amountToGrant,
      issuedAt: Date.now(),
      // EveryBillingPeriod credits expire at period end, Once credits don't expire
      expiresAt: isEveryBillingPeriod
        ? currentBillingPeriod.endDate
        : null,
      status: UsageCreditStatus.Posted,
      notes: null,
      metadata: null,
    })
  }

  if (R.isEmpty(usageCreditInserts)) {
    return Result.ok({ usageCredits: [], ledgerEntries: [] })
  }

  // Bulk insert all usage credits
  const usageCreditsResult = await bulkInsertUsageCredits(
    usageCreditInserts,
    transaction
  )
  if (Result.isError(usageCreditsResult)) {
    return Result.err(usageCreditsResult.error)
  }
  const usageCredits = usageCreditsResult.value

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
  const ledgerEntriesResult = await bulkInsertLedgerEntries(
    ledgerEntryInserts,
    transaction
  )
  if (Result.isError(ledgerEntriesResult)) {
    return Result.err(ledgerEntriesResult.error)
  }

  // Type guard to validate all entries are CreditGrantRecognized
  const ledgerEntries = ledgerEntriesResult.value
  const isCreditGrantRecognized = (
    entry: LedgerEntry.Record
  ): entry is LedgerEntry.CreditGrantRecognizedRecord =>
    entry.entryType === LedgerEntryType.CreditGrantRecognized

  if (!ledgerEntries.every(isCreditGrantRecognized)) {
    throw new Error(
      'Unexpected ledger entry type: expected all entries to be CreditGrantRecognized'
    )
  }

  return Result.ok({
    usageCredits,
    ledgerEntries,
  })
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
 * @param ctx - Transaction context with database transaction and effect callbacks
 * @returns A promise resolving to the created/updated items, features, credits, and ledger entries
 */
export const handleSubscriptionItemAdjustment = async (
  params: {
    subscriptionId: string
    newSubscriptionItems: (
      | SubscriptionItem.Insert
      | SubscriptionItem.Record
    )[]
    adjustmentDate: Date | number
  },
  ctx: TransactionEffectsContext
): Promise<
  Result<
    {
      createdOrUpdatedSubscriptionItems: SubscriptionItem.Record[]
      createdFeatures: SubscriptionItemFeature.Record[]
      usageCredits: UsageCredit.Record[]
      ledgerEntries: LedgerEntry.CreditGrantRecognizedRecord[]
    },
    NotFoundError
  >
> => {
  const { subscriptionId, newSubscriptionItems, adjustmentDate } =
    params
  const { transaction, invalidateCache } = ctx

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
  // We only check the first manually created subscription item because
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
  let createdFeatures: SubscriptionItemFeature.Record[] = []
  if (!R.isEmpty(createdOrUpdatedSubscriptionItems)) {
    const createdFeaturesResult =
      await createSubscriptionFeatureItems(
        createdOrUpdatedSubscriptionItems,
        transaction
      )
    if (Result.isError(createdFeaturesResult)) {
      return Result.err(createdFeaturesResult.error)
    }
    createdFeatures = createdFeaturesResult.value
  }

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
  const subscription = (
    await selectSubscriptionById(subscriptionId, transaction)
  ).unwrap()
  const grantedCreditsResult = await grantProratedCreditsForFeatures({
    subscription,
    features: createdFeatures,
    adjustmentDate,
    transaction,
  })
  if (Result.isError(grantedCreditsResult)) {
    return Result.err(grantedCreditsResult.error)
  }
  const { usageCredits, ledgerEntries } = grantedCreditsResult.value

  // Collect subscription item IDs that need feature cache invalidation:
  // 1. Expired items (their features were expired)
  // 2. Created/updated items (their features were created)
  // 3. Manual item if it had overlapping features expired
  const subscriptionItemIdsWithFeatureChanges = new Set<string>([
    ...itemsToExpire.map((item) => item.id),
    ...createdOrUpdatedSubscriptionItems.map((item) => item.id),
    ...(manualItem && createdFeatures.length > 0
      ? [manualItem.id]
      : []),
  ])

  // Invalidate cache for subscription items and their features
  invalidateCache(
    CacheDependency.subscriptionItems(subscriptionId),
    ...Array.from(subscriptionItemIdsWithFeatureChanges).map((id) =>
      CacheDependency.subscriptionItemFeatures(id)
    )
  )

  return Result.ok({
    createdOrUpdatedSubscriptionItems,
    createdFeatures,
    usageCredits,
    ledgerEntries,
  })
}
