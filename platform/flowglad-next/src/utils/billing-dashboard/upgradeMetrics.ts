import { Price, prices } from '@db-core/schema/prices'
import {
  type Subscription,
  subscriptions,
} from '@db-core/schema/subscriptions'
import { differenceInDays } from 'date-fns'
import {
  and,
  between,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
} from 'drizzle-orm'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'
import type { DbTransaction } from '@/db/types'
import { CancellationReason } from '@/types'

export interface UpgradeMetrics {
  totalUpgrades: number
  upgradeRevenue: number
  averageTimeToUpgrade: number
  upgradedSubscriptions: Subscription.Record[]
}

/**
 * Calculates upgrade metrics for a given organization and date range
 *
 * @param organizationId The organization ID
 * @param startDate The start date of the range
 * @param endDate The end date of the range
 * @param transaction The database transaction
 * @returns Promise resolving to upgrade metrics
 */
export async function getUpgradeMetrics(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  transaction: DbTransaction
): Promise<UpgradeMetrics> {
  // Find all subscriptions that were upgraded (canceled with upgraded_to_paid reason)
  const upgradedSubscriptions = await transaction
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        eq(
          subscriptions.cancellationReason,
          CancellationReason.UpgradedToPaid
        ),
        isNotNull(subscriptions.canceledAt),
        between(
          subscriptions.canceledAt,
          startDate.getTime(),
          endDate.getTime()
        )
      )
    )

  // Calculate total upgrades
  const totalUpgrades = upgradedSubscriptions.length

  // Calculate upgrade revenue by finding the replacement subscriptions
  let upgradeRevenue = 0
  const averageTimesToUpgrade: number[] = []

  // Collect all replacement subscription IDs to batch fetch
  const replacementIds = upgradedSubscriptions
    .filter((sub) => sub.replacedBySubscriptionId)
    .map((sub) => sub.replacedBySubscriptionId!)

  // Batch fetch all replacement subscriptions and their prices in a single query
  const replacementData =
    replacementIds.length > 0
      ? await transaction
          .select({
            subscription: subscriptions,
            price: prices,
          })
          .from(subscriptions)
          .leftJoin(prices, eq(subscriptions.priceId, prices.id))
          .where(inArray(subscriptions.id, replacementIds))
      : []

  // Create a map for quick lookup
  const replacementMap = new Map(
    replacementData.map((data) => [data.subscription.id, data])
  )

  // Process each upgraded subscription
  for (const upgradedSub of upgradedSubscriptions) {
    if (upgradedSub.replacedBySubscriptionId) {
      const replacementData = replacementMap.get(
        upgradedSub.replacedBySubscriptionId
      )

      if (replacementData) {
        // Add the new subscription's MRR to upgrade revenue
        if (replacementData.price?.unitPrice) {
          upgradeRevenue += replacementData.price.unitPrice
        }

        // Calculate time to upgrade (from free subscription creation to upgrade)
        if (upgradedSub.startDate && upgradedSub.canceledAt) {
          const daysToUpgrade = differenceInDays(
            upgradedSub.canceledAt,
            upgradedSub.startDate
          )
          averageTimesToUpgrade.push(daysToUpgrade)
        }
      }
    }
  }

  // Calculate average time to upgrade
  const averageTimeToUpgrade =
    averageTimesToUpgrade.length > 0
      ? averageTimesToUpgrade.reduce((sum, days) => sum + days, 0) /
        averageTimesToUpgrade.length
      : 0

  return {
    totalUpgrades,
    upgradeRevenue,
    averageTimeToUpgrade,
    upgradedSubscriptions:
      upgradedSubscriptions as Subscription.Record[],
  }
}

/**
 * Gets the upgrade conversion rate for a given period
 *
 * @param organizationId The organization ID
 * @param startDate The start date of the range
 * @param endDate The end date of the range
 * @param transaction The database transaction
 * @returns Promise resolving to the conversion rate (0-1)
 */
export async function getUpgradeConversionRate(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  transaction: DbTransaction
): Promise<number> {
  // Get all free subscriptions created in the period using direct query
  const freeSubscriptions = await transaction
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        eq(subscriptions.isFreePlan, true),
        gte(subscriptions.startDate, startDate.getTime()),
        lte(subscriptions.startDate, endDate.getTime())
      )
    )

  if (freeSubscriptions.length === 0) {
    return 0
  }

  // Count how many were upgraded
  const upgradedCount = freeSubscriptions.filter(
    (sub) =>
      sub.cancellationReason === CancellationReason.UpgradedToPaid
  ).length

  return upgradedCount / freeSubscriptions.length
}

