'use client'

import InternalPageContainer from '@/components/InternalPageContainer'
import { PageHeader } from '@/components/ui/page-header'
import { OrganizationMembersDataTable } from './data-table'
import { useState } from 'react'
import InviteUserToOrganizationModal from '@/components/forms/InviteUserToOrganizationModal'
import Breadcrumb from '@/components/navigation/Breadcrumb'

function TeammatesPage() {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader title="Team" className="mb-6" />

        <OrganizationMembersDataTable
          onInviteMember={() => setIsInviteModalOpen(true)}
        />
        <InviteUserToOrganizationModal
          isOpen={isInviteModalOpen}
          setIsOpen={setIsInviteModalOpen}
        />
      </div>
    </InternalPageContainer>
  )
}

export default TeammatesPage
