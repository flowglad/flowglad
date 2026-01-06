'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { DetailLabel } from '@/components/DetailLabel'
import InnerPageContainerNew from '@/components/InnerPageContainerNew'
import OrganizationLogoInput from '@/components/OrganizationLogoInput'
import { Label } from '@/components/ui/label'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { Switch } from '@/components/ui/switch'
import { useAuthenticatedContext } from '@/contexts/authContext'

function SettingsOrganizationDetailsPage() {
  const router = useRouter()
  const { organization } = useAuthenticatedContext()
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
    return (
      <InnerPageContainerNew>
        <div className="w-full relative flex flex-col justify-center pb-6">
          <PageHeaderNew
            title="Organization Details"
            breadcrumb="Settings"
            onBreadcrumbClick={() => router.push('/settings')}
            className="pb-4"
            hideBorder
          />
          <div className="w-full px-4">
            <div>Loading...</div>
          </div>
        </div>
      </InnerPageContainerNew>
    )
  }

  return (
    <InnerPageContainerNew>
      <div className="w-full relative flex flex-col justify-center pb-6">
        <PageHeaderNew
          title="Organization Details"
          breadcrumb="Settings"
          onBreadcrumbClick={() => router.push('/settings')}
          className="pb-4"
          hideBorder
        />
        <div className="w-full flex flex-col gap-4 px-4">
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
              id="organization-logo-upload-details"
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
    </InnerPageContainerNew>
  )
}

export default SettingsOrganizationDetailsPage
