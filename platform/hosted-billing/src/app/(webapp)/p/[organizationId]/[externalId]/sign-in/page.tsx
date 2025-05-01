import { BillingPortalSigninForm } from './BillingPortalSignInForm'
import { notFound } from 'next/navigation'

interface BillingPortalSigninPageProps {
  params: Promise<{
    organizationId: string
    externalId?: string
  }>
  searchParams: Promise<{
    testmode?: boolean
  }>
}

export default async function BillingPortalSigninPage({
  params,
  searchParams,
}: BillingPortalSigninPageProps) {
  const { organizationId, externalId } = await params
  const { testmode } = await searchParams
  const livemode = typeof testmode === 'boolean' ? !testmode : true
  const queryParams = new URLSearchParams()
  if (externalId) {
    queryParams.set('externalId', externalId)
  }
  if (testmode) {
    queryParams.set('testmode', testmode.toString())
  }

  if (!externalId) {
    notFound()
  }

  const customerExternalId = decodeURIComponent(externalId)
  return (
    <BillingPortalSigninForm
      organizationId={organizationId}
      customerExternalId={customerExternalId}
      livemode={livemode}
    />
  )
}
