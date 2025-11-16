'use client'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { DetailLabel } from '@/components/DetailLabel'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { PageHeader } from '@/components/ui/page-header'
import { OrganizationMembersDataTable } from '@/app/settings/teammates/data-table'
import InviteUserToOrganizationModal from '@/components/forms/InviteUserToOrganizationModal'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { trpc } from '@/app/_trpc/client'
import { toast } from 'sonner'
import OrganizationLogoInput from '@/components/OrganizationLogoInput'

const OrganizationSettingsTab = () => {
  const { organization } = useAuthenticatedContext()
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const trpcContext = trpc.useContext()

  const updateOrganizationMutation =
    trpc.organizations.update.useMutation({
      onSuccess: async () => {
        toast.success('Organization settings updated successfully')
        await trpcContext.organizations.getFocusedMembership.invalidate()
      },
      onError: (error) => {
        toast.error(
          error.message || 'Failed to update organization settings'
        )
      },
    })

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
          <div className="flex flex-col gap-0.5">
            <OrganizationLogoInput
              value={organization.logoURL}
              onUploadComplete={(publicURL) => {
                updateOrganizationMutation.mutate({
                  organization: {
                    id: organization.id,
                    logoURL: publicURL,
                  },
                })
              }}
              onUploadDeleted={() => {
                updateOrganizationMutation.mutate({
                  organization: {
                    id: organization.id,
                    logoURL: null,
                  },
                })
              }}
              id="organization-logo-upload-settings"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="multiple-subscriptions">
                  Allow Multiple Subscriptions Per Customer
                </Label>
                <div className="text-xs text-muted-foreground">
                  Enable customers to have multiple active
                  subscriptions simultaneously
                </div>
              </div>
              <Switch
                id="multiple-subscriptions"
                checked={
                  organization.allowMultipleSubscriptionsPerCustomer ??
                  false
                }
                onCheckedChange={(checked) => {
                  updateOrganizationMutation.mutate({
                    organization: {
                      id: organization.id,
                      allowMultipleSubscriptionsPerCustomer: checked,
                    },
                  })
                }}
                disabled={updateOrganizationMutation.isPending}
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <OrganizationMembersDataTable
          title="Team"
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
