import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import Table from '@/components/ion/Table'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import { UserRecord } from '@/db/schema/users'
import { Membership } from '@/db/schema/memberships'
import TableTitle from '@/components/ion/TableTitle'
import { Plus } from 'lucide-react'
import InviteUserToOrganizationModal from '@/components/forms/InviteUserToOrganizationModal'
import { trpc } from '@/app/_trpc/client'

type OrganizationMembersTableProps = {
  loading?: boolean
  data?: { user: UserRecord; membership: Membership.ClientRecord }[]
}

const OrganizationMembersTable = ({
  loading: externalLoading,
  data: externalData,
}: OrganizationMembersTableProps) => {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const pageSize = 10

  const { data, isLoading, isFetching } =
    trpc.organizations.getMembers.useQuery({
      cursor: pageIndex.toString(),
      limit: pageSize,
    })

  const handlePaginationChange = (newPageIndex: number) => {
    setPageIndex(newPageIndex)
  }

  const tableData = externalData || data?.data || []
  const total = data?.total || 0
  const pageCount = Math.ceil(total / pageSize)
  const loading = externalLoading || isLoading

  const columns = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Name" column={column} />
          ),
          accessorKey: 'name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.user.name}</span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Email" column={column} />
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
      <TableTitle
        title="Organization Members"
        buttonIcon={<Plus size={16} strokeWidth={2} />}
        buttonLabel="Invite Member"
        buttonOnClick={() => {
          setIsInviteModalOpen(true)
        }}
      />
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
      <InviteUserToOrganizationModal
        isOpen={isInviteModalOpen}
        setIsOpen={setIsInviteModalOpen}
      />
    </div>
  )
}

export default OrganizationMembersTable
