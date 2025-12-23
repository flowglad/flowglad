'use client'

import {
  type ColumnFiltersState,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
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
import { Button } from '@/components/ui/button'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { DataTableViewOptions } from '@/components/ui/data-table-view-options'
import { FilterButtonGroup } from '@/components/ui/filter-button-group'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { columns, type ProductRow } from './columns'

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
  buttonVariant?:
    | 'default'
    | 'outline'
    | 'ghost'
    | 'link'
    | 'secondary'
    | 'destructive'
  hiddenColumns?: string[]
}

export function ProductsDataTable({
  filters = {},
  onCreateProduct,
  filterOptions,
  activeFilter,
  onFilterChange,
  buttonVariant = 'default',
  hiddenColumns = [],
}: ProductsDataTableProps) {
  const router = useRouter()

  // DISABLED: Need to index db before reenabling
  // const { inputValue, setInputValue, searchQuery } =
  //   useSearchDebounce(1000)

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
  } = usePaginatedTableState<ProductRow, ProductsTableFilters>({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters: filters,
    useQuery: trpc.products.getTableRows.useQuery,
  })

  // Reset to first page when filters change
  // Use JSON.stringify to get stable comparison of filter object
  const filtersKey = JSON.stringify(filters)
  React.useEffect(() => {
    goToFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

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
      minSize: 50,
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

      if (newPagination.pageSize !== currentPageSize) {
        setCurrentPageSize(newPagination.pageSize)
        goToFirstPage()
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
      columnSizing,
      pagination: { pageIndex, pageSize: currentPageSize },
    },
  })

  return (
    <div className="w-full">
      {/* Enhanced toolbar with all improvements */}
      <div className="flex items-center justify-between pt-4 pb-2 gap-4 min-w-0">
        {/* Filter buttons on the left */}
        <div className="flex items-center min-w-0 flex-shrink overflow-hidden">
          {filterOptions && activeFilter && onFilterChange && (
            <FilterButtonGroup
              options={filterOptions}
              value={activeFilter}
              onValueChange={onFilterChange}
            />
          )}
        </div>

        {/* Search, toggle columns, and create button on the right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* DISABLED: Need to index db before reenabling
          <CollapsibleSearch
            value={inputValue}
            onChange={setInputValue}
            placeholder="Search products..."
            disabled={isLoading}
            isLoading={isFetching}
          />
           */}
          <DataTableViewOptions table={table} />
          {onCreateProduct && (
            <Button onClick={onCreateProduct} variant={buttonVariant}>
              <Plus className="w-4 h-4 mr-2" />
              Create Product
            </Button>
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
                  router.push(`/products/${row.original.product.id}`)
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

      {/* Enhanced pagination with proper spacing */}
      <div className="py-2">
        <DataTablePagination
          table={table}
          totalCount={data?.total}
          // isFiltered={
          //   !!searchQuery || Object.keys(filters).length > 0
          // }
          isFiltered={Object.keys(filters).length > 0}
          filteredCount={data?.total}
        />
      </div>
    </div>
  )
}
