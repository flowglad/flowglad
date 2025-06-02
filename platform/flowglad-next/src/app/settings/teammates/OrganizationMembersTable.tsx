import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import Table from '@/components/ion/Table'
import ColumnHeaderCell from '@/components/ion/ColumnHeaderCell'
import { UserRecord } from '@/db/schema/users'
import { Membership } from '@/db/schema/memberships'
import TableTitle from '@/components/ion/TableTitle'
import { Plus } from 'lucide-react'
import InviteUserToOrganizationModal from '@/components/forms/InviteUserToOrganizationModal'
import { trpc } from '@/app/_trpc/client'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'

type OrganizationMembersTableProps = {
  loading?: boolean
  data?: { user: UserRecord; membership: Membership.ClientRecord }[]
}

const OrganizationMembersTable = ({
  loading: externalLoading,
  data: externalData,
}: OrganizationMembersTableProps) => {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)

  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    {
      user: UserRecord
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
          header: ({ column }) => (
            <ColumnHeaderCell title="Name" column={column} />
          ),
          accessorKey: 'name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.user.name}</span>
          ),
        },
        {
          header: ({ column }) => (
            <ColumnHeaderCell title="Email" column={column} />
          ),
          accessorKey: 'email',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.user.email}</span>
          ),
        },
      ] as ColumnDef<{
        user: UserRecord
        membership: Membership.ClientRecord
      }>[],
    []
  )

  return (
    <div className="w-full flex flex-col gap-5 pb-8">
      <div className="w-full flex flex-col gap-2">
        <div className="w-full flex flex-col gap-2">
          <div className="w-full flex flex-col gap-5">
            <Table
              columns={columns}
              data={tableData}
              className="bg-nav"
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
