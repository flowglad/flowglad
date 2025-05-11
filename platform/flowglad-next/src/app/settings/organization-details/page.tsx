'use client'

import { useAuthenticatedContext } from '@/contexts/authContext'
import { DetailLabel } from '@/components/DetailLabel'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import InternalPageContainer from '@/components/InternalPageContainer'
import PageTitle from '@/components/ion/PageTitle'

function SettingsOrganizationDetailsPage() {
  const { organization } = useAuthenticatedContext()
  if (!organization) {
    return <div>Loading...</div>
  }
  return (
    <InternalPageContainer>
      <PageTitle className="mb-6">Organization Details</PageTitle>
      <div className="flex flex-col gap-6">
        <DetailLabel label="Name" value={organization.name} />
        <div className="flex flex-col gap-0.5">
          <div className="text-xs font-medium text-secondary">ID</div>
          <CopyableTextTableCell copyText={organization.id}>
            {organization.id}
          </CopyableTextTableCell>
        </div>
      </div>
    </InternalPageContainer>
  )
}

export default SettingsOrganizationDetailsPage
