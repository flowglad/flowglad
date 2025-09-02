'use client'

import InternalPageContainer from '@/components/InternalPageContainer'
import PageTitle from '@/components/ion/PageTitle'
import OrganizationMembersTable from './OrganizationMembersTable'
import { useState } from 'react'
import InviteUserToOrganizationModal from '@/components/forms/InviteUserToOrganizationModal'
import { MigrationButton as Button } from '@/components/ui/button-migration'
import Breadcrumb from '@/components/navigation/Breadcrumb'

function TeammatesPage() {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
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
      </div>
    </InternalPageContainer>
  )
}

export default TeammatesPage
