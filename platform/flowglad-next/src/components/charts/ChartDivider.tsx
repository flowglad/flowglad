import { cn } from '@/lib/utils'

interface ChartDividerProps {
  className?: string
}

/**
 * Dashed border divider between chart sections.
 * Used to visually separate primary and secondary chart areas.
 *
 * @example
 * <RevenueChart size="lg" {...props} />
 * <ChartDivider />
 * <ChartGrid>
 *   <RecurringRevenueChart size="sm" {...props} />
 *   <ActiveSubscribersChart size="sm" {...props} />
 * </ChartGrid>
 */
export function ChartDivider({ className }: ChartDividerProps) {
  return (
    <div
      className={cn(
        'w-full border-t border-dashed border-border',
        className
      )}
    />
  )
}
