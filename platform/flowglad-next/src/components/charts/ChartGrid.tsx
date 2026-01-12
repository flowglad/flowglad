import React from 'react'
import { cn } from '@/lib/utils'

interface ChartGridProps {
  children: React.ReactNode
  className?: string
  /** Show dashed dividers between grid items. Default: true */
  showDividers?: boolean
}

/**
 * Responsive grid layout for secondary dashboard charts.
 * Uses edge-to-edge divider pattern: no gap + cell padding + borders.
 *
 * Features:
 * - Vertical dashed divider between columns (border on cells)
 * - Horizontal dashed dividers between rows (border on cells)
 * - On mobile, horizontal dividers appear between stacked items
 * - Dividers span full width/height naturally (no absolute positioning)
 *
 * Layout pattern (edge-to-edge dividers):
 * - Grid has NO gap (cells touch each other)
 * - Each cell has padding for visual spacing
 * - Borders on cells create the dividers
 *
 * @example
 * <ChartGrid>
 *   <RecurringRevenueChart size="sm" {...props} />
 *   <ActiveSubscribersChart size="sm" {...props} />
 * </ChartGrid>
 *
 * @example
 * // Without dividers
 * <ChartGrid showDividers={false}>
 *   <Chart1 />
 *   <Chart2 />
 * </ChartGrid>
 */
export function ChartGrid({
  children,
  className,
  showDividers = true,
}: ChartGridProps) {
  const childArray = React.Children.toArray(children)
  const childCount = childArray.length

  // Calculate number of rows for desktop (2 columns)
  const rowCount = Math.ceil(childCount / 2)

  if (!showDividers) {
    return (
      <div
        className={cn(
          'grid gap-6',
          'grid-cols-1 md:grid-cols-2',
          className
        )}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      className={cn(
        // Grid with NO gap - cells touch, dividers are borders
        'grid grid-cols-1 md:grid-cols-2',
        className
      )}
    >
      {childArray.map((child, index) => {
        // Determine cell position for border logic
        const isLeftColumn = index % 2 === 0
        const rowIndex = Math.floor(index / 2)
        const isLastRow = rowIndex === rowCount - 1
        const isLastItem = index === childCount - 1
        // For odd number of items, the last item is alone in left column
        const isAloneInLastRow = childCount % 2 === 1 && isLastItem

        return (
          <div
            key={index}
            className={cn(
              // Cell padding for spacing (matches small chart internal rhythm)
              'py-6',

              // === DESKTOP BORDERS (md+) ===
              // Vertical divider: right border on left column items (except if alone in last row)
              isLeftColumn &&
                !isAloneInLastRow &&
                'md:border-r md:border-dashed md:border-border',

              // Horizontal divider: bottom border on all items except last row
              !isLastRow &&
                'md:border-b md:border-dashed md:border-border',

              // === MOBILE BORDERS (below md) ===
              // Horizontal divider: bottom border on all items except last
              !isLastItem &&
                'border-b border-dashed border-border md:border-b-0',
              // Re-apply desktop bottom border (was removed by mobile rule above)
              !isLastRow && 'md:border-b'
            )}
          >
            {child}
          </div>
        )
      })}
    </div>
  )
}
