'use client'

import { Skeleton } from '@/components/ui/skeleton'

interface ChartBodyProps {
  /** Whether data is loading */
  isLoading: boolean
  /** Chart content (usually a LineChart or AreaChart) */
  children: React.ReactNode
}

/**
 * Shared chart body wrapper with loading skeleton.
 * Renders a skeleton during loading, chart content otherwise.
 *
 * @example
 * <ChartBody isLoading={isLoading}>
 *   <LineChart {...chartProps} />
 * </ChartBody>
 */
export function ChartBody({ isLoading, children }: ChartBodyProps) {
  if (isLoading) {
    return (
      <div className="-mb-2 mt-2 flex items-center">
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }
  return <>{children}</>
}
