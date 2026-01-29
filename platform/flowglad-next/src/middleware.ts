import { trace } from '@opentelemetry/api'
import { getSessionCookie } from 'better-auth/cookies'
import { type NextRequest, NextResponse } from 'next/server'
import { middlewareLogic } from './routing-logic/middlewareLogic'
import { isPublicRoute } from './routing-logic/publicRoutes'
import { getCustomerBillingPortalOrganizationId } from './utils/customerBillingPortalState'

/**
 * Extracts the current trace context and formats it as a W3C traceparent header.
 * This allows the Node.js runtime to continue the same trace that started in the Edge runtime.
 * Format: {version}-{trace-id}-{span-id}-{trace-flags}
 */
function getTraceparentHeader(): string | null {
  const activeSpan = trace.getActiveSpan()
  if (!activeSpan) {
    return null
  }

  const spanContext = activeSpan.spanContext()
  if (!spanContext || !spanContext.traceId || !spanContext.spanId) {
    return null
  }

  // W3C Trace Context format: version-traceid-spanid-traceflags
  // version: 00 (current version)
  // traceflags: 8-bit field as 2-digit lowercase hex (preserves all flag bits)
  const traceFlags = (spanContext.traceFlags & 0xff)
    .toString(16)
    .padStart(2, '0')
  return `00-${spanContext.traceId}-${spanContext.spanId}-${traceFlags}`
}

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
  requestHeaders.set(
    'x-is-public-route',
    isPublicRoute(req) ? 'true' : 'false'
  )

  // Propagate trace context from Edge runtime to Node.js runtime
  // This ensures both middleware and route handler appear in the same trace
  const traceparent = getTraceparentHeader()
  if (traceparent) {
    requestHeaders.set('traceparent', traceparent)
  }

  // Allow embedding the support chat widget in iframes on allowed domains
  if (req.nextUrl.pathname.startsWith('/support-chat/embed')) {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    })
    // Include Framer domains (app, website, canvas) and cloudflare tunnels for testing
    const frameAncestors = [
      "'self'",
      'https://flowglad.com',
      'https://*.flowglad.com',
      'https://*.framer.app',
      'https://*.framer.website',
      'https://*.framercanvas.com',
      'https://*.trycloudflare.com',
    ].join(' ')
    response.headers.set(
      'Content-Security-Policy',
      `frame-ancestors ${frameAncestors}`
    )
    return response
  }

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
