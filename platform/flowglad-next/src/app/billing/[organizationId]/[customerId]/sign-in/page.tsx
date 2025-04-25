import { BillingPortalSigninForm } from './BillingPortalSignInForm'

interface BillingPortalSigninPageProps {
  params: {
    organizationId: string
    customerId: string
  }
}

export default async function BillingPortalSigninPage({
  params,
}: BillingPortalSigninPageProps) {
  const { organizationId, customerId } = await params
  return (
    <BillingPortalSigninForm
      organizationId={organizationId}
      customerId={customerId}
    />
  )
}
