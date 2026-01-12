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
import { useAuthenticatedContext } from '@/contexts/authContext'
import { useChartTooltip } from '@/hooks/useChartTooltip'
import { cn } from '@/lib/utils'
import { CurrencyCode, RevenueChartIntervalUnit } from '@/types'
import { formatDateUTC } from '@/utils/chart/dateFormatting'
import { createChartTooltipMetadata } from '@/utils/chart/types'
import {
  stripeCurrencyAmountToHumanReadableCurrencyAmount,
  stripeCurrencyAmountToShortReadableCurrencyAmount,
} from '@/utils/stripe'

interface RecurringRevenueChartProps {
  fromDate: Date
  toDate: Date
  productId?: string
  /** Controlled interval from parent (global selector) */
  interval: RevenueChartIntervalUnit
  /** Chart size variant - 'lg' for primary, 'sm' for secondary */
  size?: ChartSize
}

/**
 * Component for displaying Monthly Recurring Revenue (MRR) data in a chart.
 * Shows the last MRR value by default, individual period value on hover.
 */
export const RecurringRevenueChart = ({
  fromDate,
  toDate,
  productId,
  interval,
  size = 'lg',
}: RecurringRevenueChartProps) => {
  const { organization } = useAuthenticatedContext()
  const config = CHART_SIZE_CONFIG[size]

  // Use shared hooks for tooltip management
  const { tooltipData, tooltipCallback } = useChartTooltip()

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
    return mrrData.map((item, index) => {
      const formattedRevenue =
        stripeCurrencyAmountToHumanReadableCurrencyAmount(
          defaultCurrency,
          item.amount
        )
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
          totalPoints: mrrData.length,
        }),
        formattedRevenue,
        revenue: Number(item.amount).toFixed(2),
      }
    })
  }, [mrrData, defaultCurrency, interval, fromDate, toDate])

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
    <ChartLayout
      title="Monthly recurring revenue"
      infoTooltip="The normalized monthly value of all active recurring subscriptions. Calculated as the sum of subscription amounts adjusted to a monthly rate."
      value={formattedMRRValue}
      isLoading={isLoading}
      size={size}
    >
      <LineChart
        {...DASHBOARD_LINE_CHART_DEFAULTS}
        data={chartData}
        index="date"
        categories={['revenue']}
        className={cn('mt-3', config.height)}
        showGridLines={config.showGridLines}
        horizontalMargin={config.chartMargin}
        maxValue={maxValue}
        intervalUnit={interval}
        customTooltip={(props) => (
          <ChartDataTooltip
            {...props}
            valueFormatter={(value) =>
              stripeCurrencyAmountToHumanReadableCurrencyAmount(
                currencyForFormatter,
                value
              )
            }
          />
        )}
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
    </ChartLayout>
  )
}
