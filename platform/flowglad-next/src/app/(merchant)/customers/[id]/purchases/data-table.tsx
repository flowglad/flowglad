'use client'

import { PurchaseStatus } from '@db-core/enums'
import {
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import { useRouter } from 'next/navigation'
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
import { columns, type PurchaseTableRowData } from './columns'

export interface PurchasesTableFilters {
  customerId?: string
  status?: PurchaseStatus
  organizationId?: string
}

const statusFilterOptions = [
  { value: 'all', label: 'All' },
  { value: PurchaseStatus.Open, label: 'Open' },
  { value: PurchaseStatus.Pending, label: 'Pending' },
  { value: PurchaseStatus.Paid, label: 'Paid' },
  { value: PurchaseStatus.Failed, label: 'Failed' },
  { value: PurchaseStatus.Refunded, label: 'Refunded' },
  { value: PurchaseStatus.PartialRefund, label: 'Partial Refund' },
  { value: PurchaseStatus.Fraudulent, label: 'Fraudulent' },
]

interface PurchasesDataTableProps {
  filters?: PurchasesTableFilters
  hiddenColumns?: string[]
}

export function PurchasesDataTable({
  filters = {},
  hiddenColumns = [],
}: PurchasesDataTableProps) {
  const router = useRouter()

  // Server-side filtering with debounced search
  const { inputValue, setInputValue, searchQuery } =
    useSearchDebounce(300)

  // Page size state for server-side pagination
  const [currentPageSize, setCurrentPageSize] = React.useState(10)

  // Status filter state - default to 'all'
  const [statusFilter, setStatusFilter] = React.useState('all')

  // Derive server filters from UI state
  const derivedFilters = React.useMemo((): PurchasesTableFilters => {
    const derivedFiltersObj: PurchasesTableFilters = {
      ...filters,
    }

    if (statusFilter !== 'all') {
      derivedFiltersObj.status = statusFilter as PurchaseStatus
    }

    return derivedFiltersObj
  }, [statusFilter, filters])

  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    goToFirstPage,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    PurchaseTableRowData,
    PurchasesTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters: derivedFilters,
    searchQuery,
    useQuery: trpc.purchases.getTableRows.useQuery,
  })

  // Reset to first page when filters change
  const filtersKey = JSON.stringify(derivedFilters)
  React.useEffect(() => {
    goToFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  // Reset to first page when debounced search changes
  React.useEffect(() => {
    goToFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

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
    enableSorting: false,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: Math.ceil((data?.total || 0) / currentPageSize),
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
        <DataTableToolbar
          search={{
            value: inputValue,
            onChange: setInputValue,
            placeholder:
              'Search by product, customer, or purchase_id',
          }}
          filter={{
            value: statusFilter,
            options: statusFilterOptions,
            onChange: setStatusFilter,
          }}
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
                    `/finance/purchases/${row.original.purchase.id}`
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
      <div className="py-2 px-6">
        <DataTablePagination
          table={table}
          totalCount={data?.total}
          isFiltered={statusFilter !== 'all' || !!searchQuery}
          filteredCount={data?.total}
          entityName="purchase"
        />
      </div>
    </div>
  )
}
