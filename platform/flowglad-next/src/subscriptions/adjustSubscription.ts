import { Result } from 'better-result'
import { eq } from 'drizzle-orm'
import type { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
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
  selectResourceFeaturesForPrices,
} from '@/db/tableMethods/priceMethods'
import { countActiveResourceClaimsBatch } from '@/db/tableMethods/resourceClaimMethods'
import {
  bulkCreateOrUpdateSubscriptionItems,
  selectCurrentlyActiveSubscriptionItems,
} from '@/db/tableMethods/subscriptionItemMethods'
import { expireSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods.server'
import {
  isSubscriptionInTerminalState,
  selectSubscriptionById,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import { NotFoundError as DbNotFoundError } from '@/db/tableUtils'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import {
  ConflictError,
  NotFoundError,
  TerminalStateError,
  ValidationError,
} from '@/errors'
import { attemptBillingRunTask } from '@/trigger/attempt-billing-run'
import { idempotentSendCustomerSubscriptionAdjustedNotification } from '@/trigger/notifications/send-customer-subscription-adjusted-notification'
import { idempotentSendOrganizationSubscriptionAdjustedNotification } from '@/trigger/notifications/send-organization-subscription-adjusted-notification'
import {
  PaymentStatus,
  PriceType,
  SubscriptionAdjustmentTiming,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import { sumNetTotalSettledPaymentsForBillingPeriod } from '@/utils/paymentHelpers'
import {
  createBillingRun,
  executeBillingRun,
} from './billingRunHelpers'
import type {
  AdjustSubscriptionParams,
  FlexibleSubscriptionItem,
  TerseSubscriptionItem,
} from './schemas'
import {
  handleSubscriptionItemAdjustment,
  isNonManualSubscriptionItem,
} from './subscriptionItemHelpers'

/**
 * Helper type guard to check if an item is a terse subscription item (priceId/priceSlug + quantity only).
 * A terse item must:
 * - Have at least one of priceId or priceSlug defined (as a string)
 * - Have quantity defined (as a number)
 * - Only contain keys from the allowed set: ['priceId', 'priceSlug', 'quantity']
 */
const isTerseSubscriptionItem = (
  item: FlexibleSubscriptionItem
): item is TerseSubscriptionItem => {
  // Get only the defined keys (filter out undefined values)
  const definedKeys = Object.keys(item).filter(
    (k) => item[k as keyof typeof item] !== undefined
  )
  const allowedTerseKeys = ['priceId', 'priceSlug', 'quantity']

  // All defined keys must be within the allowed terse keys
  const allKeysAreTerse = definedKeys.every((key) =>
    allowedTerseKeys.includes(key)
  )
  if (!allKeysAreTerse) {
    return false
  }

  // Must have at least one of priceId or priceSlug defined as a string
  const hasPriceIdentifier =
    ('priceId' in item && typeof item.priceId === 'string') ||
    ('priceSlug' in item && typeof item.priceSlug === 'string')
  if (!hasPriceIdentifier) {
    return false
  }

  // Quantity must be defined and be a number (when present)
  // Note: quantity has a default of 1 in the schema, so it should always be present after parsing
  if ('quantity' in item && typeof item.quantity !== 'number') {
    return false
  }

  return true
}

/**
 * Helper type guard to check if an item has a priceSlug field
 */
const hasSlug = (
  item: FlexibleSubscriptionItem
): item is FlexibleSubscriptionItem & { priceSlug: string } => {
  return 'priceSlug' in item && typeof item.priceSlug === 'string'
}

/**
 * Auto-detect timing based on whether this is an upgrade or downgrade.
 * - Upgrade (net charge > 0): Apply immediately (customer wants features now)
 * - Downgrade (net charge < 0): Apply at end of period (customer gets value until period ends)
 * - Same price: Apply immediately (no financial impact)
 */
export const autoDetectTiming = (
  currentPlanTotal: number,
  newPlanTotal: number
):
  | SubscriptionAdjustmentTiming.Immediately
  | SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod => {
  const netCharge = newPlanTotal - currentPlanTotal

  if (netCharge > 0) {
    // Upgrade: Apply immediately (customer wants features now)
    return SubscriptionAdjustmentTiming.Immediately
  } else if (netCharge < 0) {
    // Downgrade: Apply at end of period (customer gets value until period ends)
    return SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
  } else {
    // Same price (e.g., quantity change): Apply immediately (no financial impact)
    return SubscriptionAdjustmentTiming.Immediately
  }
}

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
    const currentSubscription = (
      await selectSubscriptionById(subscriptionId, transaction)
    ).unwrap() as Subscription.StandardRecord
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
  const currentSubscription = (
    await selectSubscriptionById(subscriptionId, transaction)
  ).unwrap()

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
 * Result of subscription adjustment including metadata about what was applied.
 */
export interface AdjustSubscriptionResult {
  subscription: Subscription.StandardRecord
  subscriptionItems: SubscriptionItem.Record[]
  /**
   * The actual timing that was applied. Useful when 'auto' timing was requested
   * to know whether the adjustment happened immediately or at end of period.
   */
  resolvedTiming:
    | SubscriptionAdjustmentTiming.Immediately
    | SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
  /**
   * Whether this adjustment is an upgrade (true) or downgrade/lateral move (false).
   * An upgrade means the new plan total is greater than the old plan total.
   */
  isUpgrade: boolean
  /**
   * The trigger.dev run ID for the billing run task, if one was triggered.
   * Only present when an immediate adjustment with proration triggers a billing run.
   * The caller should wait for this run to complete before considering the adjustment done.
   */
  pendingBillingRunId?: string
}

/**
 * Result of successful adjustment calculation preview.
 * Contains all the information needed to display a preview to the user.
 */
export interface AdjustmentCalculationResult {
  canAdjust: true
  /** Epoch milliseconds when this preview was generated - for staleness detection */
  previewGeneratedAt: number
  /** The proration amount that will be charged (capped at 0 for downgrades) */
  prorationAmount: number
  /** The raw net charge before capping (can be negative for downgrades) */
  rawNetCharge: number
  /** Total price of the current plan */
  currentPlanTotal: number
  /** Total price of the new plan */
  newPlanTotal: number
  /** The resolved timing (immediate or end-of-period) */
  resolvedTiming:
    | SubscriptionAdjustmentTiming.Immediately
    | SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
  /** Epoch milliseconds when the adjustment will take effect */
  effectiveDate: number
  /** Whether this is an upgrade (new plan total > current plan total) */
  isUpgrade: boolean
  /** Percentage through the current billing period (0-1) */
  percentThroughBillingPeriod: number
  /** Epoch milliseconds when the current billing period ends */
  billingPeriodEnd: number
  /** ID of the payment method that will be charged, if applicable */
  paymentMethodId: string | null
  /** Current subscription items */
  currentSubscriptionItems: SubscriptionItem.Record[]
  /** Resolved new subscription items with priceId and all fields populated */
  resolvedNewSubscriptionItems: SubscriptionItem.ClientInsert[]
}

/**
 * Result of failed adjustment calculation preview.
 * Contains the reason the adjustment cannot be made.
 */
export interface AdjustmentCalculationFailure {
  canAdjust: false
  /** Epoch milliseconds when this preview was generated - for consistency */
  previewGeneratedAt: number
  /** Human-readable reason the adjustment cannot be made */
  reason: string
}

/**
 * Union type for adjustment calculation output.
 * Either a successful calculation with all details, or a failure with reason.
 */
export type AdjustmentCalculationOutput =
  | AdjustmentCalculationResult
  | AdjustmentCalculationFailure

/**
 * Calculates a preview of a subscription adjustment without making any changes.
 * Returns all the information needed to display a preview to the user,
 * including whether the adjustment can be made and why not if it can't.
 *
 * This function contains the validation and calculation logic extracted from
 * `adjustSubscription` so that both the preview and actual adjustment use
 * the same logic.
 *
 * @param input - The adjustment parameters
 * @param transaction - Database transaction
 * @returns Either a successful calculation result or a failure with reason
 */
export const calculateAdjustmentPreview = async (
  input: AdjustSubscriptionParams,
  transaction: DbTransaction
): Promise<AdjustmentCalculationOutput> => {
  const previewGeneratedAt = Date.now()
  const { adjustment, id } = input
  const { newSubscriptionItems } = adjustment
  const requestedTiming = adjustment.timing

  // Fetch subscription
  const subscriptionResult = await selectSubscriptionById(
    id,
    transaction
  )
  if (Result.isError(subscriptionResult)) {
    return {
      canAdjust: false,
      previewGeneratedAt,
      reason: `Subscription not found: ${id}`,
    }
  }
  const subscription = subscriptionResult.value

  // Validate subscription state
  if (isSubscriptionInTerminalState(subscription.status)) {
    return {
      canAdjust: false,
      previewGeneratedAt,
      reason: `Subscription is in terminal state: ${subscription.status}`,
    }
  }

  if (subscription.status === SubscriptionStatus.CreditTrial) {
    return {
      canAdjust: false,
      previewGeneratedAt,
      reason: 'Credit trial subscriptions cannot be adjusted.',
    }
  }

  if (!subscription.renews) {
    return {
      canAdjust: false,
      previewGeneratedAt,
      reason: `Subscription ${subscription.id} is a non-renewing subscription. Non-renewing subscriptions cannot be adjusted.`,
    }
  }

  if (subscription.doNotCharge) {
    return {
      canAdjust: false,
      previewGeneratedAt,
      reason:
        'Cannot adjust doNotCharge subscriptions. Cancel and create a new subscription instead.',
    }
  }

  if (subscription.isFreePlan) {
    return {
      canAdjust: false,
      previewGeneratedAt,
      reason:
        'Cannot adjust free plan subscriptions. Use createSubscription to upgrade from a free plan instead.',
    }
  }

  // Get current billing period
  const currentBillingPeriodForSubscription =
    await selectCurrentBillingPeriodForSubscription(
      subscription.id,
      transaction
    )
  if (!currentBillingPeriodForSubscription) {
    return {
      canAdjust: false,
      previewGeneratedAt,
      reason: 'No current billing period found for subscription.',
    }
  }

  // Resolve prices
  const pricingModelId = subscription.pricingModelId

  // Collect all slugs and price IDs that need resolution
  const slugsToResolve = newSubscriptionItems
    .filter(hasSlug)
    .map((item) => item.priceSlug)

  const priceIdsToResolve = newSubscriptionItems
    .filter((item) => isTerseSubscriptionItem(item) && !hasSlug(item))
    .map((item) => (item as TerseSubscriptionItem).priceId)
    .filter((priceId): priceId is string => !!priceId)

  // Batch fetch prices by slug (scoped to pricing model)
  const pricesBySlug = new Map<string, Price.Record>()
  if (slugsToResolve.length > 0) {
    const slugPrices = await selectPrices(
      {
        slug: slugsToResolve,
        pricingModelId,
        active: true,
      },
      transaction
    )
    for (const price of slugPrices) {
      if (price.slug) {
        pricesBySlug.set(price.slug, price)
      }
    }
  }

  // Batch fetch prices by ID (includes slugs not found above - they may be UUIDs)
  const slugsNotFoundAsSlug = slugsToResolve.filter(
    (s) => !pricesBySlug.has(s)
  )
  const allIdsToFetch = [...priceIdsToResolve, ...slugsNotFoundAsSlug]

  const pricesById = new Map<string, Price.Record>()
  if (allIdsToFetch.length > 0) {
    const idPrices = await selectPrices(
      {
        id: allIdsToFetch,
        pricingModelId,
        active: true,
      },
      transaction
    )
    for (const price of idPrices) {
      pricesById.set(price.id, price)
    }
  }

  // Expand terse items to full subscription items
  const resolvedSubscriptionItems: SubscriptionItem.ClientInsert[] =
    []
  for (const item of newSubscriptionItems) {
    if (hasSlug(item)) {
      // Try slug first, then fall back to ID lookup
      const resolvedPrice =
        pricesBySlug.get(item.priceSlug) ??
        pricesById.get(item.priceSlug)

      if (!resolvedPrice) {
        return {
          canAdjust: false,
          previewGeneratedAt,
          reason: `Price not found: ${item.priceSlug}`,
        }
      }

      // Check if this is a terse item or a full item with priceSlug
      if (isTerseSubscriptionItem(item)) {
        // Terse item: construct full subscription item from price
        resolvedSubscriptionItems.push({
          name: resolvedPrice.name,
          unitPrice: resolvedPrice.unitPrice,
          quantity: item.quantity ?? 1,
          priceId: resolvedPrice.id,
          type: SubscriptionItemType.Static,
          addedDate: Date.now(),
          subscriptionId: id,
        })
      } else {
        // Full item with priceSlug: replace priceSlug with resolved priceId
        const { priceSlug: _ignored, ...restOfItem } = item
        resolvedSubscriptionItems.push({
          ...restOfItem,
          priceId: resolvedPrice.id,
        } as SubscriptionItem.ClientInsert)
      }
    } else if (isTerseSubscriptionItem(item) && item.priceId) {
      // Terse item with priceId: expand to full subscription item
      const price = pricesById.get(item.priceId)
      if (!price) {
        return {
          canAdjust: false,
          previewGeneratedAt,
          reason: `Price not found: ${item.priceId}`,
        }
      }
      resolvedSubscriptionItems.push({
        name: price.name,
        unitPrice: price.unitPrice,
        quantity: item.quantity ?? 1,
        priceId: price.id,
        type: SubscriptionItemType.Static,
        addedDate: Date.now(),
        subscriptionId: id,
      })
    } else {
      // Already a full subscription item
      resolvedSubscriptionItems.push(
        item as SubscriptionItem.ClientInsert
      )
    }
  }

  // Filter out manually created items
  const nonManualSubscriptionItems = resolvedSubscriptionItems.filter(
    isNonManualSubscriptionItem
  )

  // Validate quantity and unitPrice for non-manual items
  for (const item of nonManualSubscriptionItems) {
    if (item.quantity <= 0) {
      return {
        canAdjust: false,
        previewGeneratedAt,
        reason: `Subscription item quantity must be greater than zero. Received: ${item.quantity}`,
      }
    }
    if (item.unitPrice < 0) {
      return {
        canAdjust: false,
        previewGeneratedAt,
        reason: `Subscription item unit price cannot be negative. Received: ${item.unitPrice}`,
      }
    }
  }

  // Validate price types
  const priceIds = nonManualSubscriptionItems
    .map((item) => item.priceId)
    .filter((priceId): priceId is string => priceId != null)
  const prices = await selectPrices({ id: priceIds }, transaction)
  const priceMap = new Map(prices.map((price) => [price.id, price]))
  for (const item of nonManualSubscriptionItems) {
    const price = priceMap.get(item.priceId!)
    if (!price) {
      return {
        canAdjust: false,
        previewGeneratedAt,
        reason: `Price not found: ${item.priceId}`,
      }
    }
    if (price.type !== PriceType.Subscription) {
      return {
        canAdjust: false,
        previewGeneratedAt,
        reason: `Only recurring prices can be used in subscriptions. Price ${price.id} is of type ${price.type}`,
      }
    }
  }

  // Get existing subscription items
  const existingSubscriptionItems =
    await selectCurrentlyActiveSubscriptionItems(
      { subscriptionId: subscription.id },
      new Date(),
      transaction
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

  // Validate resource capacity for downgrades
  const itemPriceIds = nonManualSubscriptionItems
    .map((item) => item.priceId)
    .filter((priceId): priceId is string => priceId != null)

  if (itemPriceIds.length > 0) {
    // Batch fetch resource features for all prices
    const priceToResourceFeatures =
      await selectResourceFeaturesForPrices(itemPriceIds, transaction)

    // Collect all unique resourceIds across all features
    const allResourceIds = new Set<string>()
    for (const features of priceToResourceFeatures.values()) {
      for (const feature of features) {
        allResourceIds.add(feature.resourceId)
      }
    }

    // Batch fetch claim counts for all resources
    const resourceClaimCounts =
      allResourceIds.size > 0
        ? await countActiveResourceClaimsBatch(
            {
              subscriptionId: subscription.id,
              resourceIds: [...allResourceIds],
            },
            transaction
          )
        : new Map<string, number>()

    // Aggregate capacity by resourceId across all subscription items
    const resourceCapacityMap = new Map<
      string,
      { totalCapacity: number; featureSlug: string }
    >()
    for (const newItem of nonManualSubscriptionItems) {
      if (!newItem.priceId) continue

      const resourceFeatures =
        priceToResourceFeatures.get(newItem.priceId) ?? []

      for (const feature of resourceFeatures) {
        const capacityContribution = feature.amount * newItem.quantity
        const existing = resourceCapacityMap.get(feature.resourceId)
        if (existing) {
          existing.totalCapacity += capacityContribution
        } else {
          resourceCapacityMap.set(feature.resourceId, {
            totalCapacity: capacityContribution,
            featureSlug: feature.slug,
          })
        }
      }
    }

    // Validate aggregated capacity against active claims
    for (const [
      resourceId,
      { totalCapacity, featureSlug },
    ] of resourceCapacityMap) {
      const activeClaims = resourceClaimCounts.get(resourceId) ?? 0

      if (activeClaims > totalCapacity) {
        return {
          canAdjust: false,
          previewGeneratedAt,
          reason:
            `Cannot reduce capacity to ${totalCapacity}. ` +
            `${activeClaims} resources are currently claimed. ` +
            `Release ${activeClaims - totalCapacity} claims before downgrading.`,
        }
      }
    }
  }

  const isUpgrade = newPlanTotalPrice > oldPlanTotalPrice

  // Resolve 'auto' timing to actual timing based on upgrade vs downgrade
  const resolvedTiming:
    | SubscriptionAdjustmentTiming.Immediately
    | SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod =
    requestedTiming === SubscriptionAdjustmentTiming.Auto
      ? autoDetectTiming(oldPlanTotalPrice, newPlanTotalPrice)
      : requestedTiming

  const adjustmentDate =
    resolvedTiming === SubscriptionAdjustmentTiming.Immediately
      ? Date.now()
      : currentBillingPeriodForSubscription.endDate

  const split = calculateSplitInBillingPeriodBasedOnAdjustmentDate(
    adjustmentDate,
    currentBillingPeriodForSubscription
  )

  // Calculate proration
  const { rawNetCharge, netChargeAmount } =
    await calculateCorrectProrationAmount(
      currentBillingPeriodForSubscription,
      oldPlanTotalPrice,
      newPlanTotalPrice,
      split.beforePercentage,
      transaction
    )

  // Validate: End-of-period adjustments should only be used for downgrades
  if (
    resolvedTiming ===
      SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod &&
    newPlanTotalPrice > oldPlanTotalPrice
  ) {
    return {
      canAdjust: false,
      previewGeneratedAt,
      reason:
        'EndOfCurrentBillingPeriod adjustments are only allowed for downgrades (zero or negative net charge). ' +
        'For upgrades or adjustments with a positive charge, use Immediately timing instead.',
    }
  }

  // End-of-period adjustments never create mid-period proration charges
  const effectiveNetChargeAmount =
    resolvedTiming ===
    SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
      ? 0
      : netChargeAmount

  // Determine if we need a payment method for immediate proration
  const shouldProrate =
    'prorateCurrentBillingPeriod' in adjustment
      ? adjustment.prorateCurrentBillingPeriod
      : true

  const paymentMethodId: string | null =
    subscription.defaultPaymentMethodId ??
    subscription.backupPaymentMethodId ??
    null

  // Validate payment method for immediate prorated adjustments
  if (
    effectiveNetChargeAmount > 0 &&
    shouldProrate &&
    !paymentMethodId
  ) {
    return {
      canAdjust: false,
      previewGeneratedAt,
      reason:
        'No payment method found for subscription. A payment method is required for immediate adjustments with proration.',
    }
  }

  // Proration amount is the effective net charge amount (or 0 if proration is disabled)
  const prorationAmount =
    effectiveNetChargeAmount > 0 && shouldProrate
      ? effectiveNetChargeAmount
      : 0

  return {
    canAdjust: true,
    previewGeneratedAt,
    prorationAmount,
    rawNetCharge,
    currentPlanTotal: oldPlanTotalPrice,
    newPlanTotal: newPlanTotalPrice,
    resolvedTiming,
    effectiveDate: adjustmentDate,
    isUpgrade,
    percentThroughBillingPeriod: split.beforePercentage,
    billingPeriodEnd: currentBillingPeriodForSubscription.endDate,
    paymentMethodId,
    currentSubscriptionItems: existingSubscriptionItems,
    resolvedNewSubscriptionItems: nonManualSubscriptionItems,
  }
}

/**
 * Converts a preview failure reason to an appropriate domain error.
 *
 * IMPORTANT: This function relies on string matching against reason text from
 * calculateAdjustmentPreview. If reason message formats change, update the
 * matching logic here. Falls back to ValidationError which preserves the
 * full reason text, so functionality is not broken on mismatch.
 */
const convertPreviewFailureToError = (
  reason: string,
  subscriptionId: string
): AdjustSubscriptionError => {
  // Check for terminal state
  if (reason.includes('terminal state')) {
    const statusMatch = reason.match(/terminal state: (\w+)/)
    const status = statusMatch ? statusMatch[1] : 'unknown'
    return new TerminalStateError(
      'Subscription',
      subscriptionId,
      status
    )
  }

  // Check for not found errors (explicit "not found" phrase)
  if (reason.includes('not found')) {
    if (reason.includes('Subscription')) {
      return new NotFoundError('Subscription', subscriptionId)
    }
    if (
      reason.includes('billing period') ||
      reason.includes('BillingPeriod')
    ) {
      return new NotFoundError(
        'BillingPeriod',
        `subscription:${subscriptionId}`
      )
    }
    if (reason.includes('Price')) {
      const priceMatch = reason.match(/Price not found: (.+)/)
      const priceId = priceMatch ? priceMatch[1] : 'unknown'
      return new NotFoundError('Price', priceId)
    }
    return new NotFoundError('Resource', 'unknown')
  }

  // Check for billing period issues (e.g., "No current billing period found")
  // These are effectively "not found" errors
  if (
    reason.includes('billing period') &&
    (reason.toLowerCase().includes('no ') || reason.includes('found'))
  ) {
    return new NotFoundError(
      'BillingPeriod',
      `subscription:${subscriptionId}`
    )
  }

  // Check for resource capacity conflicts
  if (reason.includes('Cannot reduce capacity')) {
    return new ConflictError('resource', reason)
  }

  // Default to validation error
  return new ValidationError('subscription', reason)
}

/**
 * Adjusts a subscription by changing its subscription items and handling proration.
 *
 * For adjustments with a net charge (> 0) and proration enabled:
 * - Calculates proration based on fair value (old plan for time used + new plan for time remaining)
 * - Creates billing period items for the proration amount
 * - Creates and executes a billing run immediately to charge the customer
 * - Subscription items are updated in processOutcomeForBillingRun after payment succeeds
 *
 * For adjustments with proration disabled (prorateCurrentBillingPeriod: false):
 * - Applies subscription item changes immediately without mid-period charge
 * - New pricing takes effect immediately but customer is not charged until next billing period
 *
 * For zero-amount adjustments (downgrades with no refund):
 * - Handles subscription item changes directly via handleSubscriptionItemAdjustment
 * - Syncs the subscription record with updated items
 * - No billing run is created since no payment is needed
 *
 * Supports:
 * - priceSlug resolution: Use priceSlug instead of priceId to reference prices
 * - Terse subscription items: Just specify priceId/priceSlug and quantity
 * - Auto timing: Automatically determines timing based on upgrade vs downgrade
 * - prorateCurrentBillingPeriod: Control whether mid-period charges are applied (default: true)
 *
 * @param input - The adjustment parameters including new subscription items and timing
 * @param organization - The organization making the adjustment
 * @param ctx - Transaction context with database transaction and effect callbacks
 * @returns The updated subscription, subscription items, and metadata about the adjustment
 */
export type AdjustSubscriptionError =
  | TerminalStateError
  | ValidationError
  | NotFoundError
  | ConflictError

export const adjustSubscription = async (
  input: AdjustSubscriptionParams,
  organization: Organization.Record,
  ctx: TransactionEffectsContext
): Promise<
  Result<AdjustSubscriptionResult, AdjustSubscriptionError>
> => {
  const { transaction } = ctx
  const { adjustment, id } = input

  // Extract prorateCurrentBillingPeriod - defaults to true if not provided
  const shouldProrate =
    'prorateCurrentBillingPeriod' in adjustment
      ? adjustment.prorateCurrentBillingPeriod
      : true

  // Step 1: Calculate the adjustment preview (validation + calculation)
  const previewResult = await calculateAdjustmentPreview(
    input,
    transaction
  )

  // Step 2: If adjustment cannot be made, convert to appropriate error
  if (!previewResult.canAdjust) {
    return Result.err(
      convertPreviewFailureToError(previewResult.reason, id)
    )
  }

  // Step 3: Use the calculation results to proceed with the mutation
  const {
    resolvedTiming,
    effectiveDate: adjustmentDate,
    isUpgrade,
    prorationAmount,
    percentThroughBillingPeriod,
    billingPeriodEnd,
    resolvedNewSubscriptionItems: nonManualSubscriptionItems,
    currentSubscriptionItems: existingSubscriptionItems,
    paymentMethodId,
  } = previewResult

  // Fetch subscription and billing period for mutation
  // (we need the full records for the mutation logic)
  const subscriptionResult = await selectSubscriptionById(
    id,
    transaction
  )
  if (Result.isError(subscriptionResult)) {
    return Result.err(new NotFoundError('Subscription', id))
  }
  const subscription = subscriptionResult.value

  const currentBillingPeriodForSubscription =
    await selectCurrentBillingPeriodForSubscription(
      subscription.id,
      transaction
    )
  if (!currentBillingPeriodForSubscription) {
    return Result.err(
      new NotFoundError(
        'BillingPeriod',
        `subscription:${subscription.id}`
      )
    )
  }

  // Calculate effective net charge (0 for end-of-period, prorationAmount for immediate)
  const effectiveNetChargeAmount =
    resolvedTiming ===
    SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
      ? 0
      : prorationAmount

  // Create proration adjustments when there's a net charge AND proration is enabled
  const prorationAdjustments: BillingPeriodItem.Insert[] = []

  // Track pending billing run ID for immediate adjustments with proration
  let pendingBillingRunId: string | undefined

  if (effectiveNetChargeAmount > 0 && shouldProrate) {
    // Format description similar to createSubscription pattern: single-line with key info
    // afterPercentage = 1 - beforePercentage (percentThroughBillingPeriod)
    const afterPercentage = 1 - percentThroughBillingPeriod
    const prorationPercentage = (afterPercentage * 100).toFixed(1)
    const adjustmentDateStr = new Date(adjustmentDate)
      .toISOString()
      .split('T')[0]
    const periodEndStr = new Date(billingPeriodEnd)
      .toISOString()
      .split('T')[0]

    prorationAdjustments.push({
      billingPeriodId: currentBillingPeriodForSubscription.id,
      quantity: 1,
      unitPrice: effectiveNetChargeAmount,
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

    /**
     * FIXME: create a more helpful message for adjustment subscriptions on trial
     */
    if (!paymentMethodId) {
      return Result.err(
        new ValidationError(
          'paymentMethod',
          `Proration adjust for subscription ${subscription.id} failed. No default or backup payment method was found for the subscription`
        )
      )
    }
    const paymentMethod = (
      await selectPaymentMethodById(paymentMethodId, transaction)
    ).unwrap()
    // TODO: maybe only create billing run if prorationAdjustments.length > 0
    const billingRunResult = await createBillingRun(
      {
        billingPeriod: currentBillingPeriodForSubscription,
        paymentMethod,
        scheduledFor: new Date(),
        isAdjustment: true,
      },
      transaction
    )
    if (Result.isError(billingRunResult)) {
      return Result.err(billingRunResult.error)
    }
    const billingRun = billingRunResult.value

    // Execute billing run immediately after creation
    // executeBillingRun uses its own transactions internally
    // handleSubscriptionItemAdjustment will handle creating/updating subscription items in processOutcomeForBillingRun
    // Prepare items with required fields (livemode) before passing to handleSubscriptionItemAdjustment
    const preparedItemsForBillingRun = nonManualSubscriptionItems.map(
      (item) => ({
        ...item,
        livemode: subscription.livemode,
      })
    )
    const billingRunHandle = await attemptBillingRunTask.trigger({
      billingRun,
      adjustmentParams: {
        newSubscriptionItems: preparedItemsForBillingRun,
        adjustmentDate,
      },
    })
    // Store the run ID so the caller can wait for the billing run to complete
    pendingBillingRunId = billingRunHandle.id
  } else {
    // Either:
    // - Zero-amount adjustment (downgrade with no refund)
    // - Upgrade with proration disabled (apply changes without mid-period charge)
    // Zero-amount adjustment: handle subscription items directly (no payment needed)
    // Prepare items with required fields (livemode) before passing to handleSubscriptionItemAdjustment
    const preparedItems = nonManualSubscriptionItems.map((item) => ({
      ...item,
      livemode: subscription.livemode,
    }))

    const adjustmentResult = await handleSubscriptionItemAdjustment(
      {
        subscriptionId: id,
        newSubscriptionItems: preparedItems,
        adjustmentDate: adjustmentDate,
      },
      ctx
    )
    if (Result.isError(adjustmentResult)) {
      return Result.err(adjustmentResult.error)
    }

    // For AtEndOfCurrentBillingPeriod, don't sync with future-dated items
    // Sync using current time to preserve the current subscription state
    // The subscription will sync when the items actually become active at the end of the period
    const syncTime =
      resolvedTiming ===
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

    // Send adjustment notifications (no proration - either downgrade or upgrade with proration disabled)
    const priceResult = await selectPriceById(
      subscription.priceId,
      transaction
    )
    if (Result.isError(priceResult)) {
      return Result.err(
        new NotFoundError('Price', subscription.priceId)
      )
    }
    const price = priceResult.unwrap()

    await idempotentSendCustomerSubscriptionAdjustedNotification({
      subscriptionId: id,
      customerId: subscription.customerId,
      organizationId: subscription.organizationId,
      adjustmentType: isUpgrade ? 'upgrade' : 'downgrade',
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
      subscriptionId: id,
      customerId: subscription.customerId,
      organizationId: subscription.organizationId,
      adjustmentType: isUpgrade ? 'upgrade' : 'downgrade',
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

  const updatedSubscription = (
    await selectSubscriptionById(id, transaction)
  ).unwrap()
  // Note: For billing run path, cache invalidation happens in
  // handleSubscriptionItemAdjustment (called by processOutcomeForBillingRun)
  // after the actual subscription item changes are applied.

  return Result.ok({
    subscription: standardSubscriptionSelectSchema.parse(
      updatedSubscription
    ),
    subscriptionItems: currentSubscriptionItems,
    resolvedTiming,
    isUpgrade,
    pendingBillingRunId,
  })
}
