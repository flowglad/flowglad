import { RevenueChartIntervalUnit } from '@db-core/enums'
import { prices } from '@db-core/schema/prices'
import { subscriptionItems } from '@db-core/schema/subscriptionItems'
import { subscriptions } from '@db-core/schema/subscriptions'
import { createDateNotPassedFilter } from '@db-core/tableUtils'
import { endOfMonth, startOfMonth } from 'date-fns'
import { and, eq, inArray, lte } from 'drizzle-orm'
import {
  currentSubscriptionStatuses,
  getActiveSubscriptionsForPeriod,
} from '@/db/tableMethods/subscriptionMethods'
import type { DbTransaction } from '@/db/types'
import { CancellationReason } from '@/types'

export interface MonthlyActiveSubscribers {
  month: Date
  count: number
}

export interface SubscriberCalculationOptions {
  startDate: Date
  endDate: Date
  granularity: RevenueChartIntervalUnit
  productId?: string // Optional product ID to filter subscribers by
}

export interface SubscriberBreakdown {
  newSubscribers: number // New subscribers in current month
  churned: number // Lost subscribers in current month
  netChange: number // Net change in subscribers
}

/**
 * Truncates a date to the start of the interval in UTC.
 * Matches PostgreSQL's date_trunc behavior for consistent bucketing.
 */
function dateTruncUTC(
  date: Date,
  granularity: RevenueChartIntervalUnit
): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const hour = date.getUTCHours()

  switch (granularity) {
    case RevenueChartIntervalUnit.Year:
      return new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0))
    case RevenueChartIntervalUnit.Month:
      return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
    case RevenueChartIntervalUnit.Week: {
      // Get the day of week (0 = Sunday, 1 = Monday, etc.)
      const tempDate = new Date(Date.UTC(year, month, day))
      const dayOfWeek = tempDate.getUTCDay()
      // Adjust to start of week (Monday = 1, so we go back dayOfWeek days, but if Sunday (0), go back 6)
      const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      return new Date(
        Date.UTC(year, month, day - daysToSubtract, 0, 0, 0, 0)
      )
    }
    case RevenueChartIntervalUnit.Day:
      return new Date(Date.UTC(year, month, day, 0, 0, 0, 0))
    case RevenueChartIntervalUnit.Hour:
      return new Date(Date.UTC(year, month, day, hour, 0, 0, 0))
    default:
      return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  }
}

/**
 * Adds one interval unit to a UTC date.
 * Matches PostgreSQL's interval addition for consistent series generation.
 */
function addIntervalUTC(
  date: Date,
  granularity: RevenueChartIntervalUnit
): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const hour = date.getUTCHours()

  switch (granularity) {
    case RevenueChartIntervalUnit.Year:
      return new Date(Date.UTC(year + 1, month, day, hour, 0, 0, 0))
    case RevenueChartIntervalUnit.Month:
      return new Date(Date.UTC(year, month + 1, day, hour, 0, 0, 0))
    case RevenueChartIntervalUnit.Week:
      return new Date(Date.UTC(year, month, day + 7, hour, 0, 0, 0))
    case RevenueChartIntervalUnit.Day:
      return new Date(Date.UTC(year, month, day + 1, hour, 0, 0, 0))
    case RevenueChartIntervalUnit.Hour:
      return new Date(Date.UTC(year, month, day, hour + 1, 0, 0, 0))
    default:
      return new Date(Date.UTC(year, month + 1, day, hour, 0, 0, 0))
  }
}

/**
 * Gets the end of an interval period in UTC (last millisecond).
 */
function getIntervalEndUTC(
  date: Date,
  granularity: RevenueChartIntervalUnit
): Date {
  const nextInterval = addIntervalUTC(date, granularity)
  return new Date(nextInterval.getTime() - 1)
}

/**
 * Calculates the number of active subscribers for each interval in the specified date range.
 * Uses UTC-based date calculations to match PostgreSQL's date_trunc behavior.
 */
export async function calculateActiveSubscribersByMonth(
  organizationId: string,
  options: SubscriberCalculationOptions,
  transaction: DbTransaction
): Promise<MonthlyActiveSubscribers[]> {
  const { startDate, endDate, granularity, productId } = options

  // Generate array of interval buckets between startDate and endDate using UTC
  // This matches PostgreSQL's generate_series with date_trunc behavior
  const intervals: Date[] = []
  let currentDate = dateTruncUTC(startDate, granularity)
  const endTruncated = dateTruncUTC(endDate, granularity)

  while (currentDate <= endTruncated) {
    intervals.push(currentDate)
    currentDate = addIntervalUTC(currentDate, granularity)
  }

  // Get all subscriptions that were active during the entire period
  let allSubscriptions = await getActiveSubscriptionsForPeriod(
    organizationId,
    startDate,
    endDate,
    transaction
  )

  // Filter by product if specified
  if (productId) {
    // Get subscription IDs that have items linked to this product
    const subscriptionsWithProduct = await transaction
      .selectDistinct({
        subscriptionId: subscriptionItems.subscriptionId,
      })
      .from(subscriptionItems)
      .innerJoin(prices, eq(subscriptionItems.priceId, prices.id))
      .where(eq(prices.productId, productId))

    const validSubscriptionIds = new Set(
      subscriptionsWithProduct.map((s) => s.subscriptionId)
    )

    allSubscriptions = allSubscriptions.filter((sub) =>
      validSubscriptionIds.has(sub.id)
    )
  }

  // Calculate active subscribers for each interval
  const subscribersByInterval = intervals.map((intervalStart) => {
    const intervalEnd = getIntervalEndUTC(intervalStart, granularity)

    const activeCount = allSubscriptions.filter((subscription) => {
      const wasActive = currentSubscriptionStatuses.includes(
        subscription.status
      )
      const hadStarted =
        subscription.startDate &&
        subscription.startDate <= intervalEnd.getTime()
      const hadNotEnded =
        !subscription.canceledAt ||
        subscription.canceledAt >= intervalStart.getTime()

      return wasActive && hadStarted && hadNotEnded
    }).length

    return {
      month: intervalStart,
      count: activeCount,
    }
  })

  return subscribersByInterval
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
        createDateNotPassedFilter(
          subscriptions.canceledAt,
          previousMonthStart.getTime()
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
