import { DbTransaction } from '@/db/types'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { Subscription } from '@/db/schema/subscriptions'
import { IntervalUnit, RevenueChartIntervalUnit } from '@/types'
import {
  selectBillingPeriods,
  selectBillingPeriodsDueForTransition,
} from '@/db/tableMethods/billingPeriodMethods'
import {
  selectBillingPeriodItems,
  selectBillingPeriodsWithItemsAndSubscriptionForDateRange,
} from '@/db/tableMethods/billingPeriodItemMethods'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'
import { and, between, eq, gte, lte, or } from 'drizzle-orm'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { subscriptions } from '@/db/schema/subscriptions'
import {
  startOfMonth,
  endOfMonth,
  addMonths,
  startOfDay,
  endOfDay,
  differenceInDays,
  getDaysInMonth,
} from 'date-fns'

export interface MonthlyRecurringRevenue {
  month: Date
  amount: number
}

export interface RevenueCalculationOptions {
  startDate: Date
  endDate: Date
  granularity: RevenueChartIntervalUnit
}

export interface BillingPeriodWithItems {
  billingPeriod: BillingPeriod.Record
  billingPeriodItems: BillingPeriodItem.Record[]
  subscription: Subscription.Record
}

/**
 * Normalizes a value to a monthly equivalent based on the billing interval
 *
 * @param value The total value for the billing period
 * @param interval The billing interval (month, year, etc.)
 * @param intervalCount The number of intervals in the billing period
 * @returns The normalized monthly value
 */
export function normalizeToMonthlyValue(
  value: number,
  interval: IntervalUnit,
  intervalCount: number
): number {
  if (intervalCount <= 0) {
    throw new Error(
      `Invalid intervalCount: ${intervalCount}. Must be greater than 0.`
    )
  }

  switch (interval) {
    case IntervalUnit.Month:
      return value / intervalCount
    case IntervalUnit.Year:
      return value / (12 * intervalCount)
    case IntervalUnit.Week:
      return (value * 52) / (12 * intervalCount) // 52 weeks in a year
    case IntervalUnit.Day:
      return (value * 365) / (12 * intervalCount) // 365 days in a year
    default:
      throw new Error(`Unsupported interval: ${interval}`)
  }
}

/**
 * Calculates the overlap percentage of a billing period with a specific month
 *
 * @param billingPeriod The billing period
 * @param monthStart The start date of the month
 * @param monthEnd The end date of the month
 * @returns The percentage of the billing period that falls within the month (0-1)
 */
export function calculateOverlapPercentage(
  billingPeriod: BillingPeriod.Record,
  monthStart: Date,
  monthEnd: Date
): number {
  const bpStart = startOfDay(billingPeriod.startDate)
  const bpEnd = endOfDay(billingPeriod.endDate)

  // If the billing period is outside the month, no overlap
  if (bpEnd < monthStart || bpStart > monthEnd) {
    return 0
  }

  // Determine the overlap period
  const overlapStart = bpStart > monthStart ? bpStart : monthStart
  const overlapEnd = bpEnd < monthEnd ? bpEnd : monthEnd

  // Calculate the number of days in the overlap
  const daysInOverlap = differenceInDays(overlapEnd, overlapStart) + 1

  // Calculate the total number of days in the billing period
  let totalDaysInBillingPeriod = differenceInDays(bpEnd, bpStart) + 1

  // Adjust for leap years if the billing period includes February 29
  const isLeapYear = (date: Date) => {
    const year = date.getFullYear()
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  }

  // Only adjust for leap year if the billing period extends beyond February
  if (
    isLeapYear(bpStart) &&
    bpStart.getMonth() <= 1 && // January or February
    bpEnd.getMonth() > 1 // Beyond February
  ) {
    const feb29 = new Date(bpStart.getFullYear(), 1, 29)
    if (bpStart <= feb29 && bpEnd >= feb29) {
      totalDaysInBillingPeriod += 1
    }
  }

  // Return the percentage of overlap
  return daysInOverlap / totalDaysInBillingPeriod
}

