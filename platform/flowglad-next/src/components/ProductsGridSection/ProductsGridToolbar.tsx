'use client'

import { DataTableToolbar } from '@/components/ui/data-table-toolbar'

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
  return (
    <DataTableToolbar
      search={{
        value: searchValue,
        onChange: onSearchChange,
        placeholder: searchPlaceholder,
      }}
      filter={
        filterOptions && filterValue !== undefined && onFilterChange
          ? {
              value: filterValue,
              options: filterOptions,
              onChange: onFilterChange,
            }
          : undefined
      }
      actionButton={
        onCreateClick
          ? {
              onClick: onCreateClick,
              text: createButtonText,
            }
          : undefined
      }
      isLoading={isLoading}
      isFetching={isFetching}
    />
  )
}
