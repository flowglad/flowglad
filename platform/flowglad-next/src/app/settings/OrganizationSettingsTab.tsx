'use client'
import { useState } from 'react'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { DetailLabel } from '@/components/DetailLabel'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { OrganizationMembersDataTable } from '@/app/settings/teammates/data-table'
import InviteUserToOrganizationModal from '@/components/forms/InviteUserToOrganizationModal'
import { TableHeader } from '@/components/ui/table-header'

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
        <TableHeader title="Team" noButtons />
        <OrganizationMembersDataTable
          onInviteMember={() => setIsInviteModalOpen(true)}
        />
        <InviteUserToOrganizationModal
          isOpen={isInviteModalOpen}
          setIsOpen={setIsInviteModalOpen}
        />
      </div>
    </div>
  )
}

export default OrganizationSettingsTab
