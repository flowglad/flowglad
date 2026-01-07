import { isValid } from 'date-fns'
import type { TooltipCallbackProps } from '@/components/charts/AreaChart'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { cn } from '@/lib/utils'
import { RevenueChartIntervalUnit } from '@/types'
import {
  MONTH_NAMES_FULL,
  MONTH_NAMES_SHORT,
} from '@/utils/chart/dateFormatting'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import ErrorBoundary from './ErrorBoundary'

/**
 * Formats a UTC date without timezone conversion for tooltip display.
 */
function formatDateUTC(
  date: Date,
  pattern: 'HH:mm' | 'd MMM, yyyy' | 'MMMM yyyy'
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
      return `${day} ${MONTH_NAMES_SHORT[month]}, ${year}`
    case 'MMMM yyyy':
      return `${MONTH_NAMES_FULL[month]} ${year}`
    default:
      return `${day} ${MONTH_NAMES_SHORT[month]}, ${year}`
  }
}

/**
 * Adds hours to a UTC date and returns a new date.
 */
function addHoursUTC(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

/**
 * Adds days to a UTC date and returns a new date.
 */
function addDaysUTC(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

/**
 * Formats a date for the tooltip based on the interval unit using UTC.
 * - Hour: "10:00 - 11:00, 21 Oct, 2025" (hour range first, then date)
 * - Week: "12 Oct, 2025 - 18 Oct, 2025" (week range)
 * - Day: "21 Oct, 2025"
 * - Month/Year: "October 2025"
 */
function formatDateForInterval(
  date: Date,
  intervalUnit?: RevenueChartIntervalUnit
): string {
  if (intervalUnit === RevenueChartIntervalUnit.Hour) {
    const hourStart = date
    const hourEnd = addHoursUTC(hourStart, 1)
    return `${formatDateUTC(hourStart, 'HH:mm')} - ${formatDateUTC(hourEnd, 'HH:mm')}, ${formatDateUTC(hourStart, 'd MMM, yyyy')}`
  }
  if (intervalUnit === RevenueChartIntervalUnit.Week) {
    const weekStart = date
    const weekEnd = addDaysUTC(weekStart, 6)
    return `${formatDateUTC(weekStart, 'd MMM, yyyy')} - ${formatDateUTC(weekEnd, 'd MMM, yyyy')}`
  }
  if (intervalUnit === RevenueChartIntervalUnit.Day) {
    return formatDateUTC(date, 'd MMM, yyyy')
  }
  return formatDateUTC(date, 'MMMM yyyy')
}

/**
 * Formats a date label for the tooltip.
 * Uses the ISO date string if available, otherwise attempts to parse the label.
 * Formats based on interval unit:
 * - Hour: "10:00 - 11:00, 21 Oct, 2025" (hour range first, then date)
 * - Week: "12 Oct, 2025 - 18 Oct, 2025" (week range)
 * - Day: "21 Oct, 2025"
 * - Month/Year: "October 2025"
 * Falls back to the original label if parsing fails.
 */
function DateLabel({
  label,
  isoDate,
  intervalUnit,
}: {
  label: string
  isoDate?: string
  intervalUnit?: RevenueChartIntervalUnit
}) {
  try {
    // Prefer isoDate if available, as it contains the full date with year
    const dateString = isoDate ?? label
    const date = new Date(dateString)
    if (isValid(date)) {
      return <span>{formatDateForInterval(date, intervalUnit)}</span>
    }
    return <span>{label}</span>
  } catch {
    return <span>{label}</span>
  }
}

function InnerRevenueTooltip({
  active,
  payload,
  label,
}: TooltipCallbackProps) {
  const { organization } = useAuthenticatedContext()
  if (!active || !payload?.[0] || !organization) {
    return null
  }
  const value = payload[0].value as number
  const formattedValue =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      organization.defaultCurrency,
      value
    )
  // Extract the ISO date from the payload data for proper year formatting
  const isoDate = payload[0].payload?.isoDate as string | undefined
  // Extract the interval unit from the payload data for proper date formatting
  const intervalUnit = payload[0].payload?.intervalUnit as
    | RevenueChartIntervalUnit
    | undefined
  return (
    <div
      className={cn(
        'bg-popover flex flex-col gap-2 p-2 rounded border border-border',
        'shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]'
      )}
    >
      <p className="text-base font-medium text-foreground tracking-tight leading-none">
        {formattedValue}
      </p>
      <p className="text-sm text-muted-foreground tracking-tight leading-5">
        <ErrorBoundary fallback={<span>{label}</span>}>
          <DateLabel
            label={label}
            isoDate={isoDate}
            intervalUnit={intervalUnit}
          />
        </ErrorBoundary>
      </p>
    </div>
  )
}

export function RevenueTooltip(props: TooltipCallbackProps) {
  return (
    <ErrorBoundary fallback={<div>Error</div>}>
      <InnerRevenueTooltip {...props} />
    </ErrorBoundary>
  )
}
