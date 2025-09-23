import { useMemo } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { User } from '@/db/schema/users'
import { Membership } from '@/db/schema/memberships'
import { trpc } from '@/app/_trpc/client'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'

type OrganizationMembersTableProps = {
  loading?: boolean
  data?: { user: User.Record; membership: Membership.ClientRecord }[]
}

const OrganizationMembersTable = ({
  loading: _externalLoading,
  data: externalData,
}: OrganizationMembersTableProps) => {

  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    {
      user: User.Record
      membership: Membership.ClientRecord
    },
    {}
  >({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters: {},
    useQuery: trpc.organizations.getMembersTableRowData.useQuery,
  })

  const tableData = externalData || data?.items || []
  const total = data?.total || 0

  const columns = useMemo(
    () =>
      [
        {
          header: 'Name',
          accessorKey: 'name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.user.name}</span>
          ),
        },
        {
          header: 'Email',
          accessorKey: 'email',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.user.email}</span>
          ),
        },
      ] as ColumnDef<{
        user: User.Record
        membership: Membership.ClientRecord
      }>[],
    []
  )

  return (
    <div className="w-full flex flex-col gap-5 pb-8">
      <div className="w-full flex flex-col gap-2">
        <div className="w-full flex flex-col gap-2">
          <div className="w-full flex flex-col gap-5">
            <DataTable
              columns={columns}
              data={tableData}
              className="bg-background"
              bordered
              pagination={{
                pageIndex,
                pageSize,
                total,
                onPageChange: handlePaginationChange,
                isLoading,
                isFetching,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default OrganizationMembersTable
