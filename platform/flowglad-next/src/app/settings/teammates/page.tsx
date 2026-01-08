'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import InviteUserToOrganizationModal from '@/components/forms/InviteUserToOrganizationModal'
import PageContainer from '@/components/PageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { OrganizationMembersDataTable } from './data-table'

function TeammatesPage() {
  const router = useRouter()
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)

  return (
    <PageContainer>
      <div className="w-full relative flex flex-col justify-center pb-6">
        <PageHeaderNew
          title="Team"
          breadcrumb="Settings"
          onBreadcrumbClick={() => router.push('/settings')}
          className="pb-4"
          hideBorder
          actions={[
            {
              label: 'Invite Member',
              onClick: () => setIsInviteModalOpen(true),
            },
          ]}
        />
        <div className="w-full flex flex-col">
          <OrganizationMembersDataTable />
        </div>
      </div>
      <InviteUserToOrganizationModal
        isOpen={isInviteModalOpen}
        setIsOpen={setIsInviteModalOpen}
      />
    </PageContainer>
  )
}

export default TeammatesPage
