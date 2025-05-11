'use client'

import InternalPageContainer from '@/components/InternalPageContainer'
import PageTitle from '@/components/ion/PageTitle'
import OrganizationMembersTable from './OrganizationMembersTable'
import { useState } from 'react'
import InviteUserToOrganizationModal from '@/components/forms/InviteUserToOrganizationModal'
import Button from '@/components/ion/Button'

function TeammatesPage() {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)

  return (
    <InternalPageContainer>
      <div className="flex flex-row justify-between">
        <PageTitle className="mb-6">Team</PageTitle>
        <Button onClick={() => setIsInviteModalOpen(true)}>
          Invite Member
        </Button>
      </div>

      <OrganizationMembersTable />
      <InviteUserToOrganizationModal
        isOpen={isInviteModalOpen}
        setIsOpen={setIsInviteModalOpen}
      />
    </InternalPageContainer>
  )
}

export default TeammatesPage
