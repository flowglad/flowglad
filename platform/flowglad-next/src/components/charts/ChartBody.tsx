'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CHART_SIZE_CONFIG } from './constants'
import type { ChartSize } from './types'

interface ChartBodyProps {
  /** Whether data is loading */
  isLoading: boolean
  /** Chart content (usually a LineChart or AreaChart) */
  children: React.ReactNode
  /** Chart size variant - 'lg' for primary, 'sm' for secondary */
  size?: ChartSize
}

/**
 * Shared chart body wrapper with loading skeleton.
 * Renders a skeleton during loading, chart content otherwise.
 *
 * @example
 * <ChartBody isLoading={isLoading} size="lg">
 *   <LineChart {...chartProps} />
 * </ChartBody>
 */
export function ChartBody({
  isLoading,
  children,
  size = 'lg',
}: ChartBodyProps) {
  const config = CHART_SIZE_CONFIG[size]

  if (isLoading) {
    return (
      <div className="mt-3 flex items-center">
        <Skeleton className={cn('w-full', config.height)} />
      </div>
    )
  }
  return <>{children}</>
}
