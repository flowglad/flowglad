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
import { UserPlus } from 'lucide-react'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { Button } from '@/components/ui/button'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  columns,
  type OrganizationMemberTableRowData,
} from './columns'

export type OrganizationMembersTableFilters = {}

interface OrganizationMembersDataTableProps {
  filters?: OrganizationMembersTableFilters
  onInviteMember?: () => void
}

export function OrganizationMembersDataTable({
  filters = {},
  onInviteMember,
}: OrganizationMembersDataTableProps) {
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
    OrganizationMemberTableRowData,
    Record<string, never>
  >({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters: {},
    useQuery: trpc.organizations.getMembersTableRowData.useQuery,
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

  return (
    <div className="w-full">
      {/* Toolbar */}
      {onInviteMember && (
        <div className="flex items-center justify-end pt-1 pb-2 px-4">
          <Button
            onClick={onInviteMember}
            variant="secondary"
            size="sm"
          >
            <UserPlus className="w-4 h-4" />
            Invite Teammate
          </Button>
        </div>
      )}

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
                No team members found.
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
          isFiltered={Object.keys(filters).length > 0}
          filteredCount={data?.total}
          entityName="teammate"
        />
      </div>
    </div>
  )
}
