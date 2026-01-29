'use client'

import { PriceType } from '@db-core/enums'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { useSearchDebounce } from '@/app/hooks/useSearchDebounce'
import { Button } from '@/components/ui/button'
import { DataTableToolbar } from '@/components/ui/data-table-toolbar'
import { Skeleton } from '@/components/ui/skeleton'
import type { Price } from '@/db/schema/prices'
import { cn } from '@/lib/utils'
import type { PricesGetTableRowsFilters } from '@/server/routers/pricesRouter'
import { UsagePriceCard } from './UsagePriceCard'

interface UsagePricesGridSectionProps {
  /** The usage meter ID to filter prices by */
  usageMeterId: string
  /** Options for the status filter dropdown */
  filterOptions?: { value: string; label: string }[]
  /** Currently active filter value */
  activeFilter?: string
  /** Callback when filter changes */
  onFilterChange?: (value: string) => void
  /** Callback when create button is clicked */
  onCreateUsagePrice?: () => void
  /** Callback when a price card is clicked */
  onPriceClick?: (priceId: string) => void
  /** Number of items per page (default: 6, max: 6) */
  pageSize?: number
}

/**
 * UsagePricesGridSection component
 *
 * Displays usage prices for a specific usage meter in a responsive grid layout
 * (2 columns on tablet+, 1 column on mobile) with search, filter, and create actions.
 * Includes pagination controls at the bottom.
 *
 * Based on the ProductsGridSection pattern.
 */
export function UsagePricesGridSection({
  usageMeterId,
  filterOptions,
  activeFilter,
  onFilterChange,
  onCreateUsagePrice,
  onPriceClick,
  pageSize = 6,
}: UsagePricesGridSectionProps) {
  // Clamp page size to max of 6
  const effectivePageSize = Math.min(pageSize, 6)

  // Server-side search with debounce
  const { inputValue, setInputValue, searchQuery } =
    useSearchDebounce(300)

  // Build filters based on active filter and usageMeterId
  const filters: PricesGetTableRowsFilters = React.useMemo(() => {
    const baseFilters: PricesGetTableRowsFilters = {
      usageMeterId,
      type: PriceType.Usage, // Defense-in-depth: always filter to usage prices
    }

    if (activeFilter === 'active') {
      return { ...baseFilters, active: true }
    } else if (activeFilter === 'inactive') {
      return { ...baseFilters, active: false }
    }

    return baseFilters
  }, [usageMeterId, activeFilter])

  const {
    pageIndex,
    handlePaginationChange,
    goToFirstPage,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    {
      price: Price.ClientRecord
      product: {
        id: string
        name: string
      } | null
    },
    PricesGetTableRowsFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: effectivePageSize,
    filters,
    searchQuery,
    useQuery: trpc.prices.getTableRows.useQuery,
  })

  // Reset to first page when filters change
  const filtersKey = JSON.stringify(filters)
  React.useEffect(() => {
    goToFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  // Reset to first page when search changes
  React.useEffect(() => {
    goToFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  const handlePrevious = () => {
    if (pageIndex > 0) {
      handlePaginationChange(pageIndex - 1)
    }
  }

  const handleNext = () => {
    handlePaginationChange(pageIndex + 1)
  }

  const total = data?.total ?? 0
  const pluralizedEntityName = total === 1 ? 'price' : 'prices'

  return (
    <div className="flex flex-col w-full">
      {/* Toolbar */}
      <div className="pt-1 pb-2 px-4">
        <DataTableToolbar
          search={{
            value: inputValue,
            onChange: setInputValue,
            placeholder: 'Search prices...',
          }}
          filter={
            filterOptions &&
            activeFilter !== undefined &&
            onFilterChange
              ? {
                  value: activeFilter,
                  options: filterOptions,
                  onChange: onFilterChange,
                }
              : undefined
          }
          actionButton={
            onCreateUsagePrice
              ? {
                  onClick: onCreateUsagePrice,
                  text: 'Create Usage Price',
                }
              : undefined
          }
          isLoading={isLoading}
          isFetching={isFetching}
        />
      </div>

      {/* Grid */}
      <div className="px-4">
        {isLoading ? (
          // Loading skeleton
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
            {[...Array(effectivePageSize)].map((_, i) => (
              <Skeleton
                key={i}
                className="h-[100px] w-full rounded-md"
              />
            ))}
          </div>
        ) : data?.items && data.items.length > 0 ? (
          // Price cards grid
          <div
            className={cn(
              'grid grid-cols-1 sm:grid-cols-2 gap-2 w-full overflow-hidden',
              isFetching && 'opacity-50 pointer-events-none'
            )}
          >
            {data.items.map((row) => {
              const { price } = row

              return (
                <UsagePriceCard
                  key={price.id}
                  price={price}
                  onClick={
                    onPriceClick
                      ? () => onPriceClick(price.id)
                      : undefined
                  }
                />
              )
            })}
          </div>
        ) : (
          // Empty state
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              No usage prices found
            </p>
            {onCreateUsagePrice && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onCreateUsagePrice}
              >
                Create Usage Price
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data?.items && data.items.length > 0 && (
        <div className="px-4 pt-2">
          <div className="flex items-center justify-between w-full">
            {/* Left: Count */}
            <div className="flex items-center gap-2.5 px-3">
              <span className="font-sans font-medium text-sm leading-none text-muted-foreground whitespace-nowrap">
                {total} {pluralizedEntityName}
              </span>
            </div>

            {/* Right: Pagination buttons */}
            <div className="flex items-start gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevious}
                disabled={
                  !data?.hasPreviousPage || isLoading || isFetching
                }
                className={cn(
                  'h-8 px-3 py-2 font-sans font-medium text-sm leading-5 text-muted-foreground',
                  !data?.hasPreviousPage &&
                    'opacity-0 disabled:opacity-0 pointer-events-none'
                )}
                aria-hidden={!data?.hasPreviousPage}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNext}
                disabled={
                  !data?.hasNextPage || isLoading || isFetching
                }
                className="h-8 px-3 py-2 font-sans font-medium text-sm leading-5 text-muted-foreground"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
