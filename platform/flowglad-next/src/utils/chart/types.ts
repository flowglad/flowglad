import { RevenueChartIntervalUnit } from '@db-core/enums'

/**
 * Metadata included in chart data payloads for tooltip rendering.
 *
 * MIGRATION NOTE: When migrating to Option 2 (backend-provided boundaries),
 * add `periodStart` and `periodEnd` fields here and remove the calculation
 * logic from the tooltip component.
 */
export interface ChartTooltipMetadata {
  /** ISO date string of the period start (from backend) */
  isoDate: string
  /** The interval unit for this data point */
  intervalUnit: RevenueChartIntervalUnit
  /** ISO date string of the user's selected range start */
  rangeStart: string
  /** ISO date string of the user's selected range end */
  rangeEnd: string
  /** Whether this is the first data point in the series */
  isFirstPoint: boolean
  /** Whether this is the last data point in the series */
  isLastPoint: boolean
}

/**
 * Creates tooltip metadata for a chart data point.
 * Use this helper in chart components to ensure consistent metadata structure.
 *
 * @example
 * const chartData = revenueData.map((item, index) => ({
 *   date: formatDateUTC(item.date, interval),
 *   revenue: item.revenue,
 *   ...createChartTooltipMetadata({
 *     date: item.date,
 *     intervalUnit: interval,
 *     rangeStart: fromDate,
 *     rangeEnd: toDate,
 *     index,
 *     totalPoints: revenueData.length,
 *   }),
 * }))
 */
export function createChartTooltipMetadata(params: {
  date: Date
  intervalUnit: RevenueChartIntervalUnit
  rangeStart: Date
  rangeEnd: Date
  index: number
  totalPoints: number
}): ChartTooltipMetadata {
  return {
    isoDate: params.date.toISOString(),
    intervalUnit: params.intervalUnit,
    rangeStart: params.rangeStart.toISOString(),
    rangeEnd: params.rangeEnd.toISOString(),
    isFirstPoint: params.index === 0,
    isLastPoint: params.index === params.totalPoints - 1,
  }
}
