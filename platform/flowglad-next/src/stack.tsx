import { StackServerApp } from '@stackframe/stack'

export const stackServerApp = new StackServerApp({
  tokenStore: 'nextjs-cookie',
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
  projectId: 'hosted-billing',
})
