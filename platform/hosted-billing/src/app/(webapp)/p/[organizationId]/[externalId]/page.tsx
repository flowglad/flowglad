import { stackServerApp } from '@/stack'
import { redirect } from 'next/navigation'

interface BillingPortalPageProps {
  params: Promise<{
    organizationId: string
    externalId: string
  }>
  searchParams: Promise<{
    testmode?: boolean
  }>
}

export default async function BillingPortalPage({
  params,
  searchParams,
}: BillingPortalPageProps) {
  const { organizationId, externalId } = await params
  const { testmode } = await searchParams
  const user = await stackServerApp({
    organizationId,
    externalId,
  }).getUser()
  const queryParams = new URLSearchParams()
  queryParams.set('externalId', externalId)
  if (testmode) {
    queryParams.set('testmode', testmode.toString())
  }
  if (user) {
    return redirect(
      `/p/${organizationId}/${externalId}/manage?${queryParams.toString()}`
    )
  }

  return redirect(
    `/p/${organizationId}/${externalId}/sign-in?${queryParams.toString()}`
  )
}
