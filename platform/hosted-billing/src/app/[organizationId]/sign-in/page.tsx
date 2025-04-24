import { BillingPortalSigninForm } from './BillingPortalSignInForm'
import { notFound } from 'next/navigation'

interface BillingPortalSigninPageProps {
  params: {
    organizationId: string
  }
  searchParams: {
    externalId?: string
  }
}

export default async function BillingPortalSigninPage({
  params,
  searchParams,
}: BillingPortalSigninPageProps) {
  const { organizationId } = params

  if (!searchParams.externalId) {
    notFound()
  }

  const customerExternalId = decodeURIComponent(
    searchParams.externalId
  )

  return (
    <BillingPortalSigninForm
      organizationId={organizationId}
      customerExternalId={customerExternalId}
    />
  )
}
