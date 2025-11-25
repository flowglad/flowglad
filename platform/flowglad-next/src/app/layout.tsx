import { Toaster } from 'sonner'
import type { Metadata } from 'next'
import './globals.css'

import Providers from './Providers'
import { cn } from '@/lib/utils'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { User } from '@/db/schema/users'
import {
  insertUser,
  selectUsers,
} from '@/db/tableMethods/userMethods'
import {
  Organization,
  organizationsClientSelectSchema,
} from '@/db/schema/organizations'
import { auth, getSession } from '@/utils/auth'
import { headers } from 'next/headers'
import { betterAuthUserToApplicationUser } from '@/utils/authHelpers'
import * as Sentry from '@sentry/nextjs'
import { arizonaFlare, sfPro, berkeleyMono } from '@/lib/fonts'

export const metadata: Metadata = {
  title: 'Flowglad',
  description: 'Make more internet money',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Check if we're in a preview route - if so, just return children
  // The preview routes will handle their own complete HTML structure
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || ''
  const isPublicRoute =
    headersList.get('x-is-public-route') === 'true'

  // For preview routes, skip the root layout entirely
  if (pathname.includes('/preview-ui')) {
    return children
  }
  const session = await getSession()
  let organization: Organization.ClientRecord | undefined = undefined
  let livemode: boolean = true
  let user: User.Record | undefined = undefined
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

  // Set user context in Sentry for client-side error tracking
  if (user) {
    Sentry.setUser({
      id: user.id,
    })
  } else {
    Sentry.setUser(null)
  }
  const currentPath = headersList.get('x-pathname') || ''
  const role = currentPath.startsWith('/billing-portal/')
    ? 'customer'
    : 'merchant'
  return (
    <html
      lang="en"
      className={cn(
        'h-full',
        arizonaFlare.variable,
        sfPro.variable,
        berkeleyMono.variable
      )}
      suppressHydrationWarning
    >
      <body className={cn(sfPro.className, 'h-full antialiased')}>
        <Providers
          authContext={{
            organization,
            livemode,
            user,
            role,
            authenticated: !!user,
          }}
          isPublicRoute={isPublicRoute}
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
