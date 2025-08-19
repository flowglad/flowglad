import { core } from './utils/core'
import { StackServerApp } from '@stackframe/stack'

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
