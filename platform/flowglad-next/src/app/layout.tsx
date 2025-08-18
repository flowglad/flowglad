import { Toaster } from 'sonner'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

import Providers from './Providers'
import { cn } from '@/utils/core'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import {
  insertUser,
  selectUsers,
  UserRecord,
} from '@/db/tableMethods/userMethods'
import {
  Organization,
  organizationsClientSelectSchema,
} from '@/db/schema/organizations'
import { auth, getSession } from '@/utils/auth'
import { headers } from 'next/headers'
import { betterAuthUserToApplicationUser } from '@/utils/authHelpers'

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
  const session = await getSession()
  let organization: Organization.ClientRecord | undefined = undefined
  let livemode: boolean = true
  let user: UserRecord | undefined = undefined
  if (session) {
    user = await betterAuthUserToApplicationUser(session.user)
    const [membershipData] = await adminTransaction(
      async ({ transaction }) => {
        if (!user) {
          throw new Error('User not found')
        }
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
    if (membershipData?.organization && membershipData.membership) {
      organization = organizationsClientSelectSchema.parse(
        membershipData.organization
      )
    }
  }
  return (
    <html lang="en" className="dark h-full" data-mode="dark">
      <body className={cn(inter.className, 'dark', 'h-full')}>
        <Providers
          authContext={{
            organization,
            livemode,
            user,
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
      </body>
    </html>
  )
}
