import { differenceInDays, differenceInHours } from 'date-fns'
import { RevenueChartIntervalUnit } from '@/types'

/**
 * Two dots make a graph principle: this is the minimum range duration required
 * in hours, required to display a multi-point graph
 * @deprecated Use `getIntervalConfig()` instead for new code
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
 * Configuration for interval options based on date range
 */
export interface IntervalConfig {
  /** The recommended default interval for this date range */
  default: RevenueChartIntervalUnit
  /** Available interval options for this date range (default first, alternative second) */
  options: RevenueChartIntervalUnit[]
}

/**
 * Label mapping for interval units (adjective form, capitalized)
 */
export const intervalLabels: Record<
  RevenueChartIntervalUnit,
  string
> = {
  [RevenueChartIntervalUnit.Hour]: 'Hourly',
  [RevenueChartIntervalUnit.Day]: 'Daily',
  [RevenueChartIntervalUnit.Week]: 'Weekly',
  [RevenueChartIntervalUnit.Month]: 'Monthly',
  [RevenueChartIntervalUnit.Year]: 'Yearly',
}

/**
 * Label mapping for interval units (noun form, lowercase)
 * Used for inline selectors like "Revenue by day"
 */
export const intervalNounLabels: Record<
  RevenueChartIntervalUnit,
  string
> = {
  [RevenueChartIntervalUnit.Hour]: 'hour',
  [RevenueChartIntervalUnit.Day]: 'day',
  [RevenueChartIntervalUnit.Week]: 'week',
  [RevenueChartIntervalUnit.Month]: 'month',
  [RevenueChartIntervalUnit.Year]: 'year',
}

/**
 * Returns the interval configuration based on the selected date range.
 * Only valid options are returned - no disabled options.
 *
 * | Date Range       | Default  | Options              |
 * |------------------|----------|----------------------|
 * | 0-1 day          | Hourly   | Hourly               |
 * | 2-14 days        | Daily    | Daily, Hourly        |
 * | 15-30 days       | Daily    | Daily, Weekly        |
 * | 31-92 days       | Weekly   | Weekly, Monthly      |
 * | 93-365+ days     | Monthly  | Monthly, Weekly      |
 */
export function getIntervalConfig(
  fromDate: Date,
  toDate: Date
): IntervalConfig {
  const days = differenceInDays(toDate, fromDate)

  if (days <= 1) {
    // Today / same day
    return {
      default: RevenueChartIntervalUnit.Hour,
      options: [RevenueChartIntervalUnit.Hour],
    }
  }

  if (days <= 14) {
    // 2-14 days
    return {
      default: RevenueChartIntervalUnit.Day,
      options: [
        RevenueChartIntervalUnit.Day,
        RevenueChartIntervalUnit.Hour,
      ],
    }
  }

  if (days <= 30) {
    // 15-30 days
    return {
      default: RevenueChartIntervalUnit.Day,
      options: [
        RevenueChartIntervalUnit.Day,
        RevenueChartIntervalUnit.Week,
      ],
    }
  }

  if (days <= 92) {
    // 31-92 days (~1-3 months)
    return {
      default: RevenueChartIntervalUnit.Week,
      options: [
        RevenueChartIntervalUnit.Week,
        RevenueChartIntervalUnit.Month,
      ],
    }
  }

  // 93-365+ days
  return {
    default: RevenueChartIntervalUnit.Month,
    options: [
      RevenueChartIntervalUnit.Month,
      RevenueChartIntervalUnit.Week,
    ],
  }
}

/**
 * Computes the best default interval based on the date range.
 * This is a backward-compatible wrapper around `getIntervalConfig()`.
 */
export function getDefaultInterval(
  fromDate: Date,
  toDate: Date
): RevenueChartIntervalUnit {
  return getIntervalConfig(fromDate, toDate).default
}

/**
 * Returns interval options for a Select component based on date range.
 * Each option has a `label` (e.g., "day") and `value` (the enum value).
 *
 * @example
 * const options = getIntervalSelectOptions(fromDate, toDate)
 * // [{ label: 'day', value: 'day' }, { label: 'week', value: 'week' }]
 */
export function getIntervalSelectOptions(
  fromDate: Date,
  toDate: Date
): Array<{ label: string; value: RevenueChartIntervalUnit }> {
  const config = getIntervalConfig(fromDate, toDate)
  return config.options.map((opt) => ({
    label: intervalNounLabels[opt],
    value: opt,
  }))
}
