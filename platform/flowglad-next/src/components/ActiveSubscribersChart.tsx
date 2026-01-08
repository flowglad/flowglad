'use client'

import { isValid } from 'date-fns'
import React from 'react'
import { trpc } from '@/app/_trpc/client'
import {
  ChartBody,
  ChartHeader,
  ChartValueDisplay,
  LineChart,
  type TooltipProps,
} from '@/components/charts'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useChartInterval } from '@/hooks/useChartInterval'
import { useChartTooltip } from '@/hooks/useChartTooltip'
import { cn } from '@/lib/utils'
import { RevenueChartIntervalUnit } from '@/types'
import {
  formatDateUTC,
  MONTH_NAMES_FULL,
} from '@/utils/chart/dateFormatting'

/**
 * Formats a date label for the tooltip using UTC.
 * Uses the ISO date string if available, otherwise attempts to parse the label.
 * Formats as "MMMM yyyy" (e.g., "October 2025") in UTC.
 * Falls back to the original label if parsing fails.
 */
function TooltipDateLabel({
  label,
  isoDate,
}: {
  label: string
  isoDate?: string
}) {
  try {
    // Prefer isoDate if available, as it contains the full date with year
    const dateString = isoDate ?? label
    const date = new Date(dateString)
    if (isValid(date)) {
      const month = MONTH_NAMES_FULL[date.getUTCMonth()]
      const year = date.getUTCFullYear()
      return <span>{`${month} ${year}`}</span>
    }
    return <span>{label}</span>
  } catch {
    return <span>{label}</span>
  }
}

/**
 * Tooltip component for subscriber count chart.
 * Shows subscriber count on top, date below - matching the Figma design.
 */
const SubscriberCountTooltip = ({
  active,
  payload,
  label,
}: TooltipProps) => {
  if (!active || !payload?.[0] || !label) {
    return null
  }
  const value = payload[0].value as number
  // Extract the ISO date from the payload data for proper year formatting
  const isoDate = payload[0].payload?.isoDate as string | undefined

  return (
    <ErrorBoundary fallback={<div>Error</div>}>
      <div
        className={cn(
          'bg-popover flex flex-col gap-2 p-2 rounded border border-border',
          'shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]'
        )}
      >
        <p className="text-base font-medium text-foreground tracking-tight leading-none">
          {value.toLocaleString()}
        </p>
        <p className="text-sm text-muted-foreground tracking-tight leading-5">
          <TooltipDateLabel
            label={label as string}
            isoDate={isoDate}
          />
        </p>
      </div>
    </ErrorBoundary>
  )
}

interface ActiveSubscribersChartProps {
  fromDate: Date
  toDate: Date
  // TODO: Add productId prop when global dashboard product filter is implemented
  /** Optional controlled interval. When provided, the chart uses this value
   *  and hides its inline interval selector. */
  interval?: RevenueChartIntervalUnit
  /** Optional callback for controlled mode interval changes. */
  onIntervalChange?: (interval: RevenueChartIntervalUnit) => void
}

/**
 * Component for displaying Active Subscribers data in a chart.
 * Shows the last subscriber count by default, individual period count on hover.
 */
export const ActiveSubscribersChart = ({
  fromDate,
  toDate,
  interval: controlledInterval,
  onIntervalChange,
}: ActiveSubscribersChartProps) => {
  // Use shared hooks for tooltip and interval management
  const { tooltipData, tooltipCallback } = useChartTooltip()
  const { interval, handleIntervalChange, showInlineSelector } =
    useChartInterval({
      fromDate,
      toDate,
      controlledInterval,
      onIntervalChange,
    })

  const { data: subscriberData, isLoading } =
    trpc.organizations.getActiveSubscribers.useQuery({
      startDate: fromDate,
      endDate: toDate,
      granularity: interval,
    })

  const firstPayloadValue = tooltipData?.payload?.[0]?.value

  const chartData = React.useMemo(() => {
    if (!subscriberData) return []
    return subscriberData.map((item) => {
      const dateObj = new Date(item.month)
      return {
        // Use UTC formatting to match PostgreSQL's date_trunc behavior
        date: formatDateUTC(dateObj, interval),
        // Store the ISO date string for the tooltip to use for proper year formatting
        isoDate: dateObj.toISOString(),
        // Store the interval unit for the tooltip to format dates appropriately
        intervalUnit: interval,
        subscribers: item.count,
      }
    })
  }, [subscriberData, interval])

  // Calculate max value for better visualization,
  // fitting the y axis to the max value in the data
  const maxValue = React.useMemo(() => {
    if (!subscriberData?.length) return 0
    const max = Math.max(...subscriberData.map((item) => item.count))
    return max
  }, [subscriberData])

  const formattedSubscriberValue = React.useMemo(() => {
    if (!subscriberData?.length) {
      return '0'
    }
    // If the tooltip is active, use the value from the tooltip
    if (firstPayloadValue != null) {
      return firstPayloadValue.toString()
    }
    // If the tooltip is not active, use the last value in the chart
    const count = subscriberData[subscriberData.length - 1].count
    return count.toString()
  }, [subscriberData, firstPayloadValue])

  return (
    <div className="w-full h-full">
      <ChartHeader
        title="Active Subscribers"
        infoTooltip="The number of customers with active paid subscriptions at each point in time."
        showInlineSelector={showInlineSelector}
        interval={interval}
        onIntervalChange={handleIntervalChange}
        fromDate={fromDate}
        toDate={toDate}
      />

      <ChartValueDisplay
        value={formattedSubscriberValue}
        isLoading={isLoading}
      />

      <ChartBody isLoading={isLoading}>
        <LineChart
          data={chartData}
          index="date"
          categories={['subscribers']}
          className="-mb-2 mt-2"
          colors={['foreground']}
          fill="gradient"
          customTooltip={SubscriberCountTooltip}
          maxValue={maxValue}
          autoMinValue={false}
          minValue={0}
          startEndOnly={true}
          startEndOnlyYAxis={true}
          showYAxis={false}
          valueFormatter={(value: number) => value.toString()}
          tooltipCallback={tooltipCallback}
        />
      </ChartBody>
    </div>
  )
}
