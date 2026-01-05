'use client'
import { differenceInHours, format } from 'date-fns'
import React from 'react'
import { trpc } from '@/app/_trpc/client'
import type { TooltipCallbackProps } from '@/components/charts/AreaChart'
import { RevenueTooltip } from '@/components/RevenueTooltip'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { RevenueChartIntervalUnit } from '@/types'
import core from '@/utils/core'
import {
  stripeCurrencyAmountToHumanReadableCurrencyAmount,
  stripeCurrencyAmountToShortReadableCurrencyAmount,
} from '@/utils/stripe'
import { LineChart } from './charts/LineChart'
import { ChartInfoTooltip } from './ui/chart-info-tooltip'
import { Skeleton } from './ui/skeleton'

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
 * Computes the best default interval based on the date range.
 * Based on preset expectations:
 * - Last 3/6/12 months → Monthly (>= 60 days)
 * - Last 7/30 days → Daily (>= 1 day but < 60 days)
 * - Today → Hourly (< 1 day)
 */
function getDefaultInterval(
  fromDate: Date,
  toDate: Date
): RevenueChartIntervalUnit {
  const timespanInHours = differenceInHours(toDate, fromDate)

  // 2+ months (60 days = 1440 hours): Monthly
  // Covers Last 3 months, Last 6 months, Last 12 months
  if (timespanInHours >= 24 * 60) {
    return RevenueChartIntervalUnit.Month
  }

  // 1+ day (24 hours) but less than 2 months: Daily
  // Covers Last 7 days, Last 30 days
  if (timespanInHours >= 24) {
    return RevenueChartIntervalUnit.Day
  }

  // Less than 1 day (including "Today"): Hourly
  return RevenueChartIntervalUnit.Hour
}

/**
 * Component for displaying Monthly Recurring Revenue (MRR) data in a chart
 */
export const RecurringRevenueChart = ({
  fromDate,
  toDate,
  productId,
}: {
  fromDate: Date
  toDate: Date
  productId?: string
}) => {
  const { organization } = useAuthenticatedContext()

  // Compute the best default interval based on available options
  const defaultInterval = React.useMemo(
    () => getDefaultInterval(fromDate, toDate),
    [fromDate, toDate]
  )

  const [interval, setInterval] =
    React.useState<RevenueChartIntervalUnit>(defaultInterval)

  const timespanInHours = differenceInHours(toDate, fromDate)

  // Update interval if current selection becomes invalid due to date range change
  React.useEffect(() => {
    const isCurrentIntervalInvalid =
      interval !== RevenueChartIntervalUnit.Hour &&
      timespanInHours < minimumUnitInHours[interval]

    if (isCurrentIntervalInvalid) {
      setInterval(getDefaultInterval(fromDate, toDate))
    }
  }, [timespanInHours, interval, fromDate, toDate])

  const { data: mrrData, isLoading } =
    trpc.organizations.getMRR.useQuery({
      startDate: fromDate,
      endDate: toDate,
      granularity: interval,
    })
  const [tooltipData, setTooltipData] =
    React.useState<TooltipCallbackProps | null>(null)

  // Use useRef to store tooltip data during render, then update state after render
  const pendingTooltipData =
    React.useRef<TooltipCallbackProps | null>(null)

  // Use useEffect to safely update tooltip state after render

  // FIXME(FG-384): Fix this warning:
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (pendingTooltipData.current !== null) {
      setTooltipData(pendingTooltipData.current)
      pendingTooltipData.current = null
    }
  })
  const defaultCurrency = organization?.defaultCurrency
  const chartData = React.useMemo(() => {
    if (!mrrData) return []
    if (!defaultCurrency) return []
    return mrrData.map((item) => {
      const formattedRevenue =
        stripeCurrencyAmountToHumanReadableCurrencyAmount(
          defaultCurrency,
          item.amount
        )
      const dateObj = new Date(item.month)
      return {
        date: format(dateObj, 'd MMM'),
        // Store the ISO date string for the tooltip to use for proper year formatting
        isoDate: dateObj.toISOString(),
        formattedRevenue,
        revenue: Number(item.amount).toFixed(2),
      }
    })
  }, [mrrData, defaultCurrency])

  // Calculate max value for better visualization,
  // fitting the y axis to the max value in the data
  const maxValue = React.useMemo(() => {
    if (!mrrData?.length) return 0
    const max = Math.max(...mrrData.map((item) => item.amount))
    return max
  }, [mrrData])
  const firstPayloadValue = tooltipData?.payload?.[0]?.value
  const formattedMRRValue = React.useMemo(() => {
    if (!mrrData?.length || !defaultCurrency) {
      return '0.00'
    }
    /**
     * If the tooltip is active, we use the value from the tooltip
     */
    if (firstPayloadValue) {
      return stripeCurrencyAmountToHumanReadableCurrencyAmount(
        defaultCurrency,
        firstPayloadValue
      )
    }
    /**
     * If the tooltip is not active, we use the last value in the chart
     */
    const amount = mrrData[mrrData.length - 1].amount
    return stripeCurrencyAmountToHumanReadableCurrencyAmount(
      defaultCurrency,
      amount
    )
  }, [mrrData, defaultCurrency, firstPayloadValue])

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
      <div className="flex flex-row gap-2 justify-between px-4">
        <div className="text-foreground w-fit flex items-center flex-row">
          <p className="whitespace-nowrap">
            Monthly Recurring Revenue
          </p>
          <ChartInfoTooltip content="The normalized monthly value of all active recurring subscriptions. Calculated as the sum of subscription amounts adjusted to a monthly rate." />
        </div>
      </div>

      <div className="px-4 mt-1">
        {isLoading ? (
          <Skeleton className="w-36 h-12" />
        ) : (
          <p className="text-xl font-semibold text-foreground">
            {formattedMRRValue}
          </p>
        )}
      </div>
      {isLoading ? (
        <div className="-mb-2 mt-2 flex items-center">
          <Skeleton className="h-80 w-full" />
        </div>
      ) : (
        <LineChart
          data={chartData}
          index="date"
          categories={['revenue']}
          className="-mb-2 mt-2"
          colors={['foreground']}
          fill="gradient"
          customTooltip={RevenueTooltip}
          maxValue={maxValue}
          autoMinValue={false}
          minValue={0}
          startEndOnly={true}
          startEndOnlyYAxis={true}
          showYAxis={false}
          valueFormatter={(value: number) =>
            stripeCurrencyAmountToHumanReadableCurrencyAmount(
              organization?.defaultCurrency!,
              value
            )
          }
          yAxisValueFormatter={(value: number) =>
            stripeCurrencyAmountToShortReadableCurrencyAmount(
              organization?.defaultCurrency!,
              value
            )
          }
          tooltipCallback={(props: any) => {
            // Store tooltip data in ref during render, useEffect will update state safely
            if (props.active) {
              // Only update if the data is different to prevent unnecessary re-renders
              if (tooltipData?.label !== props.label) {
                pendingTooltipData.current = props
              }
            } else {
              pendingTooltipData.current = null
            }
          }}
        />
      )}
    </div>
  )
}
