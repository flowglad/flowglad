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
import { columns, OrganizationMemberTableRowData } from './columns'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { trpc } from '@/app/_trpc/client'
import debounce from 'debounce'
import { UserPlus, Search } from 'lucide-react'

export interface OrganizationMembersTableFilters
  extends Record<string, never> {
  // No filters needed for this simple table
}

interface OrganizationMembersDataTableProps {
  filters?: OrganizationMembersTableFilters
  onInviteMember?: () => void
  // Support for external data (backward compatibility)
  loading?: boolean
  data?: OrganizationMemberTableRowData[]
}

export function OrganizationMembersDataTable({
  filters = {},
  onInviteMember,
  loading: externalLoading,
  data: externalData,
}: OrganizationMembersDataTableProps) {
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
    OrganizationMemberTableRowData,
    OrganizationMembersTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters: filters,
    searchQuery: searchQuery,
    useQuery: trpc.organizations.getMembersTableRowData.useQuery,
  })

  // Client-side features (Shadcn patterns)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})

  // Use external data if provided (for backward compatibility)
  const tableData = externalData || data?.items || []
  const isTableLoading = externalLoading || isLoading
  const isTableFetching = isFetching
  const totalCount = data?.total || tableData.length

  const table = useReactTable({
    data: tableData,
    columns,
    manualPagination: !externalData, // Use server-side pagination only when not using external data
    manualSorting: false, // Client-side sorting on current page
    manualFiltering: false, // Client-side filtering on current page
    pageCount: externalData
      ? Math.ceil(tableData.length / currentPageSize)
      : Math.ceil((totalCount || 0) / currentPageSize),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,

    // CRITICAL: Bridge TanStack Table pagination to server-side pagination
    onPaginationChange: (updater) => {
      if (externalData) return // Skip if using external data

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
    getPaginationRowModel: getPaginationRowModel(),

    // CRITICAL: Use dynamic page size in state
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination: {
        pageIndex: externalData ? 0 : pageIndex,
        pageSize: currentPageSize,
      },
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
            placeholder="Search team members..."
            disabled={isTableLoading}
            isLoading={isTableFetching}
          />
          <DataTableViewOptions table={table} />
          {onInviteMember && (
            <Button onClick={onInviteMember}>
              <UserPlus className="w-4 h-4 mr-2" />
              Invite Member
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="border-t border-b">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="hover:bg-transparent"
              >
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
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
            {isTableLoading ? (
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
                  className={isTableFetching ? 'opacity-50' : ''}
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
      </div>

      {/* Enhanced pagination with proper spacing */}
      <div className="py-2">
        <DataTablePagination
          table={table}
          totalCount={totalCount}
          isFiltered={
            !!searchQuery || Object.keys(filters).length > 0
          }
          filteredCount={data?.total}
        />
      </div>
    </div>
  )
}
