'use client'
import { differenceInHours } from 'date-fns'
import React from 'react'
import { TooltipCallbackProps } from '@/components/charts/AreaChart'
import { RevenueTooltip } from '@/components/RevenueTooltip'
import { RevenueChartIntervalUnit } from '@/types'
import { trpc } from '@/app/_trpc/client'
import { FallbackSkeleton, Skeleton } from './ion/Skeleton'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { LineChart } from './charts/LineChart'
import core from '@/utils/core'

/**
 * Two dots make a graph principle: this is the minimum range duration required
 * in hours, required to display a multi-point graph
 */
const minimumUnitInHours: Record<RevenueChartIntervalUnit, number> = {
  [RevenueChartIntervalUnit.Year]: 24 * 365 * 2,
  [RevenueChartIntervalUnit.Month]: 24 * 30 * 2,
  [RevenueChartIntervalUnit.Week]: 24 * 7 * 2,
  [RevenueChartIntervalUnit.Day]: 24 * 2,
  [RevenueChartIntervalUnit.Hour]: 1 * 2,
} as const

/**
 * Component for displaying Active Subscribers data in a chart
 */
export const ActiveSubscribersChart = ({
  fromDate,
  toDate,
  productId,
}: {
  fromDate: Date
  toDate: Date
  productId?: string
}) => {
  const { organization } = useAuthenticatedContext()
  const [interval, setInterval] =
    React.useState<RevenueChartIntervalUnit>(
      RevenueChartIntervalUnit.Month
    )

  const { data: subscriberData, isLoading } =
    trpc.organizations.getActiveSubscribers.useQuery({
      startDate: fromDate,
      endDate: toDate,
      granularity: interval,
    })
  const [tooltipData, setTooltipData] =
    React.useState<TooltipCallbackProps | null>(null)

  const chartData = React.useMemo(() => {
    if (!subscriberData) return []
    return subscriberData.map((item) => {
      return {
        date: item.month.toLocaleDateString(),
        subscribers: item.count,
      }
    })
  }, [subscriberData])

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
    /**
     * If the tooltip is active, we use the value from the tooltip
     */
    if (tooltipData?.payload?.[0]?.value) {
      return tooltipData?.payload?.[0]?.value.toString()
    }
    /**
     * If the tooltip is not active, we use the last value in the chart
     */
    const count = subscriberData[subscriberData.length - 1].count
    return count.toString()
  }, [subscriberData, tooltipData?.payload?.[0]?.value])

  const timespanInHours = differenceInHours(toDate, fromDate)
  const intervalOptions = React.useMemo(() => {
    const options = []

    // Only show years if span is >= 1 year
    if (
      timespanInHours >=
      minimumUnitInHours[RevenueChartIntervalUnit.Year]
    ) {
      options.push({
        label: 'year',
        value: RevenueChartIntervalUnit.Year,
      })
    }

    // Only show months if span is >= 1 month
    if (
      timespanInHours >=
      minimumUnitInHours[RevenueChartIntervalUnit.Month]
    ) {
      options.push({
        label: 'month',
        value: RevenueChartIntervalUnit.Month,
      })
    }

    // Only show weeks if span is >= 1 week
    if (
      timespanInHours >=
      minimumUnitInHours[RevenueChartIntervalUnit.Week]
    ) {
      options.push({
        label: 'week',
        value: RevenueChartIntervalUnit.Week,
      })
    }

    // Always show days and hours
    options.push(
      {
        label: 'day',
        value: RevenueChartIntervalUnit.Day,
      },
      {
        label: 'hour',
        value: RevenueChartIntervalUnit.Hour,
      }
    )

    return options
  }, [timespanInHours])
  const tooltipLabel = tooltipData?.label
  let isTooltipLabelDate: boolean = false
  if (tooltipLabel) {
    try {
      new Date(tooltipLabel as string).toISOString()
      isTooltipLabelDate = true
    } catch {
      isTooltipLabelDate = false
    }
  }
  return (
    <div className="w-full h-full">
      <div className="flex flex-row gap-2 justify-between">
        <div className="text-sm text-gray-700 dark:text-gray-300 w-fit flex items-center flex-row">
          <p className="whitespace-nowrap">Active Subscribers</p>
        </div>
      </div>

      <div className="mt-2">
        <FallbackSkeleton
          showSkeleton={isLoading}
          className="w-24 h-6"
        >
          <p className="text-xl font-semibold text-gray-900 dark:text-gray-50">
            {formattedSubscriberValue}
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {isTooltipLabelDate
              ? core.formatDate(new Date(tooltipLabel as string))
              : core.formatDateRange({ fromDate, toDate })}
          </p>
        </FallbackSkeleton>
      </div>
      {isLoading ? (
        <div className="h-48 pt-4 -mb-2 mt-8 w-full flex items-center justify-center">
          <Skeleton className="h-full w-full" />
        </div>
      ) : (
        <LineChart
          data={chartData}
          index="date"
          categories={['subscribers']}
          className="-mb-2 mt-8"
          colors={['emerald']}
          customTooltip={RevenueTooltip}
          maxValue={maxValue}
          autoMinValue={false}
          minValue={0}
          startEndOnly={true}
          startEndOnlyYAxis={true}
          valueFormatter={(value: number) => value.toString()}
          tooltipCallback={(props: any) => {
            if (props.active) {
              setTooltipData((prev) => {
                if (prev?.label === props.label) return prev
                return props
              })
            } else {
              setTooltipData(null)
            }
          }}
        />
      )}
    </div>
  )
}
