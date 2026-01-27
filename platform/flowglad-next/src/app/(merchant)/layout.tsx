import { redirect } from 'next/navigation'
import { getSession } from '@/utils/auth'

/**
 * Layout for merchant routes that guards against unauthenticated access.
 * If no session exists, redirects to /sign-in.
 *
 * This layout is used for all merchant dashboard routes (dashboard, customers,
 * products, etc.) and provides an additional layer of protection on top of
 * the middleware-based auth checks.
 */
export default async function MerchantLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) {
    redirect('/sign-in')
  }
  return <>{children}</>
}
