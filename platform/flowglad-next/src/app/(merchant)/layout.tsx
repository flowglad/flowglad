import { redirect } from 'next/navigation'
import { getSession } from '@/utils/auth'

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
