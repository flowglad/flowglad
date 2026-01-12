'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CHART_SIZE_CONFIG } from './constants'

interface ChartBodyProps {
  /** Whether data is loading */
  isLoading: boolean
  /** Chart content (usually a LineChart or AreaChart) */
  children: React.ReactNode
  /** Compact mode for secondary charts - shorter skeleton */
  compact?: boolean
}

/**
 * Shared chart body wrapper with loading skeleton.
 * Renders a skeleton during loading, chart content otherwise.
 *
 * @example
 * <ChartBody isLoading={isLoading} compact={false}>
 *   <LineChart {...chartProps} />
 * </ChartBody>
 */
export function ChartBody({
  isLoading,
  children,
  compact = false,
}: ChartBodyProps) {
  const config = CHART_SIZE_CONFIG[compact ? 'sm' : 'lg']

  if (isLoading) {
    return (
      <div className="-mb-2 mt-2 flex items-center">
        <Skeleton className={cn('w-full', config.height)} />
      </div>
    )
  }
  return <>{children}</>
}
