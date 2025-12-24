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
 * Matches the Figma design with:
 * - InlineSearch (flex-1 to fill space)
 * - StatusDropdownFilter (optional)
 * - Create button with Plus icon (optional)
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
  return (
    <div className="flex items-center gap-1 w-full">
      <InlineSearch
        value={searchValue}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        isLoading={isFetching}
        disabled={isLoading}
        className="flex-1"
      />

      {filterOptions &&
        filterValue !== undefined &&
        onFilterChange && (
          <StatusDropdownFilter
            value={filterValue}
            onChange={onFilterChange}
            options={filterOptions}
            disabled={isLoading}
          />
        )}

      {onCreateClick && (
        <Button
          onClick={onCreateClick}
          variant="secondary"
          size="sm"
          disabled={isLoading}
        >
          <Plus className="w-4 h-4" />
          {createButtonText}
        </Button>
      )}
    </div>
  )
}