/**
 * Calculates the total value of a billing period's items
 *
 * @param billingPeriodItems The billing period items
 * @returns The total value
 */
export function calculateBillingPeriodItemsValue(
  billingPeriodItems: BillingPeriodItem.Record[]
): number {
  return billingPeriodItems.reduce((total, item) => {
    return total + item.unitPrice * item.quantity
  }, 0)
}

/**
 * Retrieves all active billing periods for an organization that overlap with a date range
 *
 * @param organizationId The organization ID
 * @param startDate The start date of the range
 * @param endDate The end date of the range
 * @param transaction The database transaction
 * @returns Promise resolving to an array of billing periods with items and subscription info
 */
export async function getBillingPeriodsForDateRange(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  transaction: DbTransaction
): Promise<BillingPeriodWithItems[]> {
  // Use the new efficient method that gets everything in a single query
  const results =
    await selectBillingPeriodsWithItemsAndSubscriptionForDateRange(
      organizationId,
      startDate,
      endDate,
      transaction
    )
  // Map the results to the expected BillingPeriodWithItems format
  return results.map(
    ({ billingPeriod, billingPeriodItems, subscription }) => ({
      billingPeriod,
      billingPeriodItems,
      subscription,
    })
  )
}

/**
 * Calculates the Monthly Recurring Revenue (MRR) for each month in the specified date range
 *
 * @param organizationId The organization ID
 * @param options The calculation options (date range and granularity)
 * @param transaction The database transaction
 * @returns Promise resolving to an array of MonthlyRecurringRevenue objects
 */
export async function calculateMRRByMonth(
  organizationId: string,
  options: RevenueCalculationOptions,
  transaction: DbTransaction
): Promise<MonthlyRecurringRevenue[]> {
  const { startDate, endDate } = options

  // Generate an array of months between startDate and endDate
  const months: Date[] = []
  let currentDate = startOfMonth(startDate)
  const endOfLastMonth = endOfMonth(endDate)
  while (currentDate <= endOfLastMonth) {
    months.push(currentDate)
    currentDate = addMonths(currentDate, 1)
  }

  // Get all billing periods that overlap with the date range
  const billingPeriods = await getBillingPeriodsForDateRange(
    organizationId,
    startDate,
    endDate,
    transaction
  )

  // Calculate MRR for each month
  const mrrByMonth = months.map((month) => {
    const monthStart = startOfDay(month)
    const monthEnd = endOfDay(endOfMonth(month))
    let monthlyRevenue = 0

    // For each billing period, calculate its contribution to this month's MRR
    billingPeriods.forEach(
      ({ billingPeriod, billingPeriodItems, subscription }) => {
        const bpStart = startOfDay(billingPeriod.startDate)
        const bpEnd = endOfDay(billingPeriod.endDate)

        // Check if billing period fully covers the month
        const fullyCoversMonth =
          bpStart <= monthStart && bpEnd >= monthEnd

        // Calculate the overlap percentage
        const overlapPercentage = calculateOverlapPercentage(
          billingPeriod,
          month,
          monthEnd
        )

        if (overlapPercentage > 0) {
          // Calculate the total value of the billing period
          const totalValue = calculateBillingPeriodItemsValue(
            billingPeriodItems
          )

          // Normalize to monthly value based on the subscription interval
          const monthlyValue = normalizeToMonthlyValue(
            totalValue,
            subscription.interval,
            subscription.intervalCount
          )

          // If the billing period fully covers the month, use the full monthly value
          // Otherwise, apply the overlap percentage
          const contribution = fullyCoversMonth
            ? monthlyValue
            : monthlyValue * overlapPercentage

          // Add the contribution of this billing period to the month's MRR
          monthlyRevenue += contribution
        }
      }
    )

    return {
      month,
      amount: monthlyRevenue,
    }
  })

  return mrrByMonth
}

