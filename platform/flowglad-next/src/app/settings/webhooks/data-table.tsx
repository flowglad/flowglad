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
import { columns, WebhookTableRowData } from './columns'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { trpc } from '@/app/_trpc/client'
import debounce from 'debounce'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'

export interface WebhooksTableFilters {
  active?: boolean
  organizationId?: string
}

interface WebhooksDataTableProps {
  filters?: WebhooksTableFilters
  onCreateWebhook?: () => void
}

export function WebhooksDataTable({
  filters = {},
  onCreateWebhook,
}: WebhooksDataTableProps) {
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
  } = usePaginatedTableState<
    WebhookTableRowData,
    WebhooksTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters: filters,
    searchQuery: searchQuery,
    useQuery: trpc.webhooks.getTableRows.useQuery,
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

    // CRITICAL: Bridge TanStack Table pagination to server-side pagination
    onPaginationChange: (updater) => {
      const newPagination =
        typeof updater === 'function'
          ? updater({ pageIndex, pageSize: currentPageSize })
          : updater

      // Handle page size changes
      if (newPagination.pageSize !== currentPageSize) {
        setCurrentPageSize(newPagination.pageSize)
        handlePaginationChange(0) // Reset to first page
      }
      // Handle page navigation
      else if (newPagination.pageIndex !== pageIndex) {
        handlePaginationChange(newPagination.pageIndex)
      }
    },

    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),

    // CRITICAL: Use dynamic page size in state
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
      <div className="flex items-center py-4">
        <div className="flex items-center gap-2 ml-auto">
          <CollapsibleSearch
            value={inputValue}
            onChange={setInputValue}
            placeholder="Search webhooks..."
            disabled={isLoading}
            isLoading={isFetching}
          />
          <DataTableViewOptions table={table} />
          {onCreateWebhook && (
            <Button onClick={onCreateWebhook}>
              <Plus className="w-4 h-4 mr-2" />
              Create Webhook
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
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
                    return // Don't navigate when clicking interactive elements
                  }
                  // Navigate to webhook details if needed
                  // router.push(`/settings/webhooks/${row.original.webhook.id}`)
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
