'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ProductsGridPaginationProps {
  /** Total count of items */
  total: number
  /** Entity name for display (e.g., "product") */
  entityName: string
  /** URL for "View All" link */
  viewAllHref?: string
  /** Whether there's a next page */
  hasNextPage: boolean
  /** Whether there's a previous page */
  hasPreviousPage: boolean
  /** Callback for previous page button */
  onPrevious: () => void
  /** Callback for next page button */
  onNext: () => void
  /** Whether data is loading */
  isLoading?: boolean
  /** Whether data is being fetched in background */
  isFetching?: boolean
}

/**
 * Custom pagination footer for ProductsGridSection.
 *
 * Displays:
 * - Left side: "{count} {entityName}s" count and optional "View All Products" link
 * - Right side: Previous/Next ghost buttons that become invisible when disabled
 */
export function ProductsGridPagination({
  total,
  entityName,
  viewAllHref,
  hasNextPage,
  hasPreviousPage,
  onPrevious,
  onNext,
  isLoading,
  isFetching,
}: ProductsGridPaginationProps) {
  const isDisabled = isLoading || isFetching
  const pluralizedEntityName =
    total === 1 ? entityName : `${entityName}s`

  return (
    <div className="flex items-center justify-between w-full">
      {/* Left: Count & View All */}
      <div className="flex items-center gap-2.5 px-3">
        <span className="font-sans font-medium text-sm leading-none text-muted-foreground whitespace-nowrap">
          {total} {pluralizedEntityName}
        </span>

        {viewAllHref && (
          <>
            <div className="w-px h-[22px] bg-muted-foreground opacity-10" />
            <Link
              href={viewAllHref}
              className="font-sans font-medium text-sm leading-none text-muted-foreground underline whitespace-nowrap hover:text-foreground transition-colors"
            >
              View All Products
            </Link>
          </>
        )}
      </div>

      {/* Right: Pagination buttons */}
      <div className="flex items-start gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onPrevious}
          disabled={!hasPreviousPage || isDisabled}
          className={cn(
            'h-8 px-3 py-2 font-sans font-medium text-sm leading-5 text-muted-foreground',
            !hasPreviousPage &&
              'opacity-0 disabled:opacity-0 pointer-events-none'
          )}
          aria-hidden={!hasPreviousPage}
        >
          Previous
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onNext}
          disabled={!hasNextPage || isDisabled}
          className="h-8 px-3 py-2 font-sans font-medium text-sm leading-5 text-muted-foreground"
        >
          Next
        </Button>
      </div>
    </div>
  )
}
