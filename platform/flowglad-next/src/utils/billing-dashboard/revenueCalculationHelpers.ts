/* eslint-disable no-console */

import {
  addMonths,
  differenceInDays,
  endOfDay,
  endOfMonth,
  getDaysInMonth,
  startOfDay,
  startOfMonth,
} from 'date-fns'
import { and, between, eq, gte, inArray, lte, or } from 'drizzle-orm'
import type { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import {
  type BillingPeriod,
  billingPeriods,
} from '@/db/schema/billingPeriods'
import { prices } from '@/db/schema/prices'
import { subscriptionItems } from '@/db/schema/subscriptionItems'
import {
  type Subscription,
  subscriptions,
} from '@/db/schema/subscriptions'
import {
  selectBillingPeriodItems,
  selectBillingPeriodsWithItemsAndSubscriptionForDateRange,
} from '@/db/tableMethods/billingPeriodItemMethods'
import {
  selectBillingPeriods,
  selectBillingPeriodsDueForTransition,
} from '@/db/tableMethods/billingPeriodMethods'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'
import type { DbTransaction } from '@/db/types'
import {
  CancellationReason,
  IntervalUnit,
  RevenueChartIntervalUnit,
} from '@/types'

export interface MonthlyRecurringRevenue {
  month: Date
  amount: number
}

export interface RevenueCalculationOptions {
  startDate: Date
  endDate: Date
  granularity: RevenueChartIntervalUnit
  debug?: boolean // Optional debug flag, defaults to false
  productId?: string // Optional product ID to filter MRR by
}

export interface BillingPeriodWithItems {
  billingPeriod: BillingPeriod.Record
  billingPeriodItems: BillingPeriodItem.Record[]
  /**
   * Only standard subscriptions have billing periods
   */
  subscription: Subscription.StandardRecord
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
  intervalCount: number,
  debug: boolean = false
): number {
  if (debug) {
    console.log('[NORMALIZE DEBUG] normalizeToMonthlyValue called:', {
      value,
      interval,
      intervalCount,
    })
  }

  if (intervalCount <= 0) {
    throw new Error(
      `Invalid intervalCount: ${intervalCount}. Must be greater than 0.`
    )
  }

  let normalizedValue: number

  switch (interval) {
    case IntervalUnit.Month:
      normalizedValue = value / intervalCount
      if (debug) {
        console.log('[NORMALIZE DEBUG] Monthly interval:', {
          calculation: `${value} / ${intervalCount}`,
          result: normalizedValue,
        })
      }
      break
    case IntervalUnit.Year:
      normalizedValue = value / (12 * intervalCount)
      if (debug) {
        console.log('[NORMALIZE DEBUG] Yearly interval:', {
          calculation: `${value} / (12 * ${intervalCount})`,
          result: normalizedValue,
        })
      }
      break
    case IntervalUnit.Week:
      normalizedValue = (value * 52) / (12 * intervalCount) // 52 weeks in a year
      if (debug) {
        console.log('[NORMALIZE DEBUG] Weekly interval:', {
          calculation: `(${value} * 52) / (12 * ${intervalCount})`,
          result: normalizedValue,
        })
      }
      break
    case IntervalUnit.Day:
      normalizedValue = (value * 365) / (12 * intervalCount) // 365 days in a year
      if (debug) {
        console.log('[NORMALIZE DEBUG] Daily interval:', {
          calculation: `(${value} * 365) / (12 * ${intervalCount})`,
          result: normalizedValue,
        })
      }
      break
    default:
      throw new Error(`Unsupported interval: ${interval}`)
  }

  return normalizedValue
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
  monthEnd: Date,
  debug: boolean = false
): number {
  const bpStart = startOfDay(billingPeriod.startDate)
  const bpEnd = endOfDay(billingPeriod.endDate)

  if (debug) {
    console.log(
      '[OVERLAP DEBUG] calculateOverlapPercentage called:',
      {
        billingPeriodId: billingPeriod.id,
        bpStart: bpStart.toISOString(),
        bpEnd: bpEnd.toISOString(),
        monthStart: monthStart.toISOString(),
        monthEnd: monthEnd.toISOString(),
      }
    )
  }

  // If the billing period is outside the month, no overlap
  if (bpEnd < monthStart || bpStart > monthEnd) {
    if (debug) {
      console.log(
        '[OVERLAP DEBUG] No overlap - billing period outside month'
      )
    }
    return 0
  }

  // Determine the overlap period
  const overlapStart = bpStart > monthStart ? bpStart : monthStart
  const overlapEnd = bpEnd < monthEnd ? bpEnd : monthEnd

  if (debug) {
    console.log('[OVERLAP DEBUG] Overlap period:', {
      overlapStart: overlapStart.toISOString(),
      overlapEnd: overlapEnd.toISOString(),
    })
  }

  // Calculate the number of days in the overlap
  const daysInOverlap = differenceInDays(overlapEnd, overlapStart) + 1

  // Calculate the total number of days in the billing period
  let totalDaysInBillingPeriod = differenceInDays(bpEnd, bpStart) + 1

  if (debug) {
    console.log('[OVERLAP DEBUG] Days calculation:', {
      daysInOverlap,
      totalDaysInBillingPeriod,
      rawPercentage: daysInOverlap / totalDaysInBillingPeriod,
    })
  }

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
      if (debug) {
        console.log(
          '[OVERLAP DEBUG] Adjusted for leap year, new totalDaysInBillingPeriod:',
          totalDaysInBillingPeriod
        )
      }
    }
  }

  const finalPercentage = daysInOverlap / totalDaysInBillingPeriod
  if (debug) {
    console.log(
      '[OVERLAP DEBUG] Final overlap percentage:',
      finalPercentage
    )
  }

  // Return the percentage of overlap
  return finalPercentage
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
  const { startDate, endDate, debug = false, productId } = options

  if (debug) {
    console.log('[MRR DEBUG] calculateMRRByMonth called with:', {
      organizationId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      options,
    })
  }

  // Generate an array of months between startDate and endDate
  const months: Date[] = []
  let currentDate = startOfMonth(startDate)
  const endOfLastMonth = endOfMonth(endDate)
  while (currentDate <= endOfLastMonth) {
    months.push(currentDate)
    currentDate = addMonths(currentDate, 1)
  }

  if (debug) {
    console.log(
      '[MRR DEBUG] Processing months:',
      months.map((m) => m.toISOString())
    )
  }

  // Get all billing periods that overlap with the date range
  let billingPeriodsData = await getBillingPeriodsForDateRange(
    organizationId,
    startDate,
    endDate,
    transaction
  )

  // Filter by product if specified (subscription-chain join approach)
  // Join path: productId → prices → subscriptionItems → subscriptions → billingPeriods
  if (productId) {
    // Step 1: Get all priceIds for this product
    const productPrices = await transaction
      .select({ id: prices.id })
      .from(prices)
      .where(eq(prices.productId, productId))

    if (productPrices.length === 0) {
      // Product has no prices, return empty results
      if (debug) {
        console.log(
          '[MRR DEBUG] Product has no prices, returning zero MRR for all months'
        )
      }
      return months.map((month) => ({ month, amount: 0 }))
    }

    const priceIds = productPrices.map((p) => p.id)

    if (debug) {
      console.log(
        '[MRR DEBUG] Filtering by productId:',
        productId,
        'priceIds:',
        priceIds
      )
    }

    // Step 2: Get subscriptionIds that have subscriptionItems with those prices
    const subItemsWithProduct = await transaction
      .selectDistinct({
        subscriptionId: subscriptionItems.subscriptionId,
      })
      .from(subscriptionItems)
      .where(inArray(subscriptionItems.priceId, priceIds))

    if (subItemsWithProduct.length === 0) {
      // No subscriptions have this product
      if (debug) {
        console.log(
          '[MRR DEBUG] No subscriptions have this product, returning zero MRR for all months'
        )
      }
      return months.map((month) => ({ month, amount: 0 }))
    }

    const validSubscriptionIds = new Set(
      subItemsWithProduct.map((s) => s.subscriptionId)
    )

    if (debug) {
      console.log(
        '[MRR DEBUG] Found subscriptions with product:',
        Array.from(validSubscriptionIds)
      )
    }

    // Step 3: Filter billingPeriods to only those for matching subscriptions
    billingPeriodsData = billingPeriodsData.filter((bp) =>
      validSubscriptionIds.has(bp.subscription.id)
    )

    if (debug) {
      console.log(
        '[MRR DEBUG] After product filtering, remaining billing periods:',
        billingPeriodsData.length
      )
    }
  }

  const billingPeriods = billingPeriodsData

  if (debug) {
    console.log(
      '[MRR DEBUG] Found billing periods:',
      billingPeriods.length
    )
    billingPeriods.forEach((bp, index) => {
      console.log(`[MRR DEBUG] Billing Period ${index}:`, {
        id: bp.billingPeriod.id,
        subscriptionId: bp.subscription.id,
        startDate: new Date(bp.billingPeriod.startDate).toISOString(),
        endDate: new Date(bp.billingPeriod.endDate).toISOString(),
        interval: (bp.subscription as any).interval,
        intervalCount: bp.subscription.intervalCount,
        itemsCount: bp.billingPeriodItems.length,
        items: bp.billingPeriodItems.map((item) => ({
          name: item.name,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          totalValue: item.unitPrice * item.quantity,
        })),
      })
    })
  }

  // Calculate MRR for each month
  const mrrByMonth = months.map((month) => {
    const monthStart = startOfDay(month)
    const monthEnd = endOfDay(endOfMonth(month))
    let monthlyRevenue = 0

    if (debug) {
      console.log(
        `[MRR DEBUG] Processing month: ${month.toISOString()}`,
        {
          monthStart: monthStart.toISOString(),
          monthEnd: monthEnd.toISOString(),
        }
      )
    }

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
          monthEnd,
          debug
        )

        if (overlapPercentage > 0) {
          // Calculate the total value of the billing period
          const totalValue = calculateBillingPeriodItemsValue(
            billingPeriodItems
          )

          // Normalize to monthly value based on the subscription interval
          const monthlyValue = normalizeToMonthlyValue(
            totalValue,
            (subscription as Subscription.StandardRecord).interval,
            subscription.intervalCount,
            debug
          )

          // If the billing period fully covers the month, use the full monthly value
          // Otherwise, apply the overlap percentage
          const contribution = fullyCoversMonth
            ? monthlyValue
            : monthlyValue * overlapPercentage

          if (debug) {
            console.log(
              `[MRR DEBUG] Billing Period contribution for ${billingPeriod.id}:`,
              {
                subscriptionId: subscription.id,
                bpStart: bpStart.toISOString(),
                bpEnd: bpEnd.toISOString(),
                fullyCoversMonth,
                overlapPercentage,
                totalValue,
                monthlyValue,
                contribution,
                interval: (subscription as any).interval,
                intervalCount: subscription.intervalCount,
              }
            )
          }

          // Add the contribution of this billing period to the month's MRR
          monthlyRevenue += contribution
        } else if (debug) {
          console.log(
            `[MRR DEBUG] Billing Period ${billingPeriod.id} has no overlap with month`
          )
        }
      }
    )

    if (debug) {
      console.log(
        `[MRR DEBUG] Total MRR for month ${month.toISOString()}: ${monthlyRevenue}`
      )
    }

    return {
      month,
      amount: monthlyRevenue,
    }
  })

  if (debug) {
    console.log('[MRR DEBUG] Final MRR by month:', mrrByMonth)
  }

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
 * Decomposes MRR into its components: new, expansion, contraction, churn, and upgrades
 * This helps understand the sources of MRR changes
 */
