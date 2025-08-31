import { NextRequest, NextResponse } from 'next/server'
import { createRouteMatcher } from '@clerk/nextjs/server'
import core from './utils/core'
import { getSessionCookie } from 'better-auth/cookies'
import { getCustomerBillingPortalOrganizationId } from './utils/customerBillingPortalState'
import { getSession } from './utils/auth'

const publicRoutes = [
  '/mcp',
  '/billing-portal/(.*)/sign-in',
  '/sign-in(.*)',
  '/sign-up(.*)',
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
  '/api/trpc/purchases.(.*)Session',
  '/api/trpc/checkoutSessions.setPaymentMethodType',
  '/api/trpc/checkoutSessions.setCustomerEmail',
  '/api/trpc/checkoutSessions.setBillingAddress',
  '/api/trpc/purchases.requestAccess',
  '/api/trpc/discounts.attempt',
  '/api/trpc/discounts.clear',
  '/apple-touch-icon(.*).png',
  '/api/v1/(.*)',
  '/api/mcp/(.*)',
  '/api/mcp',
  '/api/ai',
  '/api/ai/(.*)',
  '/api/openapi',
  '/api/hosted-billing/(.*)',
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
]

if (core.IS_DEV) {
  // publicRoutes.push('/demo-route')
  publicRoutes.push('/oauth/callback/(.*)')
}

const isPublicRoute = createRouteMatcher(publicRoutes)

export default async function middleware(req: NextRequest) {
  // Handle CORS for staging
  if (
    req.method === 'OPTIONS' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'staging'
  ) {
    return NextResponse.json(
      { message: 'OK' },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
        },
      }
    )
  }
  const sessionCookie = getSessionCookie(req)
  const isProtectedRoute = !isPublicRoute(req)
  const pathName = req.nextUrl.pathname
  if (!sessionCookie && isProtectedRoute) {
    if (pathName.startsWith('/billing-portal/')) {
      return NextResponse.redirect(
        new URL(`/billing-portal/${pathName.split('/')[2]}/sign-in`, req.url)
      )
    }
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }

  const customerBillingPortalOrganizationId = await getCustomerBillingPortalOrganizationId()
  if (customerBillingPortalOrganizationId && !pathName.startsWith('/billing-portal/') && isProtectedRoute) {
    return NextResponse.redirect(
      new URL(`/billing-portal/${customerBillingPortalOrganizationId}`, req.url)
    )
  }
  
  // Add pathname to headers for layout detection
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-pathname', req.nextUrl.pathname)
  
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
