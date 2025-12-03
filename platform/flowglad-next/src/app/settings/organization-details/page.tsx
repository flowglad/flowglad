'use client'

import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { DetailLabel } from '@/components/DetailLabel'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'
import { useAuthenticatedContext } from '@/contexts/authContext'

function SettingsOrganizationDetailsPage() {
  const { organization } = useAuthenticatedContext()
  if (!organization) {
    return <div>Loading...</div>
  }
  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader title="Organization Details" className="mb-6" />
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
