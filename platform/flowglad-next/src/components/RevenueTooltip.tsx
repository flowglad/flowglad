import { format, isValid } from 'date-fns'
import type { TooltipCallbackProps } from '@/components/charts/AreaChart'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { cn } from '@/lib/utils'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import ErrorBoundary from './ErrorBoundary'

/**
 * Formats a date label for the tooltip.
 * Uses the ISO date string if available, otherwise attempts to parse the label.
 * Formats as "MMMM yyyy" (e.g., "October 2025").
 * Falls back to the original label if parsing fails.
 */
function DateLabel({
  label,
  isoDate,
}: {
  label: string
  isoDate?: string
}) {
  try {
    // Prefer isoDate if available, as it contains the full date with year
    const dateString = isoDate ?? label
    const date = new Date(dateString)
    if (isValid(date)) {
      return <span>{format(date, 'MMMM yyyy')}</span>
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
          <DateLabel label={label} isoDate={isoDate} />
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
