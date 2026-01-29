'use client'

import {
  CurrencyCode,
  UsageMeterAggregationType,
} from '@db-core/enums'
import { ChevronDown } from 'lucide-react'
import React from 'react'
import { trpc } from '@/app/_trpc/client'
import { ChartDataTooltip } from '@/components/ChartDataTooltip'
import {
  CHART_SIZE_CONFIG,
  ChartBody,
  type ChartSize,
  ChartValueDisplay,
  DASHBOARD_LINE_CHART_DEFAULTS,
  LineChart,
} from '@/components/charts'
import { Button } from '@/components/ui/button'
import { ChartInfoTooltip } from '@/components/ui/chart-info-tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { useChartTooltip } from '@/hooks/useChartTooltip'
import { useMetricData } from '@/hooks/useMetricData'
import {
  DEFAULT_METRIC,
  getMetricConfig,
  isUsageMetric,
  METRIC_TYPES,
  METRICS,
  type MetricType,
  type StaticMetricType,
} from '@/lib/metrics'
import { cn } from '@/lib/utils'
import { RevenueChartIntervalUnit } from '@/types'

/**
 * Information about a selected usage meter.
 */
interface SelectedMeterInfo {
  id: string
  name: string
  aggregationType: UsageMeterAggregationType
  pricingModelId: string
}

interface DashboardChartProps {
  /** Start date for the chart data range */
  fromDate: Date
  /** End date for the chart data range */
  toDate: Date
  /** Controlled interval from parent (global selector) */
  interval: RevenueChartIntervalUnit
  /** Chart size variant - 'lg' for primary, 'sm' for secondary */
  size?: ChartSize
  /** Available static metrics to show in the selector */
  availableMetrics?: StaticMetricType[]
  /** Default metric to display */
  defaultMetric?: StaticMetricType
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

  // Selected meter info for usage metrics (stores meter metadata for display)
  const [selectedMeterInfo, setSelectedMeterInfo] =
    React.useState<SelectedMeterInfo | null>(null)

  // Fetch usage meters with events (decoupled from product filter)
  const { data: usageMeters, isLoading: isLoadingMeters } =
    trpc.organizations.getUsageMetersWithEvents.useQuery(
      {},
      { enabled: !!organization?.id }
    )

  // Reset to a valid metric if current selection is no longer available
  // Note: Usage metrics don't need reset since meter list is decoupled from product filter
  React.useEffect(() => {
    if (
      !isUsageMetric(selectedMetric) &&
      !availableMetrics.includes(selectedMetric as StaticMetricType)
    ) {
      // Prefer defaultMetric if valid, otherwise fall back to first available
      const resetMetric = availableMetrics.includes(defaultMetric)
        ? defaultMetric
        : availableMetrics[0]
      setSelectedMetric(resetMetric)
      setSelectedMeterInfo(null)
    }
  }, [availableMetrics, selectedMetric, defaultMetric])

  // Get metric config - uses meter name for usage metrics
  const metricConfig = React.useMemo(
    () => getMetricConfig(selectedMetric, selectedMeterInfo?.name),
    [selectedMetric, selectedMeterInfo?.name]
  )

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

  // Handle static metric selection
  const handleStaticSelect = (value: string) => {
    setSelectedMetric(value as StaticMetricType)
    setSelectedMeterInfo(null)
  }

  // Handle usage metric selection
  const handleUsageSelect = (meterId: string) => {
    const meter = usageMeters?.find((m) => m.id === meterId)
    if (meter) {
      setSelectedMetric(`usage:${meterId}`)
      setSelectedMeterInfo({
        id: meter.id,
        name: meter.name,
        aggregationType: meter.aggregationType,
        pricingModelId: meter.pricingModelId,
      })
    }
  }

  // Determine if we should show the dropdown (more than 1 option available)
  const hasMultipleOptions =
    availableMetrics.length > 1 ||
    (usageMeters && usageMeters.length > 0)

  // Get current label for dropdown trigger
  const currentLabel = metricConfig.label

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
          {hasMultipleOptions ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <span>{currentLabel}</span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {/* Static metrics section */}
                <DropdownMenuRadioGroup
                  value={
                    isUsageMetric(selectedMetric)
                      ? ''
                      : selectedMetric
                  }
                  onValueChange={handleStaticSelect}
                >
                  {availableMetrics.map((metric) => (
                    <DropdownMenuRadioItem
                      key={metric}
                      value={metric}
                    >
                      {METRICS[metric].label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>

                {/* Usage meters section */}
                {isLoadingMeters ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>
                      Usage Meters
                    </DropdownMenuLabel>
                    <div className="px-2 py-1.5">
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </>
                ) : usageMeters && usageMeters.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>
                      Usage Meters
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={
                        isUsageMetric(selectedMetric)
                          ? selectedMetric.replace('usage:', '')
                          : ''
                      }
                      onValueChange={handleUsageSelect}
                    >
                      {usageMeters.map((meter) => (
                        <DropdownMenuRadioItem
                          key={meter.id}
                          value={meter.id}
                        >
                          {meter.name}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
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
