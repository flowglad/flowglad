'use client'

import React from 'react'
import { trpc } from '@/app/_trpc/client'
import { ChartDataTooltip } from '@/components/ChartDataTooltip'
import {
  CHART_SIZE_CONFIG,
  ChartLayout,
  type ChartSize,
  DASHBOARD_LINE_CHART_DEFAULTS,
  LineChart,
} from '@/components/charts'
import { useChartTooltip } from '@/hooks/useChartTooltip'
import { cn } from '@/lib/utils'
import { RevenueChartIntervalUnit } from '@/types'
import { formatDateUTC } from '@/utils/chart/dateFormatting'
import { createChartTooltipMetadata } from '@/utils/chart/types'

interface ActiveSubscribersChartProps {
  fromDate: Date
  toDate: Date
  // TODO: Add productId prop when global dashboard product filter is implemented
  /** Controlled interval from parent (global selector) */
  interval: RevenueChartIntervalUnit
  /** Chart size variant - 'lg' for primary, 'sm' for secondary */
  size?: ChartSize
}

/**
 * Component for displaying Active Subscribers data in a chart.
 * Shows the last subscriber count by default, individual period count on hover.
 */
export const ActiveSubscribersChart = ({
  fromDate,
  toDate,
  interval,
  size = 'lg',
}: ActiveSubscribersChartProps) => {
  const config = CHART_SIZE_CONFIG[size]

  // Use shared hooks for tooltip management
  const { tooltipData, tooltipCallback } = useChartTooltip()

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
        // Tooltip metadata for consistent date/period formatting
        ...createChartTooltipMetadata({
          date: dateObj,
          intervalUnit: interval,
          rangeStart: fromDate,
          rangeEnd: toDate,
          index,
          totalPoints: subscriberData.length,
        }),
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
    <ChartLayout
      title="Active subscribers"
      infoTooltip="The number of customers with active paid subscriptions at each point in time."
      value={formattedSubscriberValue}
      isLoading={isLoading}
      size={size}
    >
      <LineChart
        {...DASHBOARD_LINE_CHART_DEFAULTS}
        data={chartData}
        index="date"
        categories={['subscribers']}
        className={cn('-mb-2 mt-2', config.height)}
        showGridLines={config.showGridLines}
        horizontalMargin={config.chartMargin}
        maxValue={maxValue}
        intervalUnit={interval}
        customTooltip={(props) => (
          <ChartDataTooltip
            {...props}
            valueFormatter={(value) => value.toLocaleString()}
          />
        )}
        valueFormatter={(value: number) => value.toString()}
        tooltipCallback={tooltipCallback}
      />
    </ChartLayout>
  )
}