/**
 * Calculates projected MRR based on current active subscriptions
 * This can be used to show projected revenue for future months
 *
 * @param organizationId The organization ID
 * @param months The number of months to project (including current month)
 * @param transaction The database transaction
 * @returns Promise resolving to an array of MonthlyRecurringRevenue objects
 */
export async function calculateProjectedMRR(
  organizationId: string,
  months: number,
  transaction: DbTransaction
): Promise<MonthlyRecurringRevenue[]> {
  const now = new Date()
  const startDate = startOfMonth(now)
  const endDate = endOfMonth(addMonths(startDate, months - 1))

  return calculateMRRByMonth(
    organizationId,
    {
      startDate,
      endDate,
      granularity: RevenueChartIntervalUnit.Month,
    },
    transaction
  )
}

/**
 * Calculates the Annual Recurring Revenue (ARR) based on the current MRR
 *
 * @param organizationId The organization ID
 * @param transaction The database transaction
 * @returns Promise resolving to the ARR amount
 */
export async function calculateARR(
  organizationId: string,
  transaction: DbTransaction
): Promise<number> {
  const now = new Date()
  const currentMonth = startOfMonth(now)

  // Calculate MRR for the current month
  const mrrResult = await calculateMRRByMonth(
    organizationId,
    {
      startDate: currentMonth,
      endDate: endOfMonth(currentMonth),
      granularity: RevenueChartIntervalUnit.Month,
    },
    transaction
  )

  // If there's no MRR data for the current month, return 0
  if (mrrResult.length === 0) {
    return 0
  }

  // ARR is simply MRR * 12
  return mrrResult[0].amount * 12
}

/**
 * Calculates the change in MRR between two months
 *
 * @param organizationId The organization ID
 * @param currentMonth The current month
 * @param previousMonth The previous month to compare against
 * @param transaction The database transaction
 * @returns Promise resolving to the MRR change amount
 */
export async function calculateMRRChange(
  organizationId: string,
  currentMonth: Date,
  previousMonth: Date,
  transaction: DbTransaction
): Promise<number> {
  const currentMRR = await calculateMRRByMonth(
    organizationId,
    {
      startDate: startOfMonth(currentMonth),
      endDate: endOfMonth(currentMonth),
      granularity: RevenueChartIntervalUnit.Month,
    },
    transaction
  )

  const previousMRR = await calculateMRRByMonth(
    organizationId,
    {
      startDate: startOfMonth(previousMonth),
      endDate: endOfMonth(previousMonth),
      granularity: RevenueChartIntervalUnit.Month,
    },
    transaction
  )

  const currentAmount =
    currentMRR.length > 0 ? currentMRR[0].amount : 0
  const previousAmount =
    previousMRR.length > 0 ? previousMRR[0].amount : 0

  return currentAmount - previousAmount
}

/**
 * Decomposes MRR into its components: new, expansion, contraction, and churn
 * This helps understand the sources of MRR changes
 */
export interface MRRBreakdown {
  newMRR: number // MRR from new subscriptions
  expansionMRR: number // MRR from upgrades to existing subscriptions
  contractionMRR: number // MRR from downgrades to existing subscriptions
  churnMRR: number // MRR lost from canceled subscriptions
  netMRR: number // Net change in MRR
}

/**
 * Calculates a breakdown of MRR changes between two months
 *
 * @param organizationId The organization ID
 * @param currentMonth The current month
 * @param previousMonth The previous month to compare against
 * @param transaction The database transaction
 * @returns Promise resolving to an MRRBreakdown object
 */
