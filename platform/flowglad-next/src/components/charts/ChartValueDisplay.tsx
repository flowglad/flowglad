'use client'

import { Skeleton } from '@/components/ui/skeleton'

interface ChartValueDisplayProps {
  /** Formatted value to display (e.g., "$1,234.56" or "42") */
  value: string
  /** Whether data is loading */
  isLoading: boolean
}

/**
 * Shared chart value display component with loading skeleton.
 *
 * @example
 * <ChartValueDisplay value="$1,234.56" isLoading={isLoading} />
 */
export function ChartValueDisplay({
  value,
  isLoading,
}: ChartValueDisplayProps) {
  return (
    <div className="px-6 mt-1">
      {isLoading ? (
        <Skeleton className="w-36 h-7" />
      ) : (
        <p className="text-xl font-medium text-foreground">{value}</p>
      )}
    </div>
  )
}
