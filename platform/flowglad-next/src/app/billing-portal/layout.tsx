import { Metadata } from 'next'
import Providers from '../Providers'
import { getSession } from '@/utils/auth'
import { betterAuthUserToApplicationUser } from '@/utils/authHelpers'

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
  const session = await getSession()

  return (
    <Providers
      authContext={{
        organization: undefined,
        livemode: false,
        user: session
          ? await betterAuthUserToApplicationUser(session?.user)
          : undefined,
        role: 'customer',
      }}
    >
      {children}
    </Providers>
  )
}