export async function calculateMRRBreakdown(
  organizationId: string,
  currentMonth: Date,
  previousMonth: Date,
  transaction: DbTransaction
): Promise<MRRBreakdown> {
  // Get billing periods for both months
  const currentMonthStart = startOfMonth(currentMonth)
  const currentMonthEnd = endOfMonth(currentMonth)
  const previousMonthStart = startOfMonth(previousMonth)
  const previousMonthEnd = endOfMonth(previousMonth)

  const currentBillingPeriods = await getBillingPeriodsForDateRange(
    organizationId,
    currentMonthStart,
    currentMonthEnd,
    transaction
  )

  const previousBillingPeriods = await getBillingPeriodsForDateRange(
    organizationId,
    previousMonthStart,
    previousMonthEnd,
    transaction
  )

  // Get all subscription IDs from both months
  const currentSubscriptionIds = new Set(
    currentBillingPeriods.map((bp) => bp.subscription.id)
  )

  const previousSubscriptionIds = new Set(
    previousBillingPeriods.map((bp) => bp.subscription.id)
  )

  // Helper to get normalized MRR for a subscription in a given month
  const getSubscriptionMRR = (
    subscriptionId: string,
    billingPeriods: BillingPeriodWithItems[],
    monthStart: Date,
    monthEnd: Date
  ): number => {
    let totalMRR = 0

    const subscriptionBPs = billingPeriods.filter(
      (bp) => bp.subscription.id === subscriptionId
    )

    for (const {
      billingPeriod,
      billingPeriodItems,
      subscription,
    } of subscriptionBPs) {
      const bpStart = startOfDay(billingPeriod.startDate)
      const bpEnd = endOfDay(billingPeriod.endDate)

      // Check if billing period fully covers the month
      const fullyCoversMonth =
        bpStart <= monthStart && bpEnd >= monthEnd

      const overlapPercentage = calculateOverlapPercentage(
        billingPeriod,
        monthStart,
        monthEnd
      )

      if (overlapPercentage > 0) {
        const totalValue = calculateBillingPeriodItemsValue(
          billingPeriodItems
        )
        const monthlyValue = normalizeToMonthlyValue(
          totalValue,
          subscription.interval,
          subscription.intervalCount
        )

        // If the billing period fully covers the month, use the full monthly value
        // Otherwise, apply the overlap percentage
        const contribution = fullyCoversMonth
          ? monthlyValue
          : monthlyValue * overlapPercentage

        totalMRR += contribution
      }
    }

    return totalMRR
  }

  // Calculate the breakdown
  let newMRR = 0
  let expansionMRR = 0
  let contractionMRR = 0
  let churnMRR = 0

  // New MRR: Subscriptions in current month but not in previous month
  for (const subscriptionId of currentSubscriptionIds) {
    if (!previousSubscriptionIds.has(subscriptionId)) {
      newMRR += getSubscriptionMRR(
        subscriptionId,
        currentBillingPeriods,
        currentMonthStart,
        currentMonthEnd
      )
    }
  }

  // Churn MRR: Subscriptions in previous month but not in current month
  for (const subscriptionId of previousSubscriptionIds) {
    if (!currentSubscriptionIds.has(subscriptionId)) {
      churnMRR += getSubscriptionMRR(
        subscriptionId,
        previousBillingPeriods,
        previousMonthStart,
        previousMonthEnd
      )
    }
  }

  // Expansion/Contraction MRR: Subscriptions in both months with different MRR
  for (const subscriptionId of currentSubscriptionIds) {
    if (previousSubscriptionIds.has(subscriptionId)) {
      const currentMRR = getSubscriptionMRR(
        subscriptionId,
        currentBillingPeriods,
        currentMonthStart,
        currentMonthEnd
      )

      const previousMRR = getSubscriptionMRR(
        subscriptionId,
        previousBillingPeriods,
        previousMonthStart,
        previousMonthEnd
      )

      const difference = currentMRR - previousMRR

      if (difference > 0) {
        expansionMRR += difference
      } else if (difference < 0) {
        contractionMRR += Math.abs(difference)
      }
    }
  }

  // Calculate net MRR
  const netMRR = newMRR + expansionMRR - contractionMRR - churnMRR

  return {
    newMRR,
    expansionMRR,
    contractionMRR,
    churnMRR,
    netMRR,
  }
}
