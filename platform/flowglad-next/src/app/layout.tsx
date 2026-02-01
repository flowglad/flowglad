import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

import {
  type Organization,
  organizationsClientSelectSchema,
} from '@db-core/schema/organizations'
import type { User } from '@db-core/schema/users'
import * as Sentry from '@sentry/nextjs'
import { Result } from 'better-result'
import { headers } from 'next/headers'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import {
  insertUser,
  selectUsers,
} from '@/db/tableMethods/userMethods'
import { arizonaFlare, berkeleyMono, sfPro } from '@/lib/fonts'
import { cn } from '@/lib/utils'
import { auth, getSession } from '@/utils/auth'
import { betterAuthUserToApplicationUser } from '@/utils/authHelpers'
import Providers from './Providers'

export const metadata: Metadata = {
  title: 'Flowglad',
  description: 'Make more internet money',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Resize content when virtual keyboard appears, making fixed bottom
  // elements move up with the keyboard on mobile devices
  interactiveWidget: 'resizes-content',
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
  let organization: Organization.ClientRecord | undefined
  let livemode: boolean = true
  let user: User.Record | undefined
  if (session) {
    user = await betterAuthUserToApplicationUser(session.user)
    const [membershipData] = (
      await adminTransaction(async ({ transaction }) => {
        if (!user) {
          throw new Error('User not found')
        }
        return Result.ok(
          await selectMembershipAndOrganizations(
            {
              userId: user.id,
              focused: true,
            },
            transaction
          )
        )
      })
    ).unwrap()

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
