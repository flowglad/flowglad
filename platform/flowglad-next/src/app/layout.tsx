import { StackProvider, StackTheme } from '@stackframe/stack'
import { stackServerApp } from '../stack'
import { Toaster } from 'sonner'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

import Providers from './Providers'
import { cn } from '@/utils/core'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { Organization } from '@/db/schema/organizations'
// import AIModal from './components/forms/AIModal'
// import { ChatActionsProvider } from './components/ChatActionsContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Flowglad',
  description: 'Make more internet money',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = await stackServerApp.getUser()
  let organization: Organization.Record | undefined = undefined
  let livemode: boolean = true
  if (user) {
    const [membershipData] = await adminTransaction(
      async ({ transaction }) => {
        return await selectMembershipAndOrganizations(
          {
            userId: user.id,
            focused: true,
          },
          transaction
        )
      }
    )
    livemode = membershipData?.membership.livemode
    organization = membershipData?.organization
  }
  const userJson = user?.toClientJson()
  return (
    <html lang="en" className="dark h-full">
      <body className={cn(inter.className, 'dark', 'h-full')}>
        <StackProvider app={stackServerApp}>
          <StackTheme>
            <Providers
              authContext={{
                organization,
                livemode,
                user: userJson,
              }}
            >
              {/* {!livemode && (
            <div className="h-12 w-full bg-orange-primary-500"></div>
          )} */}
              <Toaster />
              {/* <ChatActionsProvider>
            <AIModal />
          </ChatActionsProvider> */}
              {children}
            </Providers>
          </StackTheme>
        </StackProvider>
      </body>
    </html>
  )
}
