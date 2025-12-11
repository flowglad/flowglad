'use client'
import {
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { useSearchDebounce } from '@/app/hooks/useSearchDebounce'
import { Button } from '@/components/ui/button'
import { CollapsibleSearch } from '@/components/ui/collapsible-search'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { DataTableViewOptions } from '@/components/ui/data-table-view-options'
import { FilterButtonGroup } from '@/components/ui/filter-button-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { InvoiceStatus } from '@/types'
import core from '@/utils/core'
import { columns, type InvoiceTableRowData } from './columns'

export interface InvoicesTableFilters {
  status?: InvoiceStatus
  customerId?: string
  subscriptionId?: string
}

interface InvoicesDataTableProps {
  filters?: InvoicesTableFilters
  title?: string
  onCreateInvoice?: () => void
  filterOptions?: { value: string; label: string }[]
  activeFilter?: string
  onFilterChange?: (value: string) => void
  hiddenColumns?: string[]
  columnOrder?: string[]
}

export function InvoicesDataTable({
  filters = {},
  title,
  onCreateInvoice,
  filterOptions,
  activeFilter,
  onFilterChange,
  hiddenColumns = [],
  columnOrder,
}: InvoicesDataTableProps) {
  // Page size state for server-side pagination
  const [currentPageSize, setCurrentPageSize] = React.useState(10)
  const { inputValue, setInputValue, searchQuery } =
    useSearchDebounce(300)

  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    goToFirstPage,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    InvoiceTableRowData,
    InvoicesTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters: filters,
    searchQuery,
    useQuery: trpc.invoices.getTableRows.useQuery,
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

  // Client-side sorting/filtering removed; handled server-side
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(() =>
      hiddenColumns.reduce(
        (acc, col) => ({ ...acc, [col]: false }),
        {}
      )
    )

  // Sync columnVisibility when hiddenColumns prop changes
  const hiddenColumnsKey = JSON.stringify(hiddenColumns)
  React.useEffect(() => {
    setColumnVisibility(
      hiddenColumns.reduce(
        (acc, col) => ({ ...acc, [col]: false }),
        {}
      )
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenColumnsKey])

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
      columnOrder,
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

        {/* View options and search */}
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0 justify-end">
          <CollapsibleSearch
            value={inputValue}
            onChange={setInputValue}
            placeholder={
              filters.customerId || filters.subscriptionId
                ? 'inv_id or number...'
                : 'Customer or invoice...'
            }
            isLoading={isFetching}
          />
          <DataTableViewOptions table={table} />
          {onCreateInvoice && (
            <Button onClick={onCreateInvoice}>
              <Plus className="w-4 h-4 mr-2" />
              Create Invoice
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
                    return
                  }
                  // Navigate to invoice details (opens in new tab)
                  const invoice = row.original.invoice
                  const invoiceUrl = `${core.NEXT_PUBLIC_APP_URL}/invoice/view/${invoice.organizationId}/${invoice.id}`
                  window.open(
                    invoiceUrl,
                    '_blank',
                    'noopener,noreferrer'
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
