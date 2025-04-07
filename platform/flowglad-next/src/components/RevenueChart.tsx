'use client'
import { differenceInHours, isDate } from 'date-fns'
import React from 'react'
import Select from '@/components/ion/Select'
import {
  AreaChart,
  TooltipCallbackProps,
} from '@/components/charts/AreaChart'
import { RevenueTooltip } from '@/components/RevenueTooltip'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { CurrencyCode } from '@/types'
import core from '@/utils/core'
import { RevenueChartIntervalUnit } from '@/types'
import { trpc } from '@/app/_trpc/client'
import { FallbackSkeleton, Skeleton } from './ion/Skeleton'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { LineChart } from './charts/LineChart'

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
 * NOTE: this component has a weird bug (that seems to ship with Tremor?)
 * where the chart lines will show up underneath the X axis if there's a single point above zero.
 * This seems to be an issue with how Tremor handles single > 0 point data sets.
 * It's not worth fixing.
 * @param param0
 * @returns
 */
export function RevenueChart({
  fromDate,
  toDate,
  productId,
}: {
  fromDate: Date
  toDate: Date
  productId?: string
}) {
  const { organization } = useAuthenticatedContext()
  const [interval, setInterval] =
    React.useState<RevenueChartIntervalUnit>(
      RevenueChartIntervalUnit.Day
    )

  const { data: revenueData, isLoading } =
    trpc.organizations.getRevenue.useQuery({
      organizationId: organization?.id ?? '',
      revenueChartIntervalUnit: interval,
      fromDate,
      toDate,
      productId,
    })
  const [tooltipData, setTooltipData] =
    React.useState<TooltipCallbackProps | null>(null)

  const chartData = React.useMemo(() => {
    if (!revenueData) return []
    if (!organization?.defaultCurrency) return []
    return revenueData.map((item) => {
      const formattedRevenue =
        stripeCurrencyAmountToHumanReadableCurrencyAmount(
          organization?.defaultCurrency,
          item.revenue
        )
      return {
        date: item.date.toLocaleDateString(),
        formattedRevenue,
        revenue: Number(item.revenue).toFixed(2),
      }
    })
  }, [revenueData, organization?.defaultCurrency])

  // Calculate max value for better visualization,
  // fitting the y axis to the max value in the data
  const maxValue = React.useMemo(() => {
    if (!revenueData?.length) return 0
    const max = Math.max(...revenueData.map((item) => item.revenue))
    return max
  }, [revenueData])

  const cumulativeRevenueInDecimals = revenueData
    ?.reduce((acc, curr) => acc + curr.revenue, 0)
    .toFixed(2)

  const formattedRevenueValue = React.useMemo(() => {
    if (!revenueData?.length || !organization?.defaultCurrency) {
      return '$0.00'
    }
    /**
     * If the tooltip is active, we use the value from the tooltip
     */
    if (tooltipData?.payload?.[0]?.value) {
      return stripeCurrencyAmountToHumanReadableCurrencyAmount(
        organization.defaultCurrency,
        tooltipData.payload[0].value
      )
    }
    /**
     * If the tooltip is not active, we use the cumulative revenue
     */
    return stripeCurrencyAmountToHumanReadableCurrencyAmount(
      organization.defaultCurrency,
      Number(cumulativeRevenueInDecimals)
    )
  }, [
    revenueData,
    organization?.defaultCurrency,
    tooltipData?.payload,
    cumulativeRevenueInDecimals,
  ])

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
          <p className="whitespace-nowrap">Revenue by</p>
          <Select
            options={intervalOptions}
            triggerClassName="border-none bg-transparent"
            value={interval}
            onValueChange={(value) =>
              setInterval(value as RevenueChartIntervalUnit)
            }
          />
        </div>
        {/* <Button
          iconLeading={<Export size={16} weight={'regular'} />}
          variant="ghost"
          color="primary"
          size="sm"
          onClick={exportOnClickHandler}
        >
          Export
        </Button> */}
      </div>

      <div className="mt-2">
        <FallbackSkeleton
          showSkeleton={isLoading}
          className="w-24 h-6"
        >
          <p className="text-xl font-semibold text-gray-900 dark:text-gray-50">
            {formattedRevenueValue}
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
          categories={['revenue']}
          // startEndOnly={true}
          className="-mb-2 mt-8"
          colors={['amber']}
          customTooltip={RevenueTooltip}
          maxValue={maxValue}
          autoMinValue={false}
          minValue={0}
          startEndOnly={true}
          startEndOnlyYAxis={true}
          valueFormatter={(value: number) =>
            stripeCurrencyAmountToHumanReadableCurrencyAmount(
              organization?.defaultCurrency!,
              value
            )
          }
          yAxisValueFormatter={(value: number) =>
            stripeCurrencyAmountToHumanReadableCurrencyAmount(
              organization?.defaultCurrency!,
              value
            )
          }
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
