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

interface RecurringRevenueChartProps {
  fromDate: Date
  toDate: Date
  productId?: string
  /** Optional controlled interval. When provided, the chart uses this value. */
  interval?: RevenueChartIntervalUnit
}

/**
 * Component for displaying Monthly Recurring Revenue (MRR) data in a chart.
 * Shows the last MRR value by default, individual period value on hover.
 */
export const RecurringRevenueChart = ({
  fromDate,
  toDate,
  productId,
  interval: controlledInterval,
}: RecurringRevenueChartProps) => {
  const { organization } = useAuthenticatedContext()

  // Use shared hooks for tooltip and interval management
  const { tooltipData, tooltipCallback } = useChartTooltip()
  const { interval } = useChartInterval({
    fromDate,
    toDate,
    controlledInterval,
    // No onIntervalChange - MRR chart doesn't have inline selector
  })

  const { data: mrrData, isLoading } =
    trpc.organizations.getMRR.useQuery({
      startDate: fromDate,
      endDate: toDate,
      granularity: interval,
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
        // Use UTC formatting to match PostgreSQL's date_trunc behavior
        date: formatDateUTC(dateObj, interval),
        // Store the ISO date string for the tooltip to use for proper year formatting
        isoDate: dateObj.toISOString(),
        // Store the interval unit for the tooltip to format dates appropriately
        intervalUnit: interval,
        formattedRevenue,
        revenue: Number(item.amount).toFixed(2),
      }
    })
  }, [mrrData, defaultCurrency, interval])

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
    // If the tooltip is active, use the value from the tooltip
    if (firstPayloadValue) {
      return stripeCurrencyAmountToHumanReadableCurrencyAmount(
        defaultCurrency,
        firstPayloadValue
      )
    }
    // If the tooltip is not active, use the last value in the chart
    const amount = mrrData[mrrData.length - 1].amount
    return stripeCurrencyAmountToHumanReadableCurrencyAmount(
      defaultCurrency,
      amount
    )
  }, [mrrData, defaultCurrency, firstPayloadValue])

  const currencyForFormatter = defaultCurrency ?? CurrencyCode.USD

  return (
    <div className="w-full h-full">
      <ChartHeader
        title="Monthly Recurring Revenue"
        infoTooltip="The normalized monthly value of all active recurring subscriptions. Calculated as the sum of subscription amounts adjusted to a monthly rate."
        // No inline selector for MRR chart
        showInlineSelector={false}
      />

      <ChartValueDisplay
        value={formattedMRRValue}
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
              currencyForFormatter,
              value
            )
          }
          yAxisValueFormatter={(value: number) =>
            stripeCurrencyAmountToShortReadableCurrencyAmount(
              currencyForFormatter,
              value
            )
          }
          tooltipCallback={tooltipCallback}
        />
      </ChartBody>
    </div>
  )
}
