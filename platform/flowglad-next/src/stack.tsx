import { StackServerApp } from '@stackframe/stack'
import { core } from './utils/core'

export const stackServerApp = new StackServerApp({
  tokenStore: 'nextjs-cookie',
  urls: {
    signIn: '/sign-in',
    afterSignIn: '/dashboard',
    signUp: '/sign-up',
    afterSignUp: '/dashboard',
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
