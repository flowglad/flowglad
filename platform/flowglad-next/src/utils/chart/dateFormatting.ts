import { RevenueChartIntervalUnit } from '@db-core/enums'

//#region Period Boundary Calculations
/**
 * MIGRATION NOTE: These period boundary functions calculate date ranges on the frontend.
 * When migrating to Option 2 (backend-provided boundaries), replace usage of these
 * functions with the `periodStart` and `periodEnd` fields from the API response.
 */

/**
 * Represents the boundaries of a time period for chart data points.
 * Used in tooltips to show the exact date range a data point represents.
 */
export interface PeriodBoundary {
  /** Start of the period (inclusive) */
  start: Date
  /** End of the period (inclusive) */
  end: Date
}

/**
 * Gets the last day of the month for a given UTC date.
 */
function getLastDayOfMonthUTC(date: Date): Date {
  // Move to next month, then back one day
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
}

/**
 * Gets the end of a day in UTC.
 */
function getEndOfDayUTC(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999
    )
  )
}

/**
 * Adds hours to a UTC date.
 */
function addHoursUTC(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

/**
 * Adds days to a UTC date.
 */
function addDaysUTC(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

/**
 * Calculates the natural period boundaries for a data point based on interval type.
 * Does NOT account for user's selected date range - use `calculateActualPeriodBoundary`
 * for that.
 *
 * @param periodStart - The start date of the period (from backend)
 * @param intervalUnit - The time granularity
 * @returns The natural start and end of the period
 *
 * @example
 * // Monthly: Feb 1 -> Feb 1 to Feb 28
 * calculateNaturalPeriodBoundary(new Date('2025-02-01'), 'month')
 * // { start: 2025-02-01, end: 2025-02-28 }
 */
export function calculateNaturalPeriodBoundary(
  periodStart: Date,
  intervalUnit: RevenueChartIntervalUnit
): PeriodBoundary {
  switch (intervalUnit) {
    case RevenueChartIntervalUnit.Hour: {
      const end = new Date(addHoursUTC(periodStart, 1).getTime() - 1)
      return { start: periodStart, end }
    }
    case RevenueChartIntervalUnit.Day: {
      return { start: periodStart, end: getEndOfDayUTC(periodStart) }
    }
    case RevenueChartIntervalUnit.Week: {
      // Week is 7 days from start
      const end = new Date(addDaysUTC(periodStart, 7).getTime() - 1)
      return { start: periodStart, end }
    }
    case RevenueChartIntervalUnit.Month: {
      return {
        start: periodStart,
        end: getLastDayOfMonthUTC(periodStart),
      }
    }
    case RevenueChartIntervalUnit.Year: {
      const yearEnd = new Date(
        Date.UTC(
          periodStart.getUTCFullYear(),
          11,
          31,
          23,
          59,
          59,
          999
        )
      )
      return { start: periodStart, end: yearEnd }
    }
    default:
      return { start: periodStart, end: getEndOfDayUTC(periodStart) }
  }
}

/**
 * Calculates the actual period boundaries, accounting for partial periods
 * at the start and end of the user's selected date range.
 *
 * This enables contextual tooltips that show accurate date ranges:
 * - First data point: may start mid-period (e.g., "8 Jan - 31 Jan")
 * - Last data point: may end early (e.g., "1 Jan - 8 Jan" for current month)
 * - Middle data points: full period (e.g., "1 Feb - 28 Feb")
 *
 * MIGRATION NOTE: When backend provides `periodStart` and `periodEnd` directly,
 * this function can be simplified to just use those values.
 *
 * @param periodStart - The start date of the period (from backend)
 * @param intervalUnit - The time granularity
 * @param rangeStart - User's selected start date
 * @param rangeEnd - User's selected end date
 * @param isFirstPoint - Whether this is the first data point
 * @param isLastPoint - Whether this is the last data point
 */
export function calculateActualPeriodBoundary(
  periodStart: Date,
  intervalUnit: RevenueChartIntervalUnit,
  rangeStart: Date,
  rangeEnd: Date,
  isFirstPoint: boolean,
  isLastPoint: boolean
): PeriodBoundary {
  const natural = calculateNaturalPeriodBoundary(
    periodStart,
    intervalUnit
  )

  // Clip to user's selected range for partial periods
  const actualStart =
    isFirstPoint && rangeStart > natural.start
      ? rangeStart
      : natural.start

  const actualEnd =
    isLastPoint && rangeEnd < natural.end ? rangeEnd : natural.end

  return { start: actualStart, end: actualEnd }
}

//#endregion

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
 * Format follows analytics dashboard conventions:
 * - Hourly: "00:00" (just time)
 * - Daily/Weekly: "15 Jan" (day + month)
 * - Monthly: "Jan" (just month)
 * - Yearly: "2025" (just year)
 *
 * @param date - Date object to format
 * @param granularity - Time granularity for format selection
 * @returns Formatted date string
 *
 * @example
 * formatDateUTC(new Date('2025-01-15T10:00:00Z'), 'hour') // "10:00"
 * formatDateUTC(new Date('2025-01-15'), 'day') // "15 Jan"
 * formatDateUTC(new Date('2025-01-15'), 'month') // "Jan"
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
      // Just time - users see date range in the picker
      return `${hours}:${minutes}`
    case RevenueChartIntervalUnit.Month:
      // Just month name
      return month
    case RevenueChartIntervalUnit.Week:
    case RevenueChartIntervalUnit.Day:
    default:
      return `${day} ${month}`
  }
}
