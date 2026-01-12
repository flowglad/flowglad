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

interface RevenueChartProps {
  fromDate: Date
  toDate: Date
  productId?: string
  /** Controlled interval from parent (global selector) */
  interval: RevenueChartIntervalUnit
  /** Chart size variant - 'lg' for primary, 'sm' for secondary */
  size?: ChartSize
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
  interval,
  size = 'lg',
}: RevenueChartProps) {
  const { organization } = useAuthenticatedContext()
  const config = CHART_SIZE_CONFIG[size]

  // Use shared hooks for tooltip management
  const { tooltipData, tooltipCallback } = useChartTooltip()

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
    return revenueData.map((item, index) => {
      const formattedRevenue =
        stripeCurrencyAmountToHumanReadableCurrencyAmount(
          organization?.defaultCurrency,
          item.revenue
        )
      const dateObj = new Date(item.date)
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
          totalPoints: revenueData.length,
        }),
        formattedRevenue,
        revenue: Number(item.revenue).toFixed(2),
      }
    })
  }, [
    revenueData,
    organization?.defaultCurrency,
    interval,
    fromDate,
    toDate,
  ])

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
    <ChartLayout
      title="All revenue"
      infoTooltip="Total revenue collected from all payments in the selected period, including one-time purchases and subscription payments."
      value={formattedRevenueValue}
      isLoading={isLoading}
      size={size}
    >
      <LineChart
        {...DASHBOARD_LINE_CHART_DEFAULTS}
        data={chartData}
        index="date"
        categories={['revenue']}
        className={cn('-mb-2 mt-2', config.height)}
        showGridLines={config.showGridLines}
        maxValue={maxValue}
        intervalUnit={interval}
        customTooltip={(props) => (
          <ChartDataTooltip
            {...props}
            valueFormatter={(value) =>
              stripeCurrencyAmountToHumanReadableCurrencyAmount(
                defaultCurrency,
                value
              )
            }
          />
        )}
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
    </ChartLayout>
  )
}
