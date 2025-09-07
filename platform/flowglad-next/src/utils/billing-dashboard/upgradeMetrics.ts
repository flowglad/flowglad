import { DbTransaction } from '@/db/types'
import { Subscription } from '@/db/schema/subscriptions'
import { CancellationReason } from '@/types'
import { and, eq, between, isNotNull, gte, lte } from 'drizzle-orm'
import { subscriptions } from '@/db/schema/subscriptions'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'
import { differenceInDays } from 'date-fns'

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
        between(subscriptions.canceledAt, startDate, endDate)
      )
    )

  // Calculate total upgrades
  const totalUpgrades = upgradedSubscriptions.length

  // Calculate upgrade revenue by finding the replacement subscriptions
  let upgradeRevenue = 0
  const averageTimesToUpgrade: number[] = []

  for (const upgradedSub of upgradedSubscriptions) {
    if (upgradedSub.replacedBySubscriptionId) {
      // Find the new subscription that replaced this one
      const [newSubscription] = await selectSubscriptions(
        {
          id: upgradedSub.replacedBySubscriptionId,
        },
        transaction
      )

      if (newSubscription) {
        // Calculate the revenue difference
        // For standard subscriptions, we can get the price from the subscription
        if ('priceId' in newSubscription && newSubscription.priceId) {
          // Get the price information
          const price = await transaction
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.id, newSubscription.id))
            .limit(1)

          if (price.length > 0) {
            // Add the new subscription's MRR to upgrade revenue
            // This is simplified - in production, you'd want to calculate actual MRR
            upgradeRevenue += 0 // Placeholder - would need price details
          }
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
        gte(subscriptions.startDate, startDate),
        lte(subscriptions.startDate, endDate)
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

  for (const subscription of upgradedSubscriptions) {
    if (subscription.replacedBySubscriptionId) {
      // Get the new subscription details
      const [newSubscription] = await selectSubscriptions(
        {
          id: subscription.replacedBySubscriptionId,
        },
        transaction
      )

      if (newSubscription && 'priceId' in newSubscription) {
        // For now, just placeholder - would need to fetch price details
        // This would require joining with prices table to get unitPrice
        totalRevenue += 0 // Placeholder - implement price fetching if needed
      }
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
        between(subscriptions.canceledAt, startDate, endDate)
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
  startDate: Date,
  endDate: Date,
  transaction: DbTransaction
): Promise<
  Array<{
    fromSubscription: Subscription.Record
    toSubscription: Subscription.Record | null
  }>
> {
  const upgradedSubscriptions = await getUpgradedSubscriptions(
    organizationId,
    startDate,
    endDate,
    transaction
  )

  const paths = []

  for (const fromSub of upgradedSubscriptions) {
    let toSub = null
    if (fromSub.replacedBySubscriptionId) {
      const [replacement] = await selectSubscriptions(
        {
          id: fromSub.replacedBySubscriptionId,
        },
        transaction
      )
      toSub = replacement || null
    }

    paths.push({
      fromSubscription: fromSub,
      toSubscription: toSub,
    })
  }

  return paths
}
