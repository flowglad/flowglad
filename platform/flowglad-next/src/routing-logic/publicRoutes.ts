import { createRouteMatcher } from '@clerk/nextjs/server'
import core from '@/utils/core'

const publicRoutes = [
  '/mcp',
  '/billing-portal/(.*)/sign-in',
  '/api/billing-portal/verify-otp',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/logout',
  '/handler/(.*)',
  '/api/ping',
  '/api/webhook-stripe/(.*)',
  '/api/webhook-(.*)',
  '/api/testimonial-sets/(.*)',
  '/product/(.*)/purchase',
  '/purchase/pay/(.*)',
  '/purchase/post-payment',
  '/purchase/verify/(.*)',
  '/purchase/access/(.*)',
  '/product/(.*)/post-purchase/(.*)',
  '/api/trpc/public.(.*)',
  '/checkout/(.*)',
  '/add-payment-method/(.*)',
  '/price/(.*)/purchase',
  '/invite-discord',
  /**
   * Purchase session procedures need to be public,
   * otherwise anon users will hit 307 redirects.
   */
  '/api/trpc/customerBillingPortal.requestMagicLink',
  '/api/trpc/customerBillingPortal.sendOTPToCustomer',
  '/api/trpc/checkoutSessions.public.(.*)',
  '/api/trpc/purchases.requestAccess',
  '/api/trpc/utils.logout',
  '/api/trpc/utils.logoutMerchant',
  '/api/trpc/utils.logoutCustomer',
  '/api/trpc/utils.resetPassword',
  '/apple-touch-icon(.*).png',
  '/api/v1/(.*)',
  '/api/mcp/(.*)',
  '/api/mcp',
  '/api/ai',
  '/api/ai/(.*)',
  '/api/openapi',
  '/invoice/view/(.*)',
  '/ui/(.*)',
  /**
   * Better Auth URLS
   */
  '/api/auth/(.*)',
  /**
   * Preview UI routes are public
   */
  '/preview-ui(.*)',
  '/blog/(.*)',
  /**
   * CLI authorization routes need to be public to handle their own auth flow.
   * The pages themselves redirect to sign-in if not authenticated.
   */
  '/cli/authorize',
  '/device',
]

if (core.IS_DEV) {
  // publicRoutes.push('/demo-route')
  publicRoutes.push('/oauth/callback/(.*)')
}

export const isPublicRoute = createRouteMatcher(publicRoutes)
