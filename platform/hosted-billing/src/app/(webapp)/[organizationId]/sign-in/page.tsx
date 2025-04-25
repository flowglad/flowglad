import { BillingPortalSigninForm } from './BillingPortalSignInForm'
import { notFound } from 'next/navigation'

interface BillingPortalSigninPageProps {
  params: Promise<{
    organizationId: string
  }>
  searchParams: Promise<{
    externalId?: string
  }>
}

export default async function BillingPortalSigninPage({
  params,
  searchParams,
}: BillingPortalSigninPageProps) {
  const { organizationId } = await params
  const { externalId } = await searchParams

  if (!externalId) {
    notFound()
  }

  const customerExternalId = decodeURIComponent(externalId)

  return (
    <BillingPortalSigninForm
      organizationId={organizationId}
      customerExternalId={customerExternalId}
    />
  )
}
