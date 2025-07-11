'use client'
import { differenceInHours } from 'date-fns'
import React from 'react'
import { TooltipCallbackProps } from '@/components/charts/AreaChart'
import { RevenueTooltip } from '@/components/RevenueTooltip'
import { RevenueChartIntervalUnit } from '@/types'
import { trpc } from '@/app/_trpc/client'
import { FallbackSkeleton, Skeleton } from './ion/Skeleton'
import { LineChart } from './charts/LineChart'
import core from '@/utils/core'
import { twMerge } from 'tailwind-merge'
import clsx from 'clsx'
import ErrorBoundary from './ErrorBoundary'
import {
  AvailableChartColorsKeys,
  getColorClassName,
} from '@/utils/chartStyles'

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

// Define a new TooltipDateLabel component for the new tooltip
function TooltipDateLabel({ label }: { label: string }) {
  try {
    const date = new Date(label)
    const formattedDate = core.formatDate(date)
    return <div>{formattedDate}</div>
  } catch (error) {
    // Fallback if label is not a valid date string
    return <div>{label}</div>
  }
}

// Define the new SubscriberCountTooltip component
const SubscriberCountTooltip = ({
  active,
  payload,
  label,
}: TooltipCallbackProps) => {
  if (!active || !payload?.[0] || !label) {
    return null
  }
  const value = payload[0].value as number
  const color = payload[0].color

  return (
    <ErrorBoundary fallback={<div>Error</div>}>
      <div
        className={twMerge(
          clsx(
            'bg-[#282828] flex flex-col gap-2 p-4 rounded-radius-sm border border-stroke-subtle shadow-[3px_4px_17px_0_rgba(1.35,5.12,17,0.2)]'
          )
        )}
      >
        <div className="flex justify-between items-center gap-2 text-xs font-medium text-on-primary-hover">
          {color && (
            <div className="text-left">
              <div
                className={core.cn(
                  // Use getColorClassName to derive the correct background class
                  color
                    ? getColorClassName(
                        color as AvailableChartColorsKeys,
                        'bg'
                      )
                    : 'bg-gray-500',
                  'w-2 h-2 rounded-full'
                )}
                style={{ width: '10px', height: '10px' }}
              />
            </div>
          )}
          <TooltipDateLabel label={label as string} />
          <div className="text-right">{value.toString()}</div>
        </div>
      </div>
    </ErrorBoundary>
  )
}

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
  const firstPayloadValue = tooltipData?.payload?.[0]?.value
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
    if (firstPayloadValue) {
      return firstPayloadValue.toString()
    }
    /**
     * If the tooltip is not active, we use the last value in the chart
     */
    const count = subscriberData[subscriberData.length - 1].count
    return count.toString()
  }, [subscriberData, firstPayloadValue])

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
          className="w-36 h-12"
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
        <div className="-mb-2 mt-8 w-full flex items-center justify-center">
          <Skeleton className="h-80 w-full" />
        </div>
      ) : (
        <LineChart
          data={chartData}
          index="date"
          categories={['subscribers']}
          className="-mb-2 mt-8"
          colors={['amber']}
          customTooltip={SubscriberCountTooltip}
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
