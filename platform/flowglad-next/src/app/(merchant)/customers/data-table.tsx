'use client'

import type { CustomerTableRowData } from '@db-core/schema/customers'
import {
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import { Download, Loader2, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { useSearchDebounce } from '@/app/hooks/useSearchDebounce'
import { Button } from '@/components/ui/button'
import {
  DataTableFilterPopover,
  type FilterSection,
} from '@/components/ui/data-table-filter-popover'
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
import { columns } from './columns'

export interface CustomersTableFilters {
  archived?: boolean
  organizationId?: string
  pricingModelId?: string
}

/**
 * Filter state for the customers filter popover.
 */
interface CustomerFilterValues {
  [key: string]: string
  status: string
}

/**
 * Default filter values - what the filter starts with.
 * Defaults to "Active" to match the previous Tabs implementation.
 */
const defaultFilterValues: CustomerFilterValues = {
  status: 'active',
}

/**
 * Neutral filter values - represents "no filter applied" state.
 */
const neutralFilterValues: CustomerFilterValues = {
  status: 'all',
}

const statusFilterOptions = [
  { value: 'all', label: 'All Customers' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
]

interface CustomersDataTableProps {
  /** Optional external filters (e.g., organizationId) */
  externalFilters?: Pick<
    CustomersTableFilters,
    'organizationId' | 'pricingModelId'
  >
  title?: string
  onCreateCustomer?: () => void
  buttonVariant?:
    | 'default'
    | 'outline'
    | 'ghost'
    | 'link'
    | 'secondary'
    | 'destructive'
  hiddenColumns?: string[]
}

export function CustomersDataTable({
  externalFilters = {},
  title,
  onCreateCustomer,
  buttonVariant = 'secondary',
  hiddenColumns = [],
}: CustomersDataTableProps) {
  const router = useRouter()

  // Server-side filtering (preserve enterprise architecture) - FIXED: Using stable debounced hook
  const { inputValue, setInputValue, searchQuery } =
    useSearchDebounce(300)

  // Page size state for server-side pagination
  const [currentPageSize, setCurrentPageSize] = React.useState(10)

  // Filter state for status (active/archived)
  const [filterValues, setFilterValues] =
    React.useState<CustomerFilterValues>(defaultFilterValues)

  // Build filter sections for the popover
  const filterSections: FilterSection[] = React.useMemo(
    () => [
      {
        id: 'status',
        label: 'Status',
        type: 'single-select' as const,
        options: statusFilterOptions,
      },
    ],
    []
  )

  // Derive server filters from UI filter state
  const derivedFilters = React.useMemo((): CustomersTableFilters => {
    const filters: CustomersTableFilters = {
      ...externalFilters,
    }

    // Apply status filter
    if (filterValues.status === 'active') {
      filters.archived = false
    } else if (filterValues.status === 'archived') {
      filters.archived = true
    }
    // 'all' means no archived filter

    return filters
  }, [filterValues, externalFilters])

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
    filters: derivedFilters,
    searchQuery: searchQuery,
    useQuery: trpc.customers.getTableRows.useQuery,
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

  // Client-side sorting/filtering removed; handled server-side
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(() =>
      Object.fromEntries(hiddenColumns.map((col) => [col, false]))
    )
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
    enableSorting: false, // Disable header sorting UI/interactions
    manualPagination: true, // Server-side pagination
    manualSorting: true, // Disable client-side sorting
    manualFiltering: true, // Disable client-side filtering
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

  const hasResults = (data?.total ?? 0) > 0

  const exportCsvMutation = trpc.customers.exportCsv.useMutation()

  // Calculate if any filter deviates from neutral (for pagination display)
  const hasActiveFilters =
    filterValues.status !== neutralFilterValues.status

  const handleExport = React.useCallback(async () => {
    setIsExporting(true)
    try {
      const trimmedSearch = searchQuery.trim()

      const result = await exportCsvMutation.mutateAsync({
        filters: derivedFilters,
        searchQuery: trimmedSearch || undefined,
      })

      if (result.asyncExportStarted) {
        toast.success(
          "CSV export started! We'll email you when it's ready."
        )
        return
      }

      if (result.csv && result.filename) {
        const blob = new Blob([result.csv], {
          type: 'text/csv;charset=utf-8',
        })
        const fileURL = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = fileURL
        link.download = result.filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.URL.revokeObjectURL(fileURL)
      } else {
        console.warn('No CSV or filename in result:', result)
      }
    } catch (error) {
      console.error('Failed to export customers', error)
      toast.error(
        'Failed to export customers. Please try again later.'
      )
    } finally {
      setIsExporting(false)
    }
  }, [derivedFilters, searchQuery, exportCsvMutation])

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
            placeholder: 'Search customers...',
          }}
          actionButton={
            onCreateCustomer
              ? {
                  onClick: onCreateCustomer,
                  text: 'Create Customer',
                  variant: buttonVariant,
                }
              : undefined
          }
          isLoading={isLoading}
          isFetching={isFetching}
        >
          <DataTableFilterPopover
            sections={filterSections}
            values={filterValues}
            onChange={setFilterValues}
            defaultValues={defaultFilterValues}
            neutralValues={neutralFilterValues}
            disabled={isLoading}
            triggerLabel={
              statusFilterOptions.find(
                (opt) => opt.value === filterValues.status
              )?.label ?? 'All Customers'
            }
            triggerVariant="secondary"
            triggerIcon="chevron"
            excludeFromBadgeCount={['status']}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            disabled={
              !hasResults || isLoading || isFetching || isExporting
            }
            className="flex-1 sm:flex-none"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
        </DataTableToolbar>
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
              const isArchived = row.original.customer.archived
              return (
                <TableRow
                  key={row.id}
                  className={`cursor-pointer ${isFetching ? 'opacity-50' : ''} ${isArchived ? 'text-muted-foreground' : ''}`}
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

      {/* Enterprise pagination with built-in selection count */}
      <div className="py-2 px-6">
        <DataTablePagination
          table={table}
          totalCount={data?.total}
          isFiltered={hasActiveFilters || !!searchQuery}
          filteredCount={data?.total}
          entityName="customer"
        />
      </div>
    </div>
  )
}
