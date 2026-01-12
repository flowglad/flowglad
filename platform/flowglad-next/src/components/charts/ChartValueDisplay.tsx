'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CHART_SIZE_CONFIG } from './constants'

interface ChartValueDisplayProps {
  /** Formatted value to display (e.g., "$1,234.56" or "42") */
  value: string
  /** Whether data is loading */
  isLoading: boolean
  /** Compact mode for secondary charts - smaller text */
  compact?: boolean
}

/**
 * Shared chart value display component with loading skeleton.
 *
 * @example
 * <ChartValueDisplay value="$1,234.56" isLoading={isLoading} compact={false} />
 */
export function ChartValueDisplay({
  value,
  isLoading,
  compact = false,
}: ChartValueDisplayProps) {
  const config = CHART_SIZE_CONFIG[compact ? 'sm' : 'lg']

  return (
    <div className={cn('mt-1', config.padding)}>
      {isLoading ? (
        <Skeleton
          className={cn(config.skeletonWidth, config.skeletonHeight)}
        />
      ) : (
        <p
          className={cn(
            'font-medium text-foreground',
            config.valueText
          )}
        >
          {value}
        </p>
      )}
    </div>
  )
}
