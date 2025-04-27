import { flowgladServer } from '@/flowglad'
import { validateCurrentUserBillingPortalApiKeyForOrganization } from '@/flowgladHostedBillingApi'
import { getUserBillingPortalApiKey, stackServerApp } from '@/stack'
import { redirect } from 'next/navigation'
import { BillingPage } from './BillingPage'

interface BillingPortalManagePageProps {
  params: Promise<{
    organizationId: string
    externalId: string
  }>
}

export default async function BillingPortalManagePage({
  params,
}: BillingPortalManagePageProps) {
  const { organizationId, externalId } = await params
  const user = await stackServerApp(organizationId).getUser()

  if (!user) {
    return redirect(
      `/${organizationId}/sign-in?externalId=${encodeURIComponent(externalId)}`
    )
  }

  await validateCurrentUserBillingPortalApiKeyForOrganization({
    organizationId,
  })

  const billingPortalApiKey = await getUserBillingPortalApiKey({
    organizationId,
    user,
  })
  if (!billingPortalApiKey) {
    return redirect(
      `/${organizationId}/sign-in?externalId=${encodeURIComponent(externalId)}`
    )
  }
  const customer = await flowgladServer({
    organizationId,
    billingPortalApiKey,
  }).getCustomer()

  if (!customer) {
    return redirect(
      `/${organizationId}/sign-in?externalId=${encodeURIComponent(externalId)}`
    )
  }

  return <BillingPage organizationId={organizationId} />
}
