import { RevenueChartIntervalUnit } from '@/types'

/**
 * Short month names for chart axis labels.
 * Used across all time-series charts for consistent formatting.
 */
export const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * Full month names for tooltips.
 */
export const MONTH_NAMES_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/**
 * Formats a UTC date without timezone conversion.
 * Ensures dates from PostgreSQL date_trunc display correctly
 * regardless of user's local timezone.
 *
 * @param date - Date object to format
 * @param granularity - Time granularity for format selection
 * @returns Formatted date string
 *
 * @example
 * formatDateUTC(new Date('2025-01-15'), 'day') // "15 Jan"
 * formatDateUTC(new Date('2025-01-15T10:00:00Z'), 'hour') // "15 Jan 10:00"
 */
export function formatDateUTC(
  date: Date,
  granularity: RevenueChartIntervalUnit
): string {
  const day = date.getUTCDate()
  const month = MONTH_NAMES_SHORT[date.getUTCMonth()]
  const year = date.getUTCFullYear()
  const hours = date.getUTCHours().toString().padStart(2, '0')
  const minutes = date.getUTCMinutes().toString().padStart(2, '0')

  switch (granularity) {
    case RevenueChartIntervalUnit.Year:
      return `${year}`
    case RevenueChartIntervalUnit.Hour:
      return `${day} ${month} ${hours}:${minutes}`
    case RevenueChartIntervalUnit.Month:
    case RevenueChartIntervalUnit.Week:
    case RevenueChartIntervalUnit.Day:
    default:
      return `${day} ${month}`
  }
}
