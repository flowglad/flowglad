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
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { useSearchDebounce } from '@/app/hooks/useSearchDebounce'
import { CollapsibleSearch } from '@/components/ui/collapsible-search'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { DataTableViewOptions } from '@/components/ui/data-table-view-options'
import { FilterButtonGroup } from '@/components/ui/filter-button-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Subscription } from '@/db/schema/subscriptions'
import type { SubscriptionStatus } from '@/types'
import { columns } from './columns'

export interface SubscriptionsTableFilters {
  status?: SubscriptionStatus
  customerId?: string
  organizationId?: string
  productName?: string
}

interface SubscriptionsDataTableProps {
  filters?: SubscriptionsTableFilters
  title?: string
  filterOptions?: { value: string; label: string }[]
  activeFilter?: string
  onFilterChange?: (value: string) => void
}

export function SubscriptionsDataTable({
  filters = {},
  title,
  filterOptions,
  activeFilter,
  onFilterChange,
}: SubscriptionsDataTableProps) {
  const router = useRouter()

  // Page size state for server-side pagination
  const [currentPageSize, setCurrentPageSize] = React.useState(10)
  const { inputValue, setInputValue, searchQuery } =
    useSearchDebounce(1000)
  const [selectedProduct, setSelectedProduct] = React.useState<
    string | undefined
  >(undefined)

  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    goToFirstPage,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    Subscription.TableRowData,
    SubscriptionsTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters: {
      ...filters,
      productName: selectedProduct,
    },
    searchQuery,
    useQuery: trpc.subscriptions.getTableRows.useQuery,
  })

  // Global product options (independent of current page/search)
  const {
    data: allProductOptions,
    isLoading: isLoadingProductOptions,
  } = trpc.subscriptions.getProductOptions.useQuery(
    {},
    { staleTime: 5 * 60 * 1000 }
  )

  // Reset to first page when filters change
  // Use JSON.stringify to get stable comparison of filter object
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

  // Client-side sorting/filtering removed; handled server-side
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [columnSizing, setColumnSizing] =
    React.useState<ColumnSizingState>({})

  const table = useReactTable({
    data: data?.items || [],
    columns,
    enableColumnResizing: true, // ✅ Enables responsive sizing
    columnResizeMode: 'onEnd', // ✅ Better performance
    defaultColumn: {
      size: 150, // Default width
      minSize: 20, // Minimum width
      maxSize: 500, // Maximum width
    },
    enableSorting: false, // Disable header sorting UI/interactions
    manualPagination: true, // Server-side pagination
    manualSorting: true, // Disable client-side sorting
    manualFiltering: true, // Disable client-side filtering
    pageCount: Math.ceil((data?.total || 0) / currentPageSize),
    // no client sorting/filter callbacks
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
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
    state: {
      columnVisibility,
      columnSizing,
      pagination: { pageIndex, pageSize: currentPageSize },
    },
  })

  return (
    <div className="w-full">
      {/* Enhanced toolbar */}
      <div className="flex flex-wrap items-center justify-between pt-4 pb-3 gap-4 min-w-0">
        {/* Title and/or Filter buttons on the left */}
        <div className="flex items-center gap-4 min-w-0 flex-shrink overflow-hidden">
          {title && <h3 className="text-lg truncate">{title}</h3>}
          {filterOptions && activeFilter && onFilterChange && (
            <FilterButtonGroup
              options={filterOptions}
              value={activeFilter}
              onValueChange={onFilterChange}
            />
          )}
        </div>

        {/* View options and local filters */}
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0 justify-end">
          <CollapsibleSearch
            value={inputValue}
            onChange={setInputValue}
            placeholder="Search subscriptions..."
            isLoading={isFetching}
          />
          <Select
            value={selectedProduct ?? '__all__'}
            onValueChange={(v) => {
              setSelectedProduct(
                v === '__all__' ? undefined : v || undefined
              )
              goToFirstPage()
            }}
            disabled={isLoadingProductOptions}
          >
            <SelectTrigger className="h-9 w-48">
              <SelectValue placeholder="All Products" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All products</SelectItem>
              {(allProductOptions ?? []).map((product: string) => (
                <SelectItem key={product} value={product}>
                  {product}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DataTableViewOptions table={table} />
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
                  // Only navigate if not clicking on interactive elements
                  const target = e.target as HTMLElement
                  if (
                    target.closest('button') ||
                    target.closest('[role="checkbox"]') ||
                    target.closest('input[type="checkbox"]') ||
                    target.closest('[data-radix-collection-item]')
                  ) {
                    return
                  }
                  router.push(
                    `/finance/subscriptions/${row.original.subscription.id}`
                  )
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

      {/* Pagination */}
      <div className="py-2">
        <DataTablePagination
          table={table}
          totalCount={data?.total}
          isFiltered={Object.keys(filters).length > 0}
          filteredCount={data?.total}
        />
      </div>
    </div>
  )
}
