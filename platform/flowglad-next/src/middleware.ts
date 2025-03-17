import { NextRequest, NextResponse } from 'next/server'
import { createRouteMatcher } from '@clerk/nextjs/server'
import core from './utils/core'
import { stackServerApp } from './stack'

const publicRoutes = [
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
  '/purchase-session/(.*)',
  /**
   * Purchase session procedures need to be public,
   * otherwise anon users will hit 307 redirects.
   */
  '/api/trpc/purchases.(.*)Session',
  '/api/trpc/purchases.requestAccess',
  '/api/trpc/discounts.attempt',
  '/api/trpc/discounts.clear',
  '/apple-touch-icon(.*).png',
  '/api/v1/(.*)',
  '/api/openapi',
  '/invoice/view/(.*)',
]

if (core.IS_DEV) {
  publicRoutes.push('/demo-route')
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

  const user = await stackServerApp.getUser()
  const isProtectedRoute = !isPublicRoute(req)

  if (!user && isProtectedRoute) {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
