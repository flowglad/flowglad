'use client'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { DetailLabel } from '@/components/DetailLabel'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import PageTitle from '@/components/ion/PageTitle'
import OrganizationMembersTable from '@/app/settings/teammates/OrganizationMembersTable'
import InviteUserToOrganizationModal from '@/components/forms/InviteUserToOrganizationModal'
import { Button } from '@/components/ui/button'
import TableTitle from '@/components/ion/TableTitle'

const OrganizationSettingsTab = () => {
  const { organization } = useAuthenticatedContext()
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)

  if (!organization) {
    return <div>Loading...</div>
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex flex-col gap-6">
          <DetailLabel label="Name" value={organization.name} />
          <div className="flex flex-col gap-0.5">
            <div className="text-xs font-medium text-muted-foreground">
              ID
            </div>
            <CopyableTextTableCell copyText={organization.id}>
              {organization.id}
            </CopyableTextTableCell>
          </div>
        </div>
      </div>

      <div>
        <div className="flex flex-row justify-between items-start mb-4">
          <TableTitle title="Team" noButtons />
          <Button
            onClick={() => setIsInviteModalOpen(true)}
            size="sm"
            variant="outline"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            Invite Member
          </Button>
        </div>
        <OrganizationMembersTable />
        <InviteUserToOrganizationModal
          isOpen={isInviteModalOpen}
          setIsOpen={setIsInviteModalOpen}
        />
      </div>
    </div>
  )
}

export default OrganizationSettingsTab
