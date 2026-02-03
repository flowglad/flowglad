import { CurrencyCode } from '@db-core/enums'
import { panic } from '@/errors'
import {
  stripeCurrencyAmountToHumanReadableCurrencyAmount,
  stripeCurrencyAmountToShortReadableCurrencyAmount,
} from '@/utils/stripe'
import type { MetricConfig, StaticMetricType } from './types'
import { isUsageMetric } from './types'

export type {
  ChartDataParams,
  ChartDataPoint,
  DisplayValueMode,
  MetricConfig,
  MetricType,
  StaticMetricType,
} from './types'

export { getUsageMeterId, isUsageMetric } from './types'

/**
 * Format a currency value for display.
 * Uses Stripe currency formatting utilities.
 */
function formatCurrency(
  value: number,
  currency: CurrencyCode
): string {
  return stripeCurrencyAmountToHumanReadableCurrencyAmount(
    currency,
    value
  )
}

/**
 * Format a currency value for Y-axis (shorter format).
 */
function formatCurrencyShort(
  value: number,
  currency: CurrencyCode
): string {
  return stripeCurrencyAmountToShortReadableCurrencyAmount(
    currency,
    value
  )
}

/**
 * Format a count value for display.
 */
function formatCount(value: number): string {
  return value.toLocaleString()
}

/**
 * Format a usage count value for display (same as formatCount).
 */
function formatUsageCount(value: number): string {
  return value.toLocaleString()
}

/**
 * Format a usage count value for Y-axis (shorter format).
 */
function formatUsageCountShort(value: number): string {
  if (value >= 1_000_000_000)
    return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toString()
}

/**
 * Static metric configurations for the dashboard chart.
 * Each metric defines how to display, format, and compute its values.
 *
 * NOTE: Data fetching is handled separately in useMetricData hook
 * to avoid hook rules violations.
 */
export const METRICS: Record<StaticMetricType, MetricConfig> = {
  revenue: {
    label: 'All revenue',
    infoTooltip:
      'Total revenue collected from all payments in the selected period, including one-time purchases and subscription payments.',
    category: 'value',
    displayValueMode: 'cumulative',
    formatValue: formatCurrency,
    formatYAxisValue: formatCurrencyShort,
  },
  mrr: {
    label: 'Monthly recurring revenue',
    infoTooltip:
      'The normalized monthly value of all active recurring subscriptions. Calculated as the sum of subscription amounts adjusted to a monthly rate.',
    category: 'value',
    displayValueMode: 'latest',
    formatValue: formatCurrency,
    formatYAxisValue: formatCurrencyShort,
  },
  subscribers: {
    label: 'Active subscribers',
    infoTooltip:
      'The number of customers with active paid subscriptions at each point in time.',
    category: 'value',
    displayValueMode: 'latest',
    formatValue: (value) => formatCount(value),
    formatYAxisValue: (value) => formatCount(value),
  },
}

/**
 * Creates a MetricConfig for a usage meter.
 * @param meterName - The display name of the usage meter
 * @returns MetricConfig for the usage meter
 */
export function createUsageMetricConfig(
  meterName: string
): MetricConfig {
  return {
    label: meterName,
    infoTooltip: `Total ${meterName.toLowerCase()} recorded in the selected period.`,
    category: 'value',
    displayValueMode: 'cumulative',
    formatValue: (_value, _currency) => formatUsageCount(_value),
    formatYAxisValue: (_value, _currency) =>
      formatUsageCountShort(_value),
  }
}

/**
 * Gets the MetricConfig for a metric type.
 * For static metrics, returns from METRICS record.
 * For usage metrics, creates a config using the meter name.
 *
 * @param metric - The metric type
 * @param meterName - Required for usage metrics, the display name of the meter
 * @returns MetricConfig for the metric
 * @throws Error if meterName is not provided for usage metrics
 */
export function getMetricConfig(
  metric: StaticMetricType | `usage:${string}`,
  meterName?: string
): MetricConfig {
  if (isUsageMetric(metric)) {
    if (!meterName) {
      panic('meterName is required for usage metrics')
    }
    return createUsageMetricConfig(meterName)
  }
  return METRICS[metric]
}

/**
 * Get all available static metric types as an array.
 */
export const METRIC_TYPES = Object.keys(METRICS) as StaticMetricType[]

/**
 * Default metric to display when no metric is selected.
 */
export const DEFAULT_METRIC: StaticMetricType = 'revenue'
