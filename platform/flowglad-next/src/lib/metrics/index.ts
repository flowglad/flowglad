import { CurrencyCode } from '@/types'
import {
  stripeCurrencyAmountToHumanReadableCurrencyAmount,
  stripeCurrencyAmountToShortReadableCurrencyAmount,
} from '@/utils/stripe'
import type { MetricConfig, MetricType } from './types'

export type {
  ChartDataParams,
  ChartDataPoint,
  DisplayValueMode,
  MetricConfig,
  MetricDataResult,
  MetricType,
} from './types'

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
 * Metric configurations for the dashboard chart.
 * Each metric defines how to display, format, and compute its values.
 *
 * NOTE: Data fetching is handled separately in useMetricData hook
 * to avoid hook rules violations.
 */
export const METRICS: Record<MetricType, MetricConfig> = {
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
 * Get all available metric types as an array.
 */
export const METRIC_TYPES = Object.keys(METRICS) as MetricType[]

/**
 * Default metric to display when no metric is selected.
 */
export const DEFAULT_METRIC: MetricType = 'revenue'
