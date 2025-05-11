'use client'

import InternalPageContainer from '@/components/InternalPageContainer'
import PageTitle from '@/components/ion/PageTitle'
import OrganizationMembersTable from './OrganizationMembersTable'

function TeammatesPage() {
  return (
    <InternalPageContainer>
      <PageTitle className="mb-6">Team</PageTitle>
      <OrganizationMembersTable />
    </InternalPageContainer>
  )
}

export default TeammatesPage
