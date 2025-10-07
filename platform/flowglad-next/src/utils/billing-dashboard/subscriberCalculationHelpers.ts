import { DbTransaction } from '@/db/types'
import { RevenueChartIntervalUnit, CancellationReason } from '@/types'
import {
  startOfMonth,
  endOfMonth,
  addMonths,
  startOfDay,
  endOfDay,
} from 'date-fns'
import {
  currentSubscriptionStatuses,
  getActiveSubscriptionsForPeriod,
} from '@/db/tableMethods/subscriptionMethods'
import { subscriptions } from '@/db/schema/subscriptions'
import { and, eq, gte, gt, lte, or, isNull } from 'drizzle-orm'

export interface MonthlyActiveSubscribers {
  month: Date
  count: number
}

export interface SubscriberCalculationOptions {
  startDate: Date
  endDate: Date
  granularity: RevenueChartIntervalUnit
}

export interface SubscriberBreakdown {
  newSubscribers: number // New subscribers in current month
  churned: number // Lost subscribers in current month
  netChange: number // Net change in subscribers
}

/**
 * Calculates the number of active subscribers for each month in the specified date range
 */
export async function calculateActiveSubscribersByMonth(
  organizationId: string,
  options: SubscriberCalculationOptions,
  transaction: DbTransaction
): Promise<MonthlyActiveSubscribers[]> {
  const { startDate, endDate } = options

  // Generate array of months between startDate and endDate
  const months: Date[] = []
  let currentDate = startOfMonth(startDate)
  const endOfLastMonth = endOfMonth(endDate)

  while (currentDate <= endOfLastMonth) {
    months.push(currentDate)
    currentDate = addMonths(currentDate, 1)
  }

  // Get all subscriptions that were active during the entire period
  const allSubscriptions = await getActiveSubscriptionsForPeriod(
    organizationId,
    startDate,
    endDate,
    transaction
  )

  // Calculate active subscribers for each month
  const subscribersByMonth = months.map((month) => {
    const monthStart = startOfDay(month)
    const monthEnd = endOfDay(endOfMonth(month))

    const activeCount = allSubscriptions.filter((subscription) => {
      const wasActive = currentSubscriptionStatuses.includes(
        subscription.status
      )
      const hadStarted =
        subscription.startDate &&
        subscription.startDate <= monthEnd.getTime()
      const hadNotEnded =
        !subscription.canceledAt ||
        subscription.canceledAt >= monthStart.getTime()

      return wasActive && hadStarted && hadNotEnded
    }).length

    return {
      month,
      count: activeCount,
    }
  })

  return subscribersByMonth
}

/**
 * Calculates the breakdown of subscriber changes between two months
 */
export async function calculateSubscriberBreakdown(
  organizationId: string,
  currentMonth: Date | number,
  previousMonth: Date | number,
  transaction: DbTransaction
): Promise<SubscriberBreakdown> {
  // Use UTC dates to avoid timezone issues
  // Get the year and month from the input dates and create UTC start/end of month
  const currentYear = new Date(currentMonth).getUTCFullYear()
  const currentMonthNum = new Date(currentMonth).getUTCMonth()
  const previousYear = new Date(previousMonth).getUTCFullYear()
  const previousMonthNum = new Date(previousMonth).getUTCMonth()

  // Create UTC start of month (first day at 00:00:00.000 UTC)
  const currentMonthStart = new Date(
    Date.UTC(currentYear, currentMonthNum, 1, 0, 0, 0, 0)
  )
  // Create UTC end of month (last millisecond of the month)
  const currentMonthEnd = new Date(
    Date.UTC(currentYear, currentMonthNum + 1, 0, 23, 59, 59, 999)
  )

  const previousMonthStart = new Date(
    Date.UTC(previousYear, previousMonthNum, 1, 0, 0, 0, 0)
  )
  const previousMonthEnd = new Date(
    Date.UTC(previousYear, previousMonthNum + 1, 0, 23, 59, 59, 999)
  )

  // Get subscriptions active in current month (excluding upgraded)
  const currentSubscriptions = await getActiveSubscriptionsForPeriod(
    organizationId,
    currentMonthStart,
    currentMonthEnd,
    transaction
  )

  // For churn calculation, we need ALL subscriptions that were active in previous month
  // including those that were later upgraded (so we can filter them out of churn)
  const allPreviousSubscriptionsRaw = await transaction
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        // Started before previous month ended
        lte(subscriptions.startDate, previousMonthEnd.getTime()),
        // Not canceled before previous month started
        or(
          isNull(subscriptions.canceledAt),
          gt(subscriptions.canceledAt, previousMonthStart.getTime())
        )
      )
    )

  // Calculate new subscribers
  const newSubscribers = currentSubscriptions.filter(
    (sub) =>
      sub.startDate >= currentMonthStart.getTime() &&
      sub.startDate <= currentMonthEnd.getTime()
  ).length

  // Calculate churned subscribers (excluding upgrades)
  const churned = allPreviousSubscriptionsRaw.filter(
    (sub) =>
      sub.canceledAt !== null &&
      sub.canceledAt >= currentMonthStart.getTime() &&
      sub.canceledAt <= currentMonthEnd.getTime() &&
      sub.cancellationReason !== CancellationReason.UpgradedToPaid
  ).length

  // Calculate net change
  const netChange = newSubscribers - churned

  return {
    newSubscribers,
    churned,
    netChange,
  }
}

/**
 * Gets the current total number of active subscribers
 */
export async function getCurrentActiveSubscribers(
  {
    organizationId,
    currentDate,
  }: { organizationId: string; currentDate?: Date },
  transaction: DbTransaction
): Promise<number> {
  const now = currentDate || new Date()
  const currentMonth = startOfMonth(now)

  const result = await calculateActiveSubscribersByMonth(
    organizationId,
    {
      startDate: currentMonth,
      endDate: endOfMonth(currentMonth),
      granularity: RevenueChartIntervalUnit.Month,
    },
    transaction
  )

  return result[0]?.count || 0
}
