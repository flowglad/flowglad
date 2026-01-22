import { FlowgladProvider } from '@flowglad/nextjs'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import { auth } from '@/lib/auth'

export default async function OrgRequiredLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  const activeOrganizationId = session?.session?.activeOrganizationId

  if (!activeOrganizationId) {
    redirect('/create-org')
  }

  return (
    <FlowgladProvider betterAuthBasePath="/api/auth">
      <Navbar />
      {children}
    </FlowgladProvider>
  )
}
