import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import Table from '@/components/ion/Table'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import { UserRecord } from '@/db/schema/users'
import { Membership } from '@/db/schema/memberships'
import TableTitle from '@/components/ion/TableTitle'
import { Plus } from 'lucide-react'
import { FallbackSkeleton } from '@/components/ion/Skeleton'
import InviteUserToOrganizationModal from '@/components/forms/InviteUserToOrganizationModal'

type OrganizationMembersTableProps = {
  data: { user: UserRecord; membership: Membership.ClientRecord }[]
  loading: boolean
}

const OrganizationMembersTable = ({
  data,
  loading,
}: OrganizationMembersTableProps) => {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)

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
      ] as ColumnDef<OrganizationMembersTableProps['data'][number]>[],
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
            <FallbackSkeleton
              showSkeleton={loading}
              className="h-16 w-full"
            >
              <Table
                columns={columns}
                data={data ?? []}
                className="bg-nav"
                bordered
              />
            </FallbackSkeleton>
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