export interface MRRBreakdown {
  newMRR: number // MRR from new subscriptions
  expansionMRR: number // MRR from upgrades to existing subscriptions
  contractionMRR: number // MRR from downgrades to existing subscriptions
  churnMRR: number // MRR lost from canceled subscriptions (excluding upgrades)
  upgradeMRR: number // MRR gained from free-to-paid upgrades
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
  let upgradeMRR = 0

  // To properly track upgrades, we need to get ALL subscriptions for the organization
  // to find upgrade relationships, not just those with billing periods
  const allSubscriptions = await transaction
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))

  // Build a map of replacement subscription IDs to their replaced predecessors
  const replacementMap = new Map<string, string>()
  for (const sub of allSubscriptions) {
    if (
      sub.replacedBySubscriptionId &&
      sub.cancellationReason === CancellationReason.UpgradedToPaid
    ) {
      replacementMap.set(sub.replacedBySubscriptionId, sub.id)
    }
  }

  // New MRR: Subscriptions in current month but not in previous month
  // Excludes free-to-paid upgrades; those are tracked in upgradeMRR
  for (const subscriptionId of currentSubscriptionIds) {
    if (!previousSubscriptionIds.has(subscriptionId)) {
      const mrr = getSubscriptionMRR(
        subscriptionId,
        currentBillingPeriods,
        currentMonthStart,
        currentMonthEnd
      )

      // Check if this subscription replaced an upgraded one
      const isUpgradeReplacement = replacementMap.has(subscriptionId)

      if (isUpgradeReplacement) {
        upgradeMRR += mrr
      } else {
        newMRR += mrr
      }
    }
  }

  // Churn MRR: Subscriptions in previous month but not in current month
  // (excluding subscriptions that were upgraded)
  for (const subscriptionId of previousSubscriptionIds) {
    if (!currentSubscriptionIds.has(subscriptionId)) {
      // Find the subscription to check if it was upgraded
      const subscription = previousBillingPeriods.find(
        (bp) => bp.subscription.id === subscriptionId
      )?.subscription

      // Only count as churn if not upgraded to paid
      if (
        subscription &&
        subscription.cancellationReason !==
          CancellationReason.UpgradedToPaid
      ) {
        churnMRR += getSubscriptionMRR(
          subscriptionId,
          previousBillingPeriods,
          previousMonthStart,
          previousMonthEnd
        )
      }
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
  const netMRR =
    newMRR + expansionMRR + upgradeMRR - contractionMRR - churnMRR

  return {
    newMRR,
    expansionMRR,
    contractionMRR,
    churnMRR,
    upgradeMRR,
    netMRR,
  }
}
