import { DbTransaction } from '@/db/types'
import { RevenueChartIntervalUnit } from '@/types'
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
        subscription.startDate && subscription.startDate <= monthEnd
      const hadNotEnded =
        !subscription.canceledAt ||
        subscription.canceledAt >= monthStart

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
  currentMonth: Date,
  previousMonth: Date,
  transaction: DbTransaction
): Promise<SubscriberBreakdown> {
  const currentMonthStart = startOfMonth(currentMonth)
  const currentMonthEnd = endOfMonth(currentMonth)
  const previousMonthStart = startOfMonth(previousMonth)
  const previousMonthEnd = endOfMonth(previousMonth)

  // Get subscriptions active in both months
  const currentSubscriptions = await getActiveSubscriptionsForPeriod(
    organizationId,
    currentMonthStart,
    currentMonthEnd,
    transaction
  )

  const previousSubscriptions = await getActiveSubscriptionsForPeriod(
    organizationId,
    previousMonthStart,
    previousMonthEnd,
    transaction
  )

  // Calculate new subscribers
  const newSubscribers = currentSubscriptions.filter(
    (sub) =>
      sub.startDate >= currentMonthStart &&
      sub.startDate <= currentMonthEnd
  ).length

  // Calculate churned subscribers
  const churned = previousSubscriptions.filter(
    (sub) =>
      sub.canceledAt &&
      sub.canceledAt >= currentMonthStart &&
      sub.canceledAt <= currentMonthEnd
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
