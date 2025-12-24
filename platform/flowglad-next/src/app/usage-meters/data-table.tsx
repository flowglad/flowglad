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
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { useSearchDebounce } from '@/app/hooks/useSearchDebounce'
import { Button } from '@/components/ui/button'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { InlineSearch } from '@/components/ui/inline-search'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { columns } from './columns'

export interface UsageMetersTableFilters {
  pricingModelId?: string
}

interface UsageMetersDataTableProps {
  filters?: UsageMetersTableFilters
  title?: string
  onCreateUsageMeter?: () => void
  buttonVariant?:
    | 'default'
    | 'outline'
    | 'ghost'
    | 'link'
    | 'secondary'
    | 'destructive'
}

export function UsageMetersDataTable({
  filters = {},
  title,
  onCreateUsageMeter,
  buttonVariant = 'secondary',
}: UsageMetersDataTableProps) {
  const router = useRouter()

  // Server-side search with debounce
  const { inputValue, setInputValue, searchQuery } =
    useSearchDebounce(300)

  // Dynamic page size state (REQUIRED for server-side pagination)
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
    UsageMeter.TableRow,
    UsageMetersTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters,
    searchQuery: searchQuery,
    useQuery: trpc.usageMeters.getTableRows.useQuery,
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
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: {
      size: 150,
      minSize: 20,
      maxSize: 500,
    },
    manualPagination: true,
    manualSorting: false,
    manualFiltering: false,
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
      // Handle page index changes
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

  return (
    <div className="w-full">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 pt-1 pb-2 px-4">
        {/* Title row (for detail pages) */}
        {title && (
          <div>
            <h3 className="text-lg truncate">{title}</h3>
          </div>
        )}
        {/* Redesigned toolbar matching Figma specs */}
        <div className="flex items-center gap-1">
          <InlineSearch
            value={inputValue}
            onChange={setInputValue}
            placeholder="Search usage meters..."
            isLoading={isFetching}
            disabled={isLoading}
            className="flex-1"
          />
          {onCreateUsageMeter && (
            <Button
              onClick={onCreateUsageMeter}
              variant={buttonVariant}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Usage Meter
            </Button>
          )}
        </div>
      </div>

      {/* Table - NO extra wrapper div */}
      <Table className="w-full" style={{ tableLayout: 'fixed' }}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="hover:bg-transparent"
            >
              {headerGroup.headers.map((header) => (
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
              ))}
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
              const navigateToUsageMeter = () => {
                router.push(
                  `/usage-meters/${row.original.usageMeter.id}`
                )
              }
              return (
                <TableRow
                  key={row.id}
                  className={`cursor-pointer ${isFetching ? 'opacity-50' : ''}`}
                  tabIndex={0}
                  role="link"
                  onClick={(e) => {
                    const target = e.target
                    if (!(target instanceof Element)) {
                      return
                    }
                    if (
                      target.closest('button') ||
                      target.closest('[role="checkbox"]') ||
                      target.closest('input[type="checkbox"]')
                    ) {
                      return
                    }
                    navigateToUsageMeter()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      const target = e.target
                      if (!(target instanceof Element)) {
                        return
                      }
                      if (
                        target.closest('button') ||
                        target.closest('[role="checkbox"]') ||
                        target.closest('input[type="checkbox"]')
                      ) {
                        return
                      }
                      e.preventDefault()
                      navigateToUsageMeter()
                    }
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

      {/* Pagination */}
      <div className="py-2 px-2">
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
