'use client'

import React from 'react'
import { trpc } from '@/app/_trpc/client'
import { ChartDataTooltip } from '@/components/ChartDataTooltip'
import {
  ChartBody,
  ChartHeader,
  ChartValueDisplay,
  LineChart,
} from '@/components/charts'
import { useChartInterval } from '@/hooks/useChartInterval'
import { useChartTooltip } from '@/hooks/useChartTooltip'
import { RevenueChartIntervalUnit } from '@/types'
import { formatDateUTC } from '@/utils/chart/dateFormatting'

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
    return subscriberData.map((item, index) => {
      const dateObj = new Date(item.month)
      return {
        // Use UTC formatting to match PostgreSQL's date_trunc behavior
        date: formatDateUTC(dateObj, interval),
        // Store the ISO date string for the tooltip to use for proper year formatting
        isoDate: dateObj.toISOString(),
        // Store the interval unit for the tooltip to format dates appropriately
        intervalUnit: interval,
        // Range metadata for accurate period boundary display in tooltips
        rangeStart: fromDate.toISOString(),
        rangeEnd: toDate.toISOString(),
        isFirstPoint: index === 0,
        isLastPoint: index === subscriberData.length - 1,
        subscribers: item.count,
      }
    })
  }, [subscriberData, interval, fromDate, toDate])

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
        title="Active subscribers"
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
          customTooltip={(props) => (
            <ChartDataTooltip
              {...props}
              valueFormatter={(value) => value.toLocaleString()}
            />
          )}
          maxValue={maxValue}
          autoMinValue={false}
          minValue={0}
          startEndOnly={true}
          startEndOnlyYAxis={true}
          showYAxis={false}
          intervalUnit={interval}
          valueFormatter={(value: number) => value.toString()}
          tooltipCallback={tooltipCallback}
        />
      </ChartBody>
    </div>
  )
}
