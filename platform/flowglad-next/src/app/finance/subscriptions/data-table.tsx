'use client'

import * as React from 'react'
import {
  ColumnFiltersState,
  ColumnSizingState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
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
import { FilterButtonGroup } from '@/components/ui/filter-button-group'
import { columns } from './columns'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { trpc } from '@/app/_trpc/client'
import { Subscription } from '@/db/schema/subscriptions'
import { SubscriptionStatus } from '@/types'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface SubscriptionsTableFilters {
  status?: SubscriptionStatus
  customerId?: string
  organizationId?: string
}

interface SubscriptionsDataTableProps {
  filters?: SubscriptionsTableFilters
  title?: string
  filterOptions?: { value: string; label: string }[]
  activeFilter?: string
  onFilterChange?: (value: string) => void
}

const ALL_PRODUCTS_FILTER = 'all'

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
  const [customerSearch, setCustomerSearch] = React.useState('')
  const [selectedProduct, setSelectedProduct] =
    React.useState<string>(ALL_PRODUCTS_FILTER)

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
    filters: filters,
    // ⚠️ NO searchQuery - backend doesn't support it
    useQuery: trpc.subscriptions.getTableRows.useQuery,
  })

  const productOptions = React.useMemo(() => {
    const uniqueProducts = new Set<string>()
    data?.items?.forEach((item) => {
      const name = item.product.name?.trim()
      if (name) {
        uniqueProducts.add(name)
      }
    })
    return Array.from(uniqueProducts).sort((a, b) =>
      a.localeCompare(b)
    )
  }, [data?.items])

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
    manualPagination: true, // Server-side pagination
    manualSorting: false, // Client-side sorting on current page
    manualFiltering: false, // Client-side filtering on current page
    pageCount: Math.ceil((data?.total || 0) / currentPageSize),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
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

  const handleCustomerSearchChange = React.useCallback(
    (value: string) => {
      setCustomerSearch(value)
      const column = table.getColumn('customerName')
      column?.setFilterValue(value)
    },
    [table]
  )

  React.useEffect(() => {
    const productColumn = table.getColumn('productName')
    if (selectedProduct === ALL_PRODUCTS_FILTER) {
      productColumn?.setFilterValue(undefined)
    } else {
      productColumn?.setFilterValue(selectedProduct)
    }
  }, [selectedProduct, table])

  React.useEffect(() => {
    if (
      selectedProduct !== ALL_PRODUCTS_FILTER &&
      !productOptions.includes(selectedProduct)
    ) {
      setSelectedProduct(ALL_PRODUCTS_FILTER)
    }
  }, [productOptions, selectedProduct])

  React.useEffect(() => {
    setCustomerSearch('')
    setSelectedProduct(ALL_PRODUCTS_FILTER)
    const customerColumn = table.getColumn('customerName')
    const productColumn = table.getColumn('productName')
    customerColumn?.setFilterValue(undefined)
    productColumn?.setFilterValue(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  return (
    <div className="w-full">
      {/* Enhanced toolbar */}
      <div className="flex flex-wrap items-center justify-between pt-4 pb-3 gap-4 min-w-0">
        {/* Title and/or Filter buttons on the left */}
        <div className="flex items-center gap-4 min-w-0 flex-shrink overflow-hidden">
          {title && (
            <h3 className="text-lg font-semibold truncate">
              {title}
            </h3>
          )}
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
          <Input
            placeholder="Search customers..."
            value={customerSearch}
            onChange={(event) =>
              handleCustomerSearchChange(event.target.value)
            }
            className="h-9 w-56"
          />
          <Select
            value={selectedProduct}
            onValueChange={setSelectedProduct}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter product" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PRODUCTS_FILTER}>
                All products
              </SelectItem>
              {productOptions.map((product) => (
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
