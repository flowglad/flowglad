'use client'

import {
  type ColumnFiltersState,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { useSearchDebounce } from '@/app/hooks/useSearchDebounce'
import { Button } from '@/components/ui/button'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { InlineSearch } from '@/components/ui/inline-search'
import { StatusDropdownFilter } from '@/components/ui/status-dropdown-filter'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { columns, type FeatureRow } from './columns'

export interface FeaturesTableFilters {
  pricingModelId?: string
  active?: boolean
}

interface FeaturesDataTableProps {
  filters?: FeaturesTableFilters
  title?: string
  onCreateFeature?: () => void
  filterOptions?: { value: string; label: string }[]
  activeFilter?: string
  onFilterChange?: (value: string) => void
  buttonVariant?:
    | 'default'
    | 'outline'
    | 'ghost'
    | 'link'
    | 'secondary'
    | 'destructive'
  hiddenColumns?: string[]
}

export function FeaturesDataTable({
  filters = {},
  title,
  onCreateFeature,
  filterOptions,
  activeFilter,
  onFilterChange,
  buttonVariant = 'secondary',
  hiddenColumns = [],
}: FeaturesDataTableProps) {
  const router = useRouter()

  // Server-side search with debounce
  const { inputValue, setInputValue, searchQuery } =
    useSearchDebounce(300)

  // Page size state for server-side pagination
  const [currentPageSize, setCurrentPageSize] = React.useState(10)

  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    goToFirstPage,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<FeatureRow, FeaturesTableFilters>({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters: filters,
    searchQuery: searchQuery,
    useQuery: trpc.features.getTableRows.useQuery,
  })

  // Reset to first page when filters change
  const filtersKey = JSON.stringify(filters)
  React.useEffect(() => {
    goToFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  // Reset to first page when debounced search changes
  React.useEffect(() => {
    goToFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  // Client-side features (Shadcn patterns)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(() =>
      Object.fromEntries(hiddenColumns.map((col) => [col, false]))
    )
  const [columnSizing, setColumnSizing] =
    React.useState<ColumnSizingState>({})

  const table = useReactTable({
    data: data?.items || [],
    columns,
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: {
      size: 150,
      minSize: 20,
      maxSize: 500,
    },
    manualPagination: true, // Server-side pagination
    manualSorting: false, // Client-side sorting on current page
    manualFiltering: false, // Client-side filtering on current page
    pageCount: Math.ceil((data?.total || 0) / currentPageSize),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onPaginationChange: (updater) => {
      const newPagination =
        typeof updater === 'function'
          ? updater({ pageIndex, pageSize: currentPageSize })
          : updater

      // Handle page size changes
      if (newPagination.pageSize !== currentPageSize) {
        setCurrentPageSize(newPagination.pageSize)
        goToFirstPage() // Properly clears both cursors to avoid stale pagination state
      }
      // Handle page index changes (page navigation)
      else if (newPagination.pageIndex !== pageIndex) {
        handlePaginationChange(newPagination.pageIndex)
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnSizing,
      pagination: { pageIndex, pageSize: currentPageSize },
    },
  })

  const hasButtons =
    (filterOptions && activeFilter && onFilterChange) ||
    onCreateFeature

  return (
    <div className="w-full">
      {/* Enhanced toolbar */}
      <div className="flex flex-col gap-3 pt-1 pb-2 px-6">
        {/* Title row */}
        {title && (
          <div>
            <h3 className="text-lg truncate">{title}</h3>
          </div>
        )}
        {/* Redesigned toolbar - responsive: 2 rows on mobile, 1 row on desktop */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-1">
          {/* Search input - full width on mobile, flex-1 on desktop */}
          <InlineSearch
            value={inputValue}
            onChange={setInputValue}
            placeholder="Search features..."
            isLoading={isFetching}
            disabled={isLoading}
            className="w-full sm:flex-1"
          />
          {/* Buttons row - full width on mobile, auto on desktop */}
          {hasButtons && (
            <div className="flex items-center gap-1 w-full sm:w-auto">
              {filterOptions && activeFilter && onFilterChange && (
                <StatusDropdownFilter
                  value={activeFilter}
                  onChange={onFilterChange}
                  options={filterOptions}
                  className="flex-1 sm:flex-none"
                />
              )}
              {onCreateFeature && (
                <Button
                  onClick={onCreateFeature}
                  variant={buttonVariant}
                  size="sm"
                  className="flex-1 sm:flex-none"
                >
                  <Plus className="w-4 h-4" />
                  Create Feature
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <Table className="w-full" style={{ tableLayout: 'fixed' }}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="hover:bg-transparent"
            >
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                Loading...
              </TableCell>
            </TableRow>
          ) : table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => {
              const navigateToFeature = () => {
                router.push(`/features/${row.original.feature.id}`)
              }
              return (
                <TableRow
                  key={row.id}
                  className={`cursor-pointer ${isFetching ? 'opacity-50' : ''}`}
                  tabIndex={0}
                  role="link"
                  onClick={(e) => {
                    const target = e.target
                    if (!(target instanceof Element)) {
                      return
                    }
                    if (
                      target.closest('button') ||
                      target.closest('[role="checkbox"]') ||
                      target.closest('input[type="checkbox"]')
                    ) {
                      return
                    }
                    navigateToFeature()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      const target = e.target
                      if (!(target instanceof Element)) {
                        return
                      }
                      if (
                        target.closest('button') ||
                        target.closest('[role="checkbox"]') ||
                        target.closest('input[type="checkbox"]')
                      ) {
                        return
                      }
                      e.preventDefault()
                      navigateToFeature()
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="py-2 px-4">
        <DataTablePagination
          table={table}
          totalCount={data?.total}
          isFiltered={
            !!searchQuery || Object.keys(filters).length > 0
          }
          filteredCount={data?.total}
          entityName="feature"
        />
      </div>
    </div>
  )
}
