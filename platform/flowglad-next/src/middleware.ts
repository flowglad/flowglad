import { NextRequest, NextResponse } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'
import { getCustomerBillingPortalOrganizationId } from './utils/customerBillingPortalState'
import { isPublicRoute } from './routing-logic/publicRoutes'
import { middlewareLogic } from './routing-logic/middlewareLogic'

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
  const customerBillingPortalOrganizationId =
    await getCustomerBillingPortalOrganizationId()
  const logicParams = {
    sessionCookie,
    isProtectedRoute,
    pathName,
    customerBillingPortalOrganizationId,
    req: { nextUrl: req.url },
  }
  const logicResult = middlewareLogic(logicParams)
  if (!logicResult.proceed) {
    return NextResponse.redirect(
      new URL(logicResult.redirect.url, req.url),
      logicResult.redirect.status
    )
  }

  // Add pathname to headers for layout detection
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-pathname', req.nextUrl.pathname)
  // Pass public-route boolean to server layout/Providers
  requestHeaders.set('x-is-public-route', isPublicRoute(req) ? 'true' : 'false')

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
