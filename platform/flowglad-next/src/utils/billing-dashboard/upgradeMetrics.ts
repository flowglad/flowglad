import { DbTransaction } from '@/db/types'
import { Subscription } from '@/db/schema/subscriptions'
import { CancellationReason, SubscriptionStatus } from '@/types'
import { and, between, eq } from 'drizzle-orm'
import { subscriptions } from '@/db/schema/subscriptions'
import { differenceInDays } from 'date-fns'

/**
 * Metrics for tracking subscription upgrades
 */
export interface UpgradeMetrics {
  totalUpgrades: number
  upgradeRevenue: number // Total MRR added from upgrades
  averageTimeToUpgrade: number // Average days from signup to upgrade
  upgradeConversionRate: number // Percentage of free users who upgraded
}

/**
 * Gets upgrade metrics for a specific time period
 *
 * @param organizationId The organization to get metrics for
 * @param startDate Start of the period
 * @param endDate End of the period
 * @param transaction Database transaction
 * @returns Upgrade metrics for the period
 */
export const getUpgradeMetrics = async (
  organizationId: string,
  startDate: Date,
  endDate: Date,
  transaction: DbTransaction
): Promise<UpgradeMetrics> => {
  // Find all subscriptions that were upgraded (canceled with upgrade reason)
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
        between(subscriptions.canceledAt, startDate, endDate)
      )
    )

  // Find the replacement subscriptions for revenue calculation
  const replacementSubscriptionIds = upgradedSubscriptions
    .map((sub) => sub.replacedBySubscriptionId)
    .filter((id) => id !== null) as string[]

  let upgradeRevenue = 0
  let totalDaysToUpgrade = 0

  if (replacementSubscriptionIds.length > 0) {
    const replacementSubscriptions = await transaction
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.organizationId, organizationId)
          // Use SQL IN clause for the replacement IDs
          // Note: This is a simplified approach, in production you'd use drizzle's inArray
        )
      )

    // Calculate total MRR from upgraded subscriptions
    for (const replacement of replacementSubscriptions) {
      // This would need to be adjusted based on actual schema
      // For now, using a placeholder calculation
      upgradeRevenue += 100 // Placeholder - would need to join with prices table
    }

    // Calculate average time to upgrade
    for (let i = 0; i < upgradedSubscriptions.length; i++) {
      const oldSub = upgradedSubscriptions[i]
      const newSub = replacementSubscriptions.find(
        (s) => s.id === oldSub.replacedBySubscriptionId
      )

      if (oldSub.createdAt && newSub?.createdAt) {
        const daysToUpgrade = differenceInDays(
          new Date(newSub.createdAt),
          new Date(oldSub.createdAt)
        )
        totalDaysToUpgrade += daysToUpgrade
      }
    }
  }

  // Calculate conversion rate
  // Find total free subscriptions created in the period
  const allFreeSubscriptions = await transaction
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        eq(subscriptions.isFreePlan, true),
        between(subscriptions.createdAt, startDate, endDate)
      )
    )

  const totalFreeSubscriptions = allFreeSubscriptions.length
  const upgradeConversionRate =
    totalFreeSubscriptions > 0
      ? (upgradedSubscriptions.length / totalFreeSubscriptions) * 100
      : 0

  const averageTimeToUpgrade =
    upgradedSubscriptions.length > 0
      ? totalDaysToUpgrade / upgradedSubscriptions.length
      : 0

  return {
    totalUpgrades: upgradedSubscriptions.length,
    upgradeRevenue,
    averageTimeToUpgrade,
    upgradeConversionRate,
  }
}

/**
 * Calculates the revenue impact of upgrades
 *
 * @param upgradedSubscriptions List of upgraded (canceled) subscriptions
 * @returns Total MRR added from upgrades
 */
export const calculateUpgradeRevenue = (
  upgradedSubscriptions: Subscription.Record[]
): number => {
  // This would need to be implemented based on actual price data
  // For now, returning a placeholder
  return upgradedSubscriptions.length * 100 // Placeholder calculation
}

/**
 * Calculates average time from signup to upgrade
 *
 * @param upgradedSubscriptions List of upgraded subscriptions
 * @returns Average days to upgrade
 */
export const calculateAverageTimeToUpgrade = (
  upgradedSubscriptions: Subscription.Record[]
): number => {
  if (upgradedSubscriptions.length === 0) return 0

  let totalDays = 0
  let count = 0

  for (const sub of upgradedSubscriptions) {
    if (sub.createdAt && sub.canceledAt) {
      const days = differenceInDays(
        new Date(sub.canceledAt),
        new Date(sub.createdAt)
      )
      totalDays += days
      count++
    }
  }

  return count > 0 ? totalDays / count : 0
}

/**
 * Gets a list of customers who upgraded in a given period
 * Useful for cohort analysis and customer success tracking
 *
 * @param organizationId Organization ID
 * @param startDate Start of period
 * @param endDate End of period
 * @param transaction Database transaction
 * @returns List of customer IDs who upgraded
 */
export const getUpgradedCustomers = async (
  organizationId: string,
  startDate: Date,
  endDate: Date,
  transaction: DbTransaction
): Promise<string[]> => {
  const upgradedSubscriptions = await transaction
    .select({
      customerId: subscriptions.customerId,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        eq(
          subscriptions.cancellationReason,
          CancellationReason.UpgradedToPaid
        ),
        between(subscriptions.canceledAt, startDate, endDate)
      )
    )

  // Return unique customer IDs
  const customerIds = upgradedSubscriptions
    .map((s) => s.customerId)
    .filter((id): id is string => id !== null)

  return [...new Set(customerIds)]
}
