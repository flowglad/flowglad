'use client'

import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { useSearchDebounce } from '@/app/hooks/useSearchDebounce'
import type { ProductRow } from '@/app/products/columns'
import type { ProductsTableFilters } from '@/app/products/data-table'
import { ProductCard } from '@/components/ProductCard'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ProductsGridPagination } from './ProductsGridPagination'
import { ProductsGridToolbar } from './ProductsGridToolbar'
import {
  formatProductCardPrice,
  getDefaultPrice,
  getProductStatusText,
} from './utils'

interface ProductsGridSectionProps {
  /** Filters to apply to the products query */
  filters?: ProductsTableFilters
  /** Options for the status filter dropdown */
  filterOptions?: { value: string; label: string }[]
  /** Currently active filter value */
  activeFilter?: string
  /** Callback when filter changes */
  onFilterChange?: (value: string) => void
  /** Callback when create button is clicked */
  onCreateProduct?: () => void
  /** URL for "View All Products" link */
  viewAllHref?: string
  /** Number of items per page (default: 6, max: 6) */
  pageSize?: number
}

/**
 * ProductsGridSection component
 *
 * Displays products in a responsive grid layout (2 columns on tablet+, 1 column on mobile)
 * with search, filter, and create actions. Includes pagination controls at the bottom.
 *
 * Based on Figma design system specifications.
 */
export function ProductsGridSection({
  filters = {},
  filterOptions,
  activeFilter,
  onFilterChange,
  onCreateProduct,
  viewAllHref,
  pageSize = 6,
}: ProductsGridSectionProps) {
  // Clamp page size to max of 6
  const effectivePageSize = Math.min(pageSize, 6)

  // Server-side search with debounce
  const { inputValue, setInputValue, searchQuery } =
    useSearchDebounce(300)

  const {
    pageIndex,
    handlePaginationChange,
    goToFirstPage,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<ProductRow, ProductsTableFilters>({
    initialCurrentCursor: undefined,
    pageSize: effectivePageSize,
    filters,
    searchQuery,
    useQuery: trpc.products.getTableRows.useQuery,
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

  return (
    <div className="flex flex-col w-full">
      {/* Toolbar */}
      <div className="pt-1 pb-2 px-4">
        <ProductsGridToolbar
          searchValue={inputValue}
          onSearchChange={setInputValue}
          searchPlaceholder="Search products..."
          filterValue={activeFilter}
          filterOptions={filterOptions}
          onFilterChange={onFilterChange}
          onCreateClick={onCreateProduct}
          createButtonText="Create Product"
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
        ) : (
          // Product cards grid
          <div
            className={cn(
              'grid grid-cols-1 sm:grid-cols-2 gap-2 w-full overflow-hidden',
              isFetching && 'opacity-50 pointer-events-none'
            )}
          >
            {data?.items.map((row) => {
              const { product, prices } = row
              const defaultPrice = getDefaultPrice(prices)

              if (!defaultPrice) return null

              const priceData = formatProductCardPrice(defaultPrice)

              return (
                <ProductCard
                  key={product.id}
                  productName={product.name}
                  productStatus={getProductStatusText(product)}
                  price={priceData.price}
                  period={priceData.period}
                  currencySymbol={priceData.currencySymbol}
                  href={`/products/${product.id}`}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="px-4 pt-2">
        <ProductsGridPagination
          total={data?.total ?? 0}
          entityName="product"
          viewAllHref={viewAllHref}
          hasNextPage={data?.hasNextPage ?? false}
          hasPreviousPage={data?.hasPreviousPage ?? false}
          onPrevious={handlePrevious}
          onNext={handleNext}
          isLoading={isLoading}
          isFetching={isFetching}
        />
      </div>
    </div>
  )
}
