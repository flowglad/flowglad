'use client'

import { useAuthenticatedContext } from '@/contexts/authContext'
import { DetailLabel } from '@/components/DetailLabel'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import InternalPageContainer from '@/components/InternalPageContainer'
import PageTitle from '@/components/ion/PageTitle'
import Breadcrumb from '@/components/navigation/Breadcrumb'

function SettingsOrganizationDetailsPage() {
  const { organization } = useAuthenticatedContext()
  if (!organization) {
    return <div>Loading...</div>
  }
  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageTitle className="mb-6">Organization Details</PageTitle>
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
    </InternalPageContainer>
  )
}

export default SettingsOrganizationDetailsPage
