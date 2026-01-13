import type { CurrencyCode, RevenueChartIntervalUnit } from '@/types'

/**
 * Available metric types for the dashboard chart selector.
 */
export type MetricType = 'revenue' | 'mrr' | 'subscribers'

/**
 * Mode for computing the display value shown in the chart header.
 * - 'cumulative': Sum all values in the data (e.g., total revenue)
 * - 'latest': Use the last value in the data (e.g., current MRR, subscriber count)
 */
export type DisplayValueMode = 'cumulative' | 'latest'

/**
 * Chart data point shape after transformation.
 * Used by the LineChart component.
 *
 * Includes an index signature to satisfy Record<string, unknown>
 * which is required by the LineChart data prop.
 */
export interface ChartDataPoint {
  /** Index signature for LineChart compatibility */
  [key: string]: unknown
  /** Formatted date string for X-axis display */
  date: string
  /** The metric value for this data point */
  value: number
  /** ISO date string for tooltip (from createChartTooltipMetadata) */
  isoDate: string
  /** Interval unit for tooltip formatting */
  intervalUnit: RevenueChartIntervalUnit
  /** Range start for tooltip */
  rangeStart: string
  /** Range end for tooltip */
  rangeEnd: string
  /** Whether this is the first point */
  isFirstPoint: boolean
  /** Whether this is the last point */
  isLastPoint: boolean
}

/**
 * Configuration for a dashboard metric.
 * Defines how to fetch, transform, format, and display metric data.
 */
export interface MetricConfig {
  /** Display label for the metric selector */
  label: string
  /** Info tooltip content explaining the metric */
  infoTooltip: string
  /** Recharts data key for the value */
  category: string
  /** How to compute the display value in the chart header */
  displayValueMode: DisplayValueMode
  /**
   * Format the value for display in header and tooltips.
   * @param value - The numeric value
   * @param currency - The organization's default currency
   */
  formatValue: (value: number, currency: CurrencyCode) => string
  /**
   * Format the value for the Y-axis labels (shorter format).
   * @param value - The numeric value
   * @param currency - The organization's default currency
   */
  formatYAxisValue: (value: number, currency: CurrencyCode) => string
}

/**
 * Parameters for fetching chart data.
 */
export interface ChartDataParams {
  fromDate: Date
  toDate: Date
  interval: RevenueChartIntervalUnit
  organizationId: string
}
