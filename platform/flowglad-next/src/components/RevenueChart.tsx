'use client'
import React from 'react'
import { trpc } from '@/app/_trpc/client'
import {
  LineChart,
  type TooltipProps as TooltipCallbackProps,
} from '@/components/charts/LineChart'
import { RevenueTooltip } from '@/components/RevenueTooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { RevenueChartIntervalUnit } from '@/types'
import {
  getDefaultInterval,
  getIntervalConfig,
  intervalNounLabels,
} from '@/utils/chartIntervalUtils'
import {
  stripeCurrencyAmountToHumanReadableCurrencyAmount,
  stripeCurrencyAmountToShortReadableCurrencyAmount,
} from '@/utils/stripe'
import { ChartInfoTooltip } from './ui/chart-info-tooltip'
import { Skeleton } from './ui/skeleton'

const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * Formats a UTC date without timezone conversion.
 * This ensures dates generated in UTC (like from PostgreSQL date_trunc)
 * display correctly regardless of the user's local timezone.
 */
function formatDateUTC(
  date: Date,
  granularity: RevenueChartIntervalUnit
): string {
  const day = date.getUTCDate()
  const month = MONTH_NAMES_SHORT[date.getUTCMonth()]
  const year = date.getUTCFullYear()
  const hours = date.getUTCHours().toString().padStart(2, '0')
  const minutes = date.getUTCMinutes().toString().padStart(2, '0')

  switch (granularity) {
    case RevenueChartIntervalUnit.Year:
      return `${year}`
    case RevenueChartIntervalUnit.Hour:
      return `${day} ${month} ${hours}:${minutes}`
    case RevenueChartIntervalUnit.Month:
    case RevenueChartIntervalUnit.Week:
    case RevenueChartIntervalUnit.Day:
    default:
      return `${day} ${month}`
  }
}

/**
 * NOTE: this component has a weird bug (that seems to ship with Tremor?)
 * where the chart lines will show up underneath the X axis if there's a single point above zero.
 * This seems to be an issue with how Tremor handles single > 0 point data sets.
 * It's not worth fixing.
 *
 * @param interval - Optional controlled interval. When provided, the chart uses this value
 *                   and hides its inline interval selector.
 * @param onIntervalChange - Optional callback for controlled mode interval changes.
 */
export function RevenueChart({
  fromDate,
  toDate,
  productId,
  interval: controlledInterval,
  onIntervalChange,
}: {
  fromDate: Date
  toDate: Date
  productId?: string
  interval?: RevenueChartIntervalUnit
  onIntervalChange?: (interval: RevenueChartIntervalUnit) => void
}) {
  const { organization } = useAuthenticatedContext()

  // Compute the best default interval based on available options
  const defaultInterval = React.useMemo(
    () => getDefaultInterval(fromDate, toDate),
    [fromDate, toDate]
  )

  const [internalInterval, setInternalInterval] =
    React.useState<RevenueChartIntervalUnit>(defaultInterval)

  // Use controlled value if provided, otherwise internal
  const interval = controlledInterval ?? internalInterval
  const handleIntervalChange = onIntervalChange ?? setInternalInterval

  // Hide inline selector when controlled externally
  const showInlineSelector = controlledInterval === undefined

  // Update interval if current selection becomes invalid due to date range change
  React.useEffect(() => {
    // Only auto-correct for uncontrolled mode
    if (controlledInterval !== undefined) return

    const config = getIntervalConfig(fromDate, toDate)
    const isCurrentIntervalInvalid =
      !config.options.includes(internalInterval)

    if (isCurrentIntervalInvalid) {
      setInternalInterval(config.default)
    }
  }, [fromDate, toDate, internalInterval, controlledInterval])

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
  // Use useRef to store tooltip data during render, then update state after render

  // FIXME(FG-384): Fix this warning:
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const intervalOptions = React.useMemo(() => {
    const config = getIntervalConfig(fromDate, toDate)
    return config.options.map((opt) => ({
      label: intervalNounLabels[opt],
      value: opt,
    }))
  }, [fromDate, toDate])
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
        <div className="text-foreground w-fit flex items-center flex-row gap-0.5">
          <p className="whitespace-nowrap">Revenue</p>
          {showInlineSelector && (
            <Select
              value={interval}
              onValueChange={(value) =>
                handleIntervalChange(
                  value as RevenueChartIntervalUnit
                )
              }
            >
              <SelectTrigger className="border-none bg-transparent px-1 text-muted-foreground shadow-none h-auto py-0 gap-0 text-base">
                <span className="text-muted-foreground">
                  by&nbsp;
                </span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {intervalOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <ChartInfoTooltip content="Total revenue collected from all payments in the selected period, including one-time purchases and subscription payments." />
        </div>
      </div>

      <div className="px-4 mt-1">
        {isLoading ? (
          <Skeleton className="w-36 h-7" />
        ) : (
          <p className="text-xl font-semibold text-foreground">
            {formattedRevenueValue}
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
          // startEndOnly={true}
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