/**
 * Calculates the revenue impact of upgrades
 *
 * @param upgradedSubscriptions Array of upgraded subscriptions
 * @param transaction The database transaction
 * @returns Promise resolving to the total revenue from upgrades
 */
export async function calculateUpgradeRevenue(
  upgradedSubscriptions: Subscription.Record[],
  transaction: DbTransaction
): Promise<number> {
  let totalRevenue = 0

  // Collect all replacement subscription IDs to batch fetch
  const replacementIds = upgradedSubscriptions
    .filter((sub) => sub.replacedBySubscriptionId)
    .map((sub) => sub.replacedBySubscriptionId!)

  if (replacementIds.length === 0) {
    return 0
  }

  // Batch fetch all replacement subscriptions and their prices in a single query
  const replacementData = await transaction
    .select({
      subscription: subscriptions,
      price: prices,
    })
    .from(subscriptions)
    .leftJoin(prices, eq(subscriptions.priceId, prices.id))
    .where(inArray(subscriptions.id, replacementIds))

  // Calculate total revenue from upgrade subscriptions
  for (const data of replacementData) {
    if (data.price?.unitPrice) {
      totalRevenue += data.price.unitPrice
    }
  }

  return totalRevenue
}

/**
 * Calculates the average time from signup to upgrade
 *
 * @param upgradedSubscriptions Array of upgraded subscriptions
 * @returns The average time in days
 */
export function calculateAverageTimeToUpgrade(
  upgradedSubscriptions: Subscription.Record[]
): number {
  const timesToUpgrade = upgradedSubscriptions
    .filter((sub) => sub.startDate && sub.canceledAt)
    .map((sub) => differenceInDays(sub.canceledAt!, sub.startDate!))

  if (timesToUpgrade.length === 0) {
    return 0
  }

  return (
    timesToUpgrade.reduce((sum, days) => sum + days, 0) /
    timesToUpgrade.length
  )
}

/**
 * Gets subscriptions that were upgraded in a specific time period
 *
 * @param organizationId The organization ID
 * @param startDate The start date of the range
 * @param endDate The end date of the range
 * @param transaction The database transaction
 * @returns Promise resolving to an array of upgraded subscriptions
 */
export async function getUpgradedSubscriptions(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  transaction: DbTransaction
): Promise<Subscription.Record[]> {
  const results = await transaction
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        eq(
          subscriptions.cancellationReason,
          CancellationReason.UpgradedToPaid
        ),
        isNotNull(subscriptions.canceledAt),
        between(
          subscriptions.canceledAt,
          startDate.getTime(),
          endDate.getTime()
        )
      )
    )

  return results as Subscription.Record[]
}

/**
 * Tracks upgrade paths - which free plans upgrade to which paid plans
 *
 * @param organizationId The organization ID
 * @param startDate The start date of the range
 * @param endDate The end date of the range
 * @param transaction The database transaction
 * @returns Promise resolving to upgrade path data
 */
export async function getUpgradePaths(
  organizationId: string,
  startDate: Date | number,
  endDate: Date | number,
  transaction: DbTransaction
): Promise<
  Array<{
    fromSubscription: Subscription.Record
    toSubscription: Subscription.Record | null
  }>
> {
  const upgradedSubscriptions = await getUpgradedSubscriptions(
    organizationId,
    new Date(startDate),
    new Date(endDate),
    transaction
  )

  // Properly type the paths array to match the return type
  const paths: Array<{
    fromSubscription: Subscription.Record
    toSubscription: Subscription.Record | null
  }> = []

  // Collect all replacement subscription IDs to batch fetch
  const replacementIds = upgradedSubscriptions
    .filter((sub) => sub.replacedBySubscriptionId)
    .map((sub) => sub.replacedBySubscriptionId!)

  // Batch fetch all replacement subscriptions in a single query
  const replacementSubs =
    replacementIds.length > 0
      ? await transaction
          .select()
          .from(subscriptions)
          .where(inArray(subscriptions.id, replacementIds))
      : []

  // Create a map for quick lookup
  const replacementMap = new Map(
    replacementSubs.map((sub) => [sub.id, sub as Subscription.Record])
  )

  // Build the upgrade paths
  for (const fromSub of upgradedSubscriptions) {
    const toSub = fromSub.replacedBySubscriptionId
      ? replacementMap.get(fromSub.replacedBySubscriptionId) || null
      : null

    paths.push({
      fromSubscription: fromSub,
      toSubscription: toSub,
    })
  }

  return paths
}
