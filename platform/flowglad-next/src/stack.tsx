import { core } from './utils/core'
import { StackServerApp } from '@stackframe/stack'

export const stackServerApp = new StackServerApp({
  tokenStore: 'nextjs-cookie',
  /**
   * Be really, really thoughtful before you change these URLS.
   * They each have specific authorization logic that routes the client based
   * on the authenticated user's state. If you change the redirect routes, you
   * should ensure the new redirect routes have the same authorization + re-routing logic
   * otherwise the app will crash on signin.
   */
  urls: {
    signIn: '/sign-in',
    afterSignIn: '/',
    signUp: '/sign-up',
    afterSignUp: '/',
    accountSettings: '/account-settings',
  },
})

export const hostedBillingStackServerApp = new StackServerApp({
  tokenStore: 'nextjs-cookie',
  projectId: core.envVariable(
    'NEXT_PUBLIC_STACK_HOSTED_BILLING_PROJECT_ID'
  ),
  publishableClientKey: core.envVariable(
    'NEXT_PUBLIC_STACK_HOSTED_BILLING_PUBLISHABLE_CLIENT_KEY'
  ),
  secretServerKey: core.envVariable(
    'STACK_SECRET_HOSTED_BILLING_SERVER_KEY'
  ),
})
