'use client'

import { isValid } from 'date-fns'
import type { TooltipProps } from '@/components/charts'
import ErrorBoundary from '@/components/ErrorBoundary'
import { cn } from '@/lib/utils'
import { RevenueChartIntervalUnit } from '@/types'
import {
  calculateActualPeriodBoundary,
  MONTH_NAMES_SHORT,
} from '@/utils/chart/dateFormatting'
import type { ChartTooltipMetadata } from '@/utils/chart/types'

/**
 * Formats a UTC date without timezone conversion for tooltip display.
 */
function formatDateUTC(
  date: Date,
  pattern: 'HH:mm' | 'd MMM, yyyy'
): string {
  const day = date.getUTCDate()
  const month = date.getUTCMonth()
  const year = date.getUTCFullYear()
  const hours = date.getUTCHours().toString().padStart(2, '0')
  const minutes = date.getUTCMinutes().toString().padStart(2, '0')

  switch (pattern) {
    case 'HH:mm':
      return `${hours}:${minutes}`
    case 'd MMM, yyyy':
    default:
      return `${day} ${MONTH_NAMES_SHORT[month]}, ${year}`
  }
}

/**
 * Formats a period boundary for display in the tooltip.
 * Shows date ranges that match LemonSqueezy's style:
 * - Hour: "10:00 - 11:00, 21 Oct, 2025"
 * - Day: "21 Oct, 2025"
 * - Week: "12 Oct, 2025 - 18 Oct, 2025"
 * - Month: "1 Feb, 2025 - 28 Feb, 2025"
 *
 * Handles partial periods at range boundaries:
 * - First point: "8 Jan, 2025 - 31 Jan, 2025" (if range starts Jan 8)
 * - Last point: "1 Jan, 2026 - 8 Jan, 2026" (if today is Jan 8)
 */
function formatPeriodForTooltip(
  periodStart: Date,
  intervalUnit: RevenueChartIntervalUnit,
  rangeStart: Date,
  rangeEnd: Date,
  isFirstPoint: boolean,
  isLastPoint: boolean
): string {
  const { start, end } = calculateActualPeriodBoundary(
    periodStart,
    intervalUnit,
    rangeStart,
    rangeEnd,
    isFirstPoint,
    isLastPoint
  )

  switch (intervalUnit) {
    case RevenueChartIntervalUnit.Hour: {
      // "10:00 - 11:00, 21 Oct, 2025"
      return `${formatDateUTC(start, 'HH:mm')} - ${formatDateUTC(end, 'HH:mm')}, ${formatDateUTC(start, 'd MMM, yyyy')}`
    }
    case RevenueChartIntervalUnit.Day: {
      // Single day: "21 Oct, 2025"
      return formatDateUTC(start, 'd MMM, yyyy')
    }
    case RevenueChartIntervalUnit.Week:
    case RevenueChartIntervalUnit.Month:
    case RevenueChartIntervalUnit.Year:
    default: {
      // Date range: "1 Feb, 2025 - 28 Feb, 2025"
      return `${formatDateUTC(start, 'd MMM, yyyy')} - ${formatDateUTC(end, 'd MMM, yyyy')}`
    }
  }
}

/**
 * Formats a date label for the tooltip using period boundary calculations.
 * Handles partial periods at the start/end of the user's selected range.
 */
function DateLabel({
  label,
  isoDate,
  intervalUnit,
  rangeStart,
  rangeEnd,
  isFirstPoint,
  isLastPoint,
}: {
  label?: string
  isoDate?: string
  intervalUnit?: RevenueChartIntervalUnit
  rangeStart?: string
  rangeEnd?: string
  isFirstPoint?: boolean
  isLastPoint?: boolean
}) {
  try {
    // Prefer isoDate if available, as it contains the full date with year
    const dateString = isoDate ?? label ?? ''
    const date = new Date(dateString)

    if (!isValid(date)) {
      return <span>{label ?? ''}</span>
    }

    // If we have full metadata, use period boundary calculation
    if (
      intervalUnit &&
      rangeStart &&
      rangeEnd &&
      isFirstPoint !== undefined &&
      isLastPoint !== undefined
    ) {
      return (
        <span>
          {formatPeriodForTooltip(
            date,
            intervalUnit,
            new Date(rangeStart),
            new Date(rangeEnd),
            isFirstPoint,
            isLastPoint
          )}
        </span>
      )
    }

    // Fallback for data without full metadata (backwards compatibility)
    return (
      <span>
        {formatPeriodForTooltip(
          date,
          intervalUnit ?? RevenueChartIntervalUnit.Day,
          date,
          date,
          false,
          false
        )}
      </span>
    )
  } catch {
    return <span>{label ?? ''}</span>
  }
}

interface ChartDataTooltipProps extends TooltipProps {
  /** Function to format the numeric value for display */
  valueFormatter: (value: number) => string
}

/**
 * Unified chart data tooltip component.
 * Displays a formatted value on top with a date/period label below.
 * Used across all dashboard charts for consistent styling.
 *
 * @example
 * // For currency values
 * <LineChart
 *   customTooltip={(props) => (
 *     <ChartDataTooltip
 *       {...props}
 *       valueFormatter={(v) => formatCurrency(currency, v)}
 *     />
 *   )}
 * />
 *
 * @example
 * // For count values
 * <LineChart
 *   customTooltip={(props) => (
 *     <ChartDataTooltip
 *       {...props}
 *       valueFormatter={(v) => v.toLocaleString()}
 *     />
 *   )}
 * />
 */
export function ChartDataTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: ChartDataTooltipProps) {
  if (!active || !payload?.[0]) {
    return null
  }

  const value = payload[0].value as number
  const formattedValue = valueFormatter(value)

  // Extract tooltip metadata from payload
  const payloadData = payload[0].payload as
    | Partial<ChartTooltipMetadata>
    | undefined
  const isoDate = payloadData?.isoDate
  const intervalUnit = payloadData?.intervalUnit
  const rangeStart = payloadData?.rangeStart
  const rangeEnd = payloadData?.rangeEnd
  const isFirstPoint = payloadData?.isFirstPoint
  const isLastPoint = payloadData?.isLastPoint

  return (
    <ErrorBoundary fallback={<div>Error</div>}>
      <div
        className={cn(
          'bg-popover flex flex-col gap-2 p-3 rounded-sm border border-border',
          'shadow-realistic-sm'
        )}
      >
        <p className="text-base font-medium text-foreground tracking-tight leading-none">
          {formattedValue}
        </p>
        <p className="text-sm text-muted-foreground tracking-tight leading-5">
          <DateLabel
            label={label}
            isoDate={isoDate}
            intervalUnit={intervalUnit}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            isFirstPoint={isFirstPoint}
            isLastPoint={isLastPoint}
          />
        </p>
      </div>
    </ErrorBoundary>
  )
}
