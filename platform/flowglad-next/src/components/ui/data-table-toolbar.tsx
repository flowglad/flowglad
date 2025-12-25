'use client'

import { Plus } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { InlineSearch } from '@/components/ui/inline-search'
import { StatusDropdownFilter } from '@/components/ui/status-dropdown-filter'
import { cn } from '@/lib/utils'

interface FilterOption {
  value: string
  label: string
}

interface SearchProps {
  /** Current search input value */
  value: string
  /** Callback when search value changes */
  onChange: (value: string) => void
  /** Placeholder text for search input */
  placeholder?: string
}

interface FilterProps {
  /** Current filter value */
  value: string
  /** Available filter options */
  options: FilterOption[]
  /** Callback when filter changes */
  onChange: (value: string) => void
}

interface ActionButtonProps {
  /** Callback when button is clicked */
  onClick: () => void
  /** Button text */
  text: string
  /** Optional custom icon (defaults to Plus) */
  icon?: React.ReactNode
  /** Button variant */
  variant?:
    | 'default'
    | 'outline'
    | 'ghost'
    | 'link'
    | 'secondary'
    | 'destructive'
}

interface DataTableToolbarProps {
  /** Search input configuration */
  search?: SearchProps
  /** Dropdown filter configuration */
  filter?: FilterProps
  /** Primary action button configuration */
  actionButton?: ActionButtonProps
  /** Whether data is loading (initial load) */
  isLoading?: boolean
  /** Whether data is being fetched in background */
  isFetching?: boolean
  /** Additional content to render in the buttons row */
  children?: React.ReactNode
  /** Additional CSS classes for the container */
  className?: string
}

/**
 * Reusable toolbar component for data tables.
 *
 * Responsive layout:
 * - Mobile: 2 rows - search on top (full width), buttons on bottom (full width, equally spaced)
 * - Desktop: Single row - search (flex-1), filter dropdown, action button
 *
 * @example
 * // Basic usage with search only
 * <DataTableToolbar
 *   search={{ value: searchValue, onChange: setSearchValue, placeholder: 'Search...' }}
 *   isFetching={isFetching}
 *   isLoading={isLoading}
 * />
 *
 * @example
 * // With filter and action button
 * <DataTableToolbar
 *   search={{ value: searchValue, onChange: setSearchValue }}
 *   filter={{
 *     value: filterValue,
 *     options: [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }],
 *     onChange: setFilterValue,
 *   }}
 *   actionButton={{ onClick: handleCreate, text: 'Create Product' }}
 *   isFetching={isFetching}
 * />
 *
 * @example
 * // With custom buttons via children
 * <DataTableToolbar
 *   search={{ value: searchValue, onChange: setSearchValue }}
 *   isFetching={isFetching}
 * >
 *   <Button variant="secondary" onClick={handleExport}>Export</Button>
 *   <Button onClick={handleCreate}>Create</Button>
 * </DataTableToolbar>
 */
function DataTableToolbar({
  search,
  filter,
  actionButton,
  isLoading,
  isFetching,
  children,
  className,
}: DataTableToolbarProps) {
  const hasButtons = filter || actionButton || children

  return (
    <div
      className={cn(
        'flex flex-col gap-2 w-full sm:flex-row sm:items-center sm:gap-1',
        className
      )}
    >
      {/* Search input - full width on mobile, flex-1 on desktop */}
      {search && (
        <InlineSearch
          value={search.value}
          onChange={search.onChange}
          placeholder={search.placeholder}
          isLoading={isFetching}
          disabled={isLoading}
          className="w-full sm:flex-1"
        />
      )}

      {/* Spacer when no search but has buttons */}
      {!search && hasButtons && <div className="flex-1" />}

      {/* Buttons row - full width on mobile, auto on desktop */}
      {hasButtons && (
        <div className="flex items-center gap-1 w-full sm:w-auto">
          {filter && (
            <StatusDropdownFilter
              value={filter.value}
              onChange={filter.onChange}
              options={filter.options}
              disabled={isLoading}
              className="flex-1 sm:flex-none"
            />
          )}

          {/* Custom content via children */}
          {children}

          {actionButton && (
            <Button
              onClick={actionButton.onClick}
              variant={actionButton.variant ?? 'secondary'}
              size="sm"
              disabled={isLoading}
              className="flex-1 sm:flex-none"
            >
              {actionButton.icon ?? <Plus className="w-4 h-4" />}
              {actionButton.text}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export { DataTableToolbar }
export type {
  DataTableToolbarProps,
  SearchProps,
  FilterProps,
  ActionButtonProps,
  FilterOption,
}
