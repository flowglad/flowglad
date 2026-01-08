'use client'

import {
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { useSearchDebounce } from '@/app/hooks/useSearchDebounce'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { DataTableToolbar } from '@/components/ui/data-table-toolbar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Payment } from '@/db/schema/payments'
import type { PaymentStatus } from '@/types'
import { columns } from './columns'

export interface PaymentsTableFilters {
  status?: PaymentStatus
  customerId?: string
  organizationId?: string
  subscriptionId?: string
  invoiceId?: string
}

interface PaymentsDataTableProps {
  filters?: PaymentsTableFilters
  title?: string
  filterOptions?: { value: string; label: string }[]
  filterValue?: string
  onFilterChange?: (value: string) => void
  hiddenColumns?: string[]
}

export function PaymentsDataTable({
  filters = {},
  title,
  filterOptions,
  filterValue,
  onFilterChange,
  hiddenColumns = [],
}: PaymentsDataTableProps) {
  // Page size state for server-side pagination
  const [currentPageSize, setCurrentPageSize] = React.useState(10)
  const { inputValue, setInputValue, searchQuery } =
    useSearchDebounce(300)

  const {
    pageIndex,
    handlePaginationChange,
    goToFirstPage,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    Payment.TableRowData,
    PaymentsTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters: filters,
    searchQuery,
    useQuery: trpc.payments.getTableRows.useQuery,
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

  // Client-side visibility/sizing (sorting handled server-side)
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(() =>
      hiddenColumns.reduce(
        (acc, col) => ({ ...acc, [col]: false }),
        {}
      )
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
    enableSorting: false, // Disable header sorting UI/interactions
    manualPagination: true, // Server-side pagination
    manualSorting: true, // Disable client-side sorting
    manualFiltering: true, // Disable client-side filtering
    pageCount: Math.ceil((data?.total || 0) / currentPageSize),
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
    state: {
      columnVisibility,
      columnSizing,
      pagination: { pageIndex, pageSize: currentPageSize },
    },
  })

  return (
    <div className="w-full">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 pt-1 pb-2 px-6">
        {/* Title row */}
        {title && (
          <div>
            <h3 className="text-lg truncate">{title}</h3>
          </div>
        )}
        {/* Toolbar */}
        <DataTableToolbar
          search={{
            value: inputValue,
            onChange: setInputValue,
            placeholder:
              filters.customerId || filters.subscriptionId
                ? 'Search payment_id...'
                : 'Customer or payment_id...',
          }}
          filter={
            filterOptions && filterValue && onFilterChange
              ? {
                  value: filterValue,
                  options: filterOptions,
                  onChange: onFilterChange,
                }
              : undefined
          }
          isLoading={isLoading}
          isFetching={isFetching}
        />
      </div>

      {/* Table */}
      <Table style={{ tableLayout: 'fixed' }}>
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
                className={isFetching ? 'opacity-50' : ''}
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
      <div className="py-2 px-4">
        <DataTablePagination
          table={table}
          totalCount={data?.total}
          isFiltered={
            !!searchQuery || Object.keys(filters).length > 0
          }
          filteredCount={data?.total}
          entityName="payment"
        />
      </div>
    </div>
  )
}
