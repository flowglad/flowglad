import { differenceInHours } from 'date-fns'
import { RevenueChartIntervalUnit } from '@/types'

/**
 * Two dots make a graph principle: this is the minimum range duration required
 * in hours, required to display a multi-point graph
 */
export const minimumUnitInHours: Record<
  RevenueChartIntervalUnit,
  number
> = {
  [RevenueChartIntervalUnit.Year]: 24 * 365 * 2,
  [RevenueChartIntervalUnit.Month]: 24 * 30 * 2,
  [RevenueChartIntervalUnit.Week]: 24 * 7 * 2,
  [RevenueChartIntervalUnit.Day]: 24 * 2,
  [RevenueChartIntervalUnit.Hour]: 1 * 2,
} as const

/**
 * Computes the best default interval based on the date range.
 * Based on preset expectations:
 * - Last 3/6/12 months → Monthly (>= 60 days)
 * - Last 7/30 days → Daily (>= 1 day but < 60 days)
 * - Today → Hourly (< 1 day)
 */
export function getDefaultInterval(
  fromDate: Date,
  toDate: Date
): RevenueChartIntervalUnit {
  const timespanInHours = differenceInHours(toDate, fromDate)

  // 2+ months (60 days = 1440 hours): Monthly
  // Covers Last 3 months, Last 6 months, Last 12 months
  if (timespanInHours >= 24 * 60) {
    return RevenueChartIntervalUnit.Month
  }

  // 1+ day (48 hours) but less than 2 months: Daily
  // Covers Last 7 days, Last 30 days
  // Uses minimumUnitInHours[RevenueChartIntervalUnit.Day] threshold for consistency
  if (
    timespanInHours >=
    minimumUnitInHours[RevenueChartIntervalUnit.Day]
  ) {
    return RevenueChartIntervalUnit.Day
  }

  // Less than 1 day (including "Today"): Hourly
  return RevenueChartIntervalUnit.Hour
}
