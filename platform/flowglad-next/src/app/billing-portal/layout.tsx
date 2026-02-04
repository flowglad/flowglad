import type { Metadata } from 'next'
import { getCustomerSession } from '@/utils/auth'
import { betterAuthUserToApplicationUser } from '@/utils/authHelpers'
import Providers from '../Providers'

export const metadata: Metadata = {
  title: 'Billing Portal - Flowglad',
  description:
    'Manage your subscription, payment methods, and invoices',
}

export default async function BillingPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Use customer session for billing portal - not merchant session
  const session = await getCustomerSession()

  return (
    <Providers
      authContext={{
        organization: undefined,
        livemode: false,
        user: session
          ? await betterAuthUserToApplicationUser(session?.user)
          : undefined,
        role: 'customer',
        authenticated: !!session?.user,
      }}
    >
      {children}
    </Providers>
  )
}
