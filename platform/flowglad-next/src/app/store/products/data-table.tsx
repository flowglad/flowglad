'use client'

import * as React from 'react'
import {
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTableViewOptions } from '@/components/ui/data-table-view-options'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { CollapsibleSearch } from '@/components/ui/collapsible-search'
import { FilterButtonGroup } from '@/components/ui/filter-button-group'
import { columns, ProductRow } from './columns'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { trpc } from '@/app/_trpc/client'
import debounce from 'debounce'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

export enum FocusedTab {
  All = 'all',
  Active = 'active',
  Archived = 'archived',
}

export interface ProductsTableFilters {
  active?: boolean
  organizationId?: string
  pricingModelId?: string
}

interface ProductsDataTableProps {
  filters?: ProductsTableFilters
  onCreateProduct?: () => void
  filterOptions?: { value: string; label: string }[]
  activeFilter?: string
  onFilterChange?: (value: string) => void
}

export function ProductsDataTable({
  filters = {},
  onCreateProduct,
  filterOptions,
  activeFilter,
  onFilterChange,
}: ProductsDataTableProps) {
  const router = useRouter()

  // Server-side filtering (preserve enterprise architecture)
  const [inputValue, setInputValue] = React.useState('')
  const [searchQuery, setSearchQuery] = React.useState('')
  const debouncedSetSearchQuery = debounce(setSearchQuery, 1000)

  // Page size state for server-side pagination
  const [currentPageSize, setCurrentPageSize] = React.useState(10)

  React.useEffect(() => {
    debouncedSetSearchQuery(inputValue)
  }, [inputValue, debouncedSetSearchQuery])

  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<ProductRow, ProductsTableFilters>({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters: filters,
    searchQuery: searchQuery,
    useQuery: trpc.products.getTableRows.useQuery,
  })

  // Client-side features (Shadcn patterns)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})

  const table = useReactTable({
    data: data?.items || [],
    columns,
    manualPagination: true, // Server-side pagination
    manualSorting: false, // Client-side sorting on current page
    manualFiltering: false, // Client-side filtering on current page
    pageCount: Math.ceil((data?.total || 0) / currentPageSize),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: (updater) => {
      const newPagination =
        typeof updater === 'function'
          ? updater({ pageIndex, pageSize: currentPageSize })
          : updater

      if (newPagination.pageSize !== currentPageSize) {
        setCurrentPageSize(newPagination.pageSize)
        handlePaginationChange(0)
      } else if (newPagination.pageIndex !== pageIndex) {
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
      pagination: { pageIndex, pageSize: currentPageSize },
    },
  })

  return (
    <div className="w-full">
      {/* Enhanced toolbar with all improvements */}
      <div className="flex items-center justify-between py-4">
        {/* Filter buttons on the left */}
        <div className="flex items-center">
          {filterOptions && activeFilter && onFilterChange && (
            <FilterButtonGroup
              options={filterOptions}
              value={activeFilter}
              onValueChange={onFilterChange}
            />
          )}
        </div>

        {/* Search, toggle columns, and create button on the right */}
        <div className="flex items-center gap-2">
          <CollapsibleSearch
            value={inputValue}
            onChange={setInputValue}
            placeholder="Search products..."
            disabled={isLoading}
            isLoading={isFetching}
          />
          <DataTableViewOptions table={table} />
          {onCreateProduct && (
            <Button onClick={onCreateProduct}>
              <Plus className="w-4 h-4 mr-2" />
              Create Product
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="border-t border-b">
        <Table>
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
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={`cursor-pointer ${isFetching ? 'opacity-50' : ''}`}
                  onClick={(e) => {
                    const target = e.target as HTMLElement
                    if (
                      target.closest('button') ||
                      target.closest('[role="checkbox"]') ||
                      target.closest('input[type="checkbox"]')
                    ) {
                      return
                    }
                    router.push(
                      `/store/products/${row.original.product.id}`
                    )
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
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
      </div>

      {/* Enhanced pagination with proper spacing */}
      <div className="py-2">
        <DataTablePagination
          table={table}
          totalCount={data?.total}
          isFiltered={
            !!searchQuery || Object.keys(filters).length > 0
          }
          filteredCount={data?.total}
        />
      </div>
    </div>
  )
}
