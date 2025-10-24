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
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { CollapsibleSearch } from '@/components/ui/collapsible-search'
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
import { columns } from './columns'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { useSearchDebounce } from '@/app/hooks/useSearchDebounce'
import { trpc } from '@/app/_trpc/client'
import { CustomerTableRowData } from '@/db/schema/customers'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

export interface CustomersTableFilters {
  archived?: boolean
  organizationId?: string
  pricingModelId?: string
}

interface CustomersDataTableProps {
  filters?: CustomersTableFilters
  title?: string
  onCreateCustomer?: () => void
  buttonVariant?:
    | 'default'
    | 'outline'
    | 'ghost'
    | 'link'
    | 'secondary'
    | 'destructive'
}

export function CustomersDataTable({
  filters = {},
  title,
  onCreateCustomer,
  buttonVariant = 'default',
}: CustomersDataTableProps) {
  const router = useRouter()

  // Server-side filtering (preserve enterprise architecture) - FIXED: Using stable debounced hook
  const { inputValue, setInputValue, searchQuery } =
    useSearchDebounce(1000)

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
  } = usePaginatedTableState<
    CustomerTableRowData,
    CustomersTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters: filters,
    searchQuery: searchQuery,
    useQuery: trpc.customers.getTableRows.useQuery,
  })

  // Reset to first page when filters change
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
  const [isExporting, setIsExporting] = React.useState(false)

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
        goToFirstPage()
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

  const hasResults = (data?.total ?? 0) > 0

  const handleExport = React.useCallback(async () => {
    setIsExporting(true)
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          return
        }
        params.set(key, String(value))
      })
      const trimmedSearch = searchQuery.trim()
      if (trimmedSearch) {
        params.set('searchQuery', trimmedSearch)
      }
      const query = params.toString()
      const response = await fetch(
        query
          ? `/api/customers/export?${query}`
          : '/api/customers/export'
      )
      if (!response.ok) {
        throw new Error('Failed to export customers')
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get(
        'Content-Disposition'
      )

      let filename = 'customers.csv'
      if (contentDisposition) {
        const utf8Match = contentDisposition.match(
          /filename\*=UTF-8''([^;]+)/i
        )
        const simpleMatch = contentDisposition.match(
          /filename="?([^\";]+)"?/i
        )
        if (utf8Match?.[1]) {
          filename = decodeURIComponent(utf8Match[1])
        } else if (simpleMatch?.[1]) {
          filename = simpleMatch[1]
        }
      }

      const fileURL = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = fileURL
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(fileURL)
    } catch (error) {
      console.error('Failed to export customers', error)
    } finally {
      setIsExporting(false)
    }
  }, [filters, searchQuery])

  return (
    <div className="w-full">
      {/* Enhanced toolbar with all improvements */}
      <div className="flex items-center justify-between pt-4 pb-3 gap-4 min-w-0">
        {/* Title on the left (for detail pages) */}
        <div className="flex items-center gap-4 min-w-0 flex-shrink overflow-hidden">
          {title && (
            <h3 className="text-lg font-semibold truncate">
              {title}
            </h3>
          )}
        </div>

        {/* Controls on the right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <CollapsibleSearch
            value={inputValue}
            onChange={setInputValue}
            placeholder="Search customers..."
            disabled={isLoading}
            isLoading={isFetching}
          />
          <DataTableViewOptions table={table} />
          {onCreateCustomer && (
            <Button
              onClick={onCreateCustomer}
              variant={buttonVariant}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Customer
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
                  // Only navigate if not clicking on interactive elements
                  const target = e.target as HTMLElement
                  if (
                    target.closest('button') ||
                    target.closest('[role="checkbox"]') ||
                    target.closest('input[type="checkbox"]') ||
                    target.closest('[data-radix-collection-item]')
                  ) {
                    return // Don't navigate when clicking interactive elements
                  }
                  router.push(
                    `/customers/${row.original.customer.id}`
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

      {/* Enterprise pagination with built-in selection count */}
      <div className="py-2">
        <DataTablePagination
          table={table}
          totalCount={data?.total}
          isFiltered={
            !!searchQuery || Object.keys(filters).length > 0
          }
          filteredCount={data?.total}
          onExport={handleExport}
          exportDisabled={!hasResults || isLoading || isFetching}
          exportLoading={isExporting}
        />
      </div>
    </div>
  )
}
