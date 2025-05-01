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
  searchParams: Promise<{
    testmode?: boolean
  }>
}

export default async function BillingPortalManagePage({
  params,
  searchParams,
}: BillingPortalManagePageProps) {
  const { organizationId, externalId } = await params
  const { testmode } = await searchParams
  const livemode = typeof testmode === 'boolean' ? !testmode : true
  const user = await stackServerApp({
    organizationId,
    externalId,
  }).getUser()
  if (!user) {
    return redirect(
      `/p/${organizationId}/${externalId}/sign-in?externalId=${encodeURIComponent(externalId)}`
    )
  }
  await validateCurrentUserBillingPortalApiKeyForOrganization({
    organizationId,
    externalId,
    livemode,
  })

  const billingPortalApiKey = await getUserBillingPortalApiKey({
    organizationId,
    user,
  })
  if (!billingPortalApiKey) {
    return redirect(
      `/p/${organizationId}/${externalId}/sign-in?externalId=${encodeURIComponent(externalId)}`
    )
  }

  const customer = await flowgladServer({
    organizationId,
    externalId,
    billingPortalApiKey,
  }).getCustomer()
  if (!customer) {
    return redirect(
      `/p/${organizationId}/${externalId}/sign-in?externalId=${encodeURIComponent(externalId)}`
    )
  }

  return (
    <BillingPage
      organizationId={organizationId}
      externalId={externalId}
    />
  )
}
