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
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import RemoveMemberModal from '@/components/forms/RemoveMemberModal'
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
  type OrganizationMemberTableMeta,
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
  const router = useRouter()
  // Page size state for server-side pagination
  const [currentPageSize, setCurrentPageSize] = React.useState(10)

  // State for remove member modal
  const [memberToRemove, setMemberToRemove] =
    React.useState<OrganizationMemberTableRowData | null>(null)

  // tRPC utils for cache invalidation
  const utils = trpc.useUtils()

  // Fetch current user's focused membership to determine their role
  const { data: focusedMembershipData } =
    trpc.organizations.getFocusedMembership.useQuery()

  // Remove member mutation
  const removeMemberMutation =
    trpc.organizations.removeMember.useMutation({
      onSuccess: (result, variables) => {
        setMemberToRemove(null)
        // Invalidate the members list to refresh the table
        utils.organizations.getMembersTableRowData.invalidate()
        utils.organizations.getMembers.invalidate()
        // If user removed themselves, redirect to settings
        if (
          focusedMembershipData?.membership.id ===
          variables.membershipId
        ) {
          router.push('/settings')
          router.refresh()
        }
      },
    })

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

  // Build the table meta for passing context to cells
  const tableMeta: OrganizationMemberTableMeta = React.useMemo(
    () => ({
      currentMembership: focusedMembershipData?.membership ?? null,
      onRemoveMember: (member: OrganizationMemberTableRowData) => {
        setMemberToRemove(member)
      },
    }),
    [focusedMembershipData?.membership]
  )

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
    meta: tableMeta,
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

      {/* Remove Member Modal */}
      {memberToRemove && (
        <RemoveMemberModal
          isOpen={true}
          setIsOpen={(open) => {
            if (!open) setMemberToRemove(null)
          }}
          membershipId={memberToRemove.membership.id}
          memberName={memberToRemove.user.name ?? ''}
          memberEmail={memberToRemove.user.email ?? ''}
          isLeaving={
            focusedMembershipData?.membership.id ===
            memberToRemove.membership.id
          }
          onConfirm={async (membershipId) => {
            await removeMemberMutation.mutateAsync({ membershipId })
          }}
        />
      )}
    </div>
  )
}
