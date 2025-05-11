import { useAuthenticatedContext } from '@/contexts/authContext'
import { DetailLabel } from '@/components/DetailLabel'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'

function SettingsOrganizationDetailsPage() {
  const { organization } = useAuthenticatedContext()
  if (!organization) {
    return <div>Loading...</div>
  }
  return (
    <div className="flex flex-col gap-6">
      <DetailLabel label="Name" value={organization.name} />

      <div className="flex flex-col gap-0.5">
        <div className="text-xs font-medium text-secondary">ID</div>
        <CopyableTextTableCell copyText={organization.id}>
          {organization.id}
        </CopyableTextTableCell>
      </div>
    </div>
  )
}

export default SettingsOrganizationDetailsPage
