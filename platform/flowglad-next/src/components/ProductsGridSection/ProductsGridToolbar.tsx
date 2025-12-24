'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InlineSearch } from '@/components/ui/inline-search'
import { StatusDropdownFilter } from '@/components/ui/status-dropdown-filter'

interface ProductsGridToolbarProps {
  /** Current search input value */
  searchValue: string
  /** Callback when search value changes */
  onSearchChange: (value: string) => void
  /** Placeholder text for search input */
  searchPlaceholder?: string
  /** Current filter value */
  filterValue?: string
  /** Available filter options */
  filterOptions?: { value: string; label: string }[]
  /** Callback when filter changes */
  onFilterChange?: (value: string) => void
  /** Callback when create button is clicked */
  onCreateClick?: () => void
  /** Text for create button */
  createButtonText?: string
  /** Whether data is loading (initial load) */
  isLoading?: boolean
  /** Whether data is being fetched in background */
  isFetching?: boolean
}

/**
 * Toolbar component for ProductsGridSection.
 *
 * Responsive layout:
 * - Mobile: 2 rows - search on top (full width), buttons on bottom (full width, equally spaced)
 * - Desktop: Single row - search (flex-1), filter dropdown, create button
 */
export function ProductsGridToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search products...',
  filterValue,
  filterOptions,
  onFilterChange,
  onCreateClick,
  createButtonText = 'Create',
  isLoading,
  isFetching,
}: ProductsGridToolbarProps) {
  const hasButtons =
    (filterOptions && filterValue !== undefined && onFilterChange) ||
    onCreateClick

  return (
    <div className="flex flex-col gap-2 w-full sm:flex-row sm:items-center sm:gap-1">
      {/* Search input - full width on mobile, flex-1 on desktop */}
      <InlineSearch
        value={searchValue}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        isLoading={isFetching}
        disabled={isLoading}
        className="w-full sm:flex-1"
      />

      {/* Buttons row - full width on mobile, auto on desktop */}
      {hasButtons && (
        <div className="flex items-center gap-1 w-full sm:w-auto">
          {filterOptions &&
            filterValue !== undefined &&
            onFilterChange && (
              <StatusDropdownFilter
                value={filterValue}
                onChange={onFilterChange}
                options={filterOptions}
                disabled={isLoading}
                className="flex-1 sm:flex-none"
              />
            )}

          {onCreateClick && (
            <Button
              onClick={onCreateClick}
              variant="secondary"
              size="sm"
              disabled={isLoading}
              className="flex-1 sm:flex-none"
            >
              <Plus className="w-4 h-4" />
              {createButtonText}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
