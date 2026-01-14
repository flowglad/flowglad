'use client'

import React from 'react'
import { ChartDataTooltip } from '@/components/ChartDataTooltip'
import {
  CHART_SIZE_CONFIG,
  ChartBody,
  type ChartSize,
  ChartValueDisplay,
  DASHBOARD_LINE_CHART_DEFAULTS,
  LineChart,
} from '@/components/charts'
import { ChartInfoTooltip } from '@/components/ui/chart-info-tooltip'
import { GhostSelect } from '@/components/ui/ghost-select'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { useChartTooltip } from '@/hooks/useChartTooltip'
import { useMetricData } from '@/hooks/useMetricData'
import {
  DEFAULT_METRIC,
  METRIC_TYPES,
  METRICS,
  type MetricType,
} from '@/lib/metrics'
import { cn } from '@/lib/utils'
import { CurrencyCode, RevenueChartIntervalUnit } from '@/types'

interface DashboardChartProps {
  /** Start date for the chart data range */
  fromDate: Date
  /** End date for the chart data range */
  toDate: Date
  /** Controlled interval from parent (global selector) */
  interval: RevenueChartIntervalUnit
  /** Chart size variant - 'lg' for primary, 'sm' for secondary */
  size?: ChartSize
  /** Available metrics to show in the selector */
  availableMetrics?: MetricType[]
  /** Default metric to display */
  defaultMetric?: MetricType
  /** Optional product ID to filter metrics by a specific product */
  productId?: string | null
}

/**
 * Unified dashboard chart component with metric selector.
 * Allows switching between metrics (Revenue, MRR, Subscribers) via a dropdown.
 *
 * Features:
 * - Ghost dropdown button that replaces the chart title
 * - Only fetches data for the active metric (via `enabled` flag)
 * - Supports both 'lg' (primary) and 'sm' (secondary) size variants
 * - Consistent styling with ChartLayout primitives
 *
 * @example
 * // Primary chart with all metrics
 * <DashboardChart
 *   fromDate={range.from}
 *   toDate={range.to}
 *   interval={interval}
 *   size="lg"
 * />
 *
 * @example
 * // Secondary chart with limited metrics
 * <DashboardChart
 *   fromDate={range.from}
 *   toDate={range.to}
 *   interval={interval}
 *   size="sm"
 *   availableMetrics={['mrr', 'subscribers']}
 *   defaultMetric="mrr"
 * />
 */
export function DashboardChart({
  fromDate,
  toDate,
  interval,
  size = 'lg',
  availableMetrics = METRIC_TYPES,
  defaultMetric = DEFAULT_METRIC,
  productId,
}: DashboardChartProps) {
  // Guard against empty availableMetrics - this is a programming error
  if (availableMetrics.length === 0) {
    throw new Error(
      'DashboardChart: availableMetrics cannot be empty. At least one metric must be provided.'
    )
  }

  const { organization } = useAuthenticatedContext()
  const config = CHART_SIZE_CONFIG[size]

  // Metric selection state - ensure initial value is valid
  const [selectedMetric, setSelectedMetric] =
    React.useState<MetricType>(() =>
      availableMetrics.includes(defaultMetric)
        ? defaultMetric
        : availableMetrics[0]
    )

  // Reset to a valid metric if current selection is no longer available
  React.useEffect(() => {
    if (!availableMetrics.includes(selectedMetric)) {
      // Prefer defaultMetric if valid, otherwise fall back to first available
      const resetMetric = availableMetrics.includes(defaultMetric)
        ? defaultMetric
        : availableMetrics[0]
      setSelectedMetric(resetMetric)
    }
  }, [availableMetrics, selectedMetric, defaultMetric])

  const metricConfig = METRICS[selectedMetric]

  // Tooltip state management
  const { tooltipData, tooltipCallback } = useChartTooltip(
    `${selectedMetric}:${interval}:${fromDate.toISOString()}:${toDate.toISOString()}:${productId ?? ''}`
  )

  // Fetch data for the selected metric
  const {
    data: chartData,
    isLoading,
    maxValue,
    rawValues,
  } = useMetricData(selectedMetric, {
    fromDate,
    toDate,
    interval,
    organizationId: organization?.id ?? '',
    productId,
  })

  // Get currency for formatting
  const currency = organization?.defaultCurrency ?? CurrencyCode.USD

  // Compute display value based on metric config
  const displayValue = React.useMemo(() => {
    if (!rawValues.length) {
      return metricConfig.formatValue(0, currency)
    }

    // If tooltip is active, show the hovered value
    const tooltipValue = tooltipData?.payload?.[0]?.value
    if (
      typeof tooltipValue === 'number' &&
      Number.isFinite(tooltipValue)
    ) {
      return metricConfig.formatValue(tooltipValue, currency)
    }

    // Otherwise, compute based on display mode
    if (metricConfig.displayValueMode === 'cumulative') {
      const total = rawValues.reduce((acc, val) => acc + val, 0)
      return metricConfig.formatValue(total, currency)
    } else {
      // 'latest' mode - use last value
      const lastValue = rawValues[rawValues.length - 1]
      return metricConfig.formatValue(lastValue, currency)
    }
  }, [rawValues, tooltipData, metricConfig, currency])

  // Memoize value formatters to prevent unnecessary re-renders
  const valueFormatter = React.useCallback(
    (value: number) => metricConfig.formatValue(value, currency),
    [metricConfig, currency]
  )

  const yAxisValueFormatter = React.useCallback(
    (value: number) => metricConfig.formatYAxisValue(value, currency),
    [metricConfig, currency]
  )

  return (
    <div className="w-full h-full">
      {/* Header with metric selector */}
      <div
        className={cn(
          'flex flex-row gap-2 justify-between',
          config.padding
        )}
      >
        <div className="-ml-3 text-foreground w-fit flex items-center flex-row gap-0.5">
          {availableMetrics.length > 1 ? (
            <GhostSelect
              value={selectedMetric}
              onValueChange={(value) =>
                setSelectedMetric(value as MetricType)
              }
              options={availableMetrics.map((metric) => ({
                value: metric,
                label: METRICS[metric].label,
              }))}
            />
          ) : (
            <p className="whitespace-nowrap text-sm font-medium">
              {metricConfig.label}
            </p>
          )}
        </div>
        <ChartInfoTooltip content={metricConfig.infoTooltip} />
      </div>

      {/* Value display */}
      <ChartValueDisplay
        value={displayValue}
        isLoading={isLoading}
        size={size}
      />

      {/* Chart body */}
      <ChartBody isLoading={isLoading} size={size}>
        <LineChart
          {...DASHBOARD_LINE_CHART_DEFAULTS}
          data={chartData}
          index="date"
          categories={['value']}
          className={cn('mt-3', config.height)}
          showGridLines={config.showGridLines}
          horizontalMargin={config.chartMargin}
          maxValue={maxValue}
          intervalUnit={interval}
          customTooltip={(props) => (
            <ChartDataTooltip
              {...props}
              valueFormatter={valueFormatter}
            />
          )}
          valueFormatter={valueFormatter}
          yAxisValueFormatter={yAxisValueFormatter}
          tooltipCallback={tooltipCallback}
        />
      </ChartBody>
    </div>
  )
}
