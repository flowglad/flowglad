import { stackServerApp } from '@/stack'
import { redirect } from 'next/navigation'

interface BillingPortalPageProps {
  params: Promise<{
    organizationId: string
  }>
  searchParams: Promise<{
    externalId: string
    testmode?: boolean
  }>
}

export default async function BillingPortalPage({
  params,
  searchParams,
}: BillingPortalPageProps) {
  const { organizationId } = await params
  const { externalId, testmode } = await searchParams
  const user = await stackServerApp.getUser()
  const queryParams = new URLSearchParams()
  queryParams.set('externalId', externalId)
  if (testmode) {
    queryParams.set('testmode', testmode.toString())
  }
  if (user) {
    return redirect(
      `/${organizationId}/manage?${queryParams.toString()}`
    )
  }

  return redirect(
    `/${organizationId}/sign-in?${queryParams.toString()}`
  )
}
