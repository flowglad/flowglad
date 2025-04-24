import { BillingPortalSigninForm } from './BillingPortalSignInForm'
import { notFound } from 'next/navigation'

interface BillingPortalSigninPageProps {
  params: {
    organizationId: string
  }
  searchParams: {
    id?: string
  }
}

export default async function BillingPortalSigninPage({
  params,
  searchParams,
}: BillingPortalSigninPageProps) {
  const { organizationId } = params

  if (!searchParams.id) {
    notFound()
  }

  const customerExternalId = decodeURIComponent(searchParams.id)

  return (
    <BillingPortalSigninForm
      organizationId={organizationId}
      customerExternalId={customerExternalId}
    />
  )
}
