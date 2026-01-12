import { cn } from '@/lib/utils'

interface ChartGridProps {
  children: React.ReactNode
  className?: string
}

/**
 * Responsive grid layout for secondary dashboard charts.
 * Displays 2 columns on desktop, collapses to 1 column on mobile/tablet.
 *
 * Each child spans half the width on desktop. If there's an odd number
 * of charts, the last chart will be alone in its row but still half-width.
 *
 * @example
 * <ChartGrid>
 *   <RecurringRevenueChart size="sm" {...props} />
 *   <ActiveSubscribersChart size="sm" {...props} />
 *   <RefundsChart size="sm" {...props} />  // Half-width, alone in row
 * </ChartGrid>
 */
export function ChartGrid({ children, className }: ChartGridProps) {
  return (
    <div
      className={cn(
        'grid gap-6',
        // Single column on mobile, 2 columns on md+ screens
        'grid-cols-1 md:grid-cols-2',
        className
      )}
    >
      {children}
    </div>
  )
}
