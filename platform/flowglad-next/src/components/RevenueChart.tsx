'use client'

import React from 'react'
import { trpc } from '@/app/_trpc/client'
import {
  ChartBody,
  ChartHeader,
  ChartValueDisplay,
  LineChart,
} from '@/components/charts'
import { RevenueTooltip } from '@/components/RevenueTooltip'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { useChartInterval } from '@/hooks/useChartInterval'
import { useChartTooltip } from '@/hooks/useChartTooltip'
import { CurrencyCode, RevenueChartIntervalUnit } from '@/types'
import { formatDateUTC } from '@/utils/chart/dateFormatting'
import {
  stripeCurrencyAmountToHumanReadableCurrencyAmount,
  stripeCurrencyAmountToShortReadableCurrencyAmount,
} from '@/utils/stripe'

interface RevenueChartProps {
  fromDate: Date
  toDate: Date
  productId?: string
  /** Optional controlled interval. When provided, the chart uses this value
   *  and hides its inline interval selector. */
  interval?: RevenueChartIntervalUnit
  /** Optional callback for controlled mode interval changes. */
  onIntervalChange?: (interval: RevenueChartIntervalUnit) => void
}

/**
 * Revenue chart component displaying total collected revenue over time.
 * Shows cumulative revenue by default, individual period revenue on hover.
 *
 * NOTE: this component has a weird bug (that seems to ship with Tremor?)
 * where the chart lines will show up underneath the X axis if there's a single point above zero.
 * This seems to be an issue with how Tremor handles single > 0 point data sets.
 * It's not worth fixing.
 */
export function RevenueChart({
  fromDate,
  toDate,
  productId,
  interval: controlledInterval,
  onIntervalChange,
}: RevenueChartProps) {
  const { organization } = useAuthenticatedContext()

  // Use shared hooks for tooltip and interval management
  const { tooltipData, tooltipCallback } = useChartTooltip()
  const { interval, handleIntervalChange, showInlineSelector } =
    useChartInterval({
      fromDate,
      toDate,
      controlledInterval,
      onIntervalChange,
    })

  const { data: revenueData, isLoading } =
    trpc.organizations.getRevenue.useQuery({
      organizationId: organization?.id ?? '',
      revenueChartIntervalUnit: interval,
      fromDate,
      toDate,
      productId,
    })

  const chartData = React.useMemo(() => {
    if (!revenueData) return []
    if (!organization?.defaultCurrency) return []
    return revenueData.map((item) => {
      const formattedRevenue =
        stripeCurrencyAmountToHumanReadableCurrencyAmount(
          organization?.defaultCurrency,
          item.revenue
        )
      const dateObj = new Date(item.date)
      return {
        // Use UTC formatting to match PostgreSQL's date_trunc behavior
        date: formatDateUTC(dateObj, interval),
        // Store the ISO date string for the tooltip to use for proper year formatting
        isoDate: dateObj.toISOString(),
        // Store the interval unit for the tooltip to format dates appropriately
        intervalUnit: interval,
        formattedRevenue,
        revenue: Number(item.revenue).toFixed(2),
      }
    })
  }, [revenueData, organization?.defaultCurrency, interval])

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
    // If the tooltip is active, use the value from the tooltip
    if (tooltipData?.payload?.[0]?.value) {
      return stripeCurrencyAmountToHumanReadableCurrencyAmount(
        organization.defaultCurrency,
        tooltipData.payload[0].value
      )
    }
    // If the tooltip is not active, use the cumulative revenue
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

  const defaultCurrency =
    organization?.defaultCurrency ?? CurrencyCode.USD

  return (
    <div className="w-full h-full">
      <ChartHeader
        title="Revenue"
        infoTooltip="Total revenue collected from all payments in the selected period, including one-time purchases and subscription payments."
        showInlineSelector={showInlineSelector}
        interval={interval}
        onIntervalChange={handleIntervalChange}
        fromDate={fromDate}
        toDate={toDate}
      />

      <ChartValueDisplay
        value={formattedRevenueValue}
        isLoading={isLoading}
      />

      <ChartBody isLoading={isLoading}>
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
              defaultCurrency,
              value
            )
          }
          yAxisValueFormatter={(value: number) =>
            stripeCurrencyAmountToShortReadableCurrencyAmount(
              defaultCurrency,
              value
            )
          }
          tooltipCallback={tooltipCallback}
        />
      </ChartBody>
    </div>
  )
}
