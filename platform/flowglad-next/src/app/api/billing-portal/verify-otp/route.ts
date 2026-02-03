import * as Sentry from '@sentry/nextjs'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  adminTransaction,
  adminTransactionWithResult,
} from '@/db/adminTransaction'
import { updateSessionContextOrganizationId } from '@/db/tableMethods/betterAuthSchemaMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { CUSTOMER_COOKIE_PREFIX } from '@/utils/auth/constants'
import {
  clearCustomerBillingPortalEmail,
  getCustomerBillingPortalEmail,
  setCustomerBillingPortalOrganizationId,
} from '@/utils/customerBillingPortalState'

/**
 * API Route handler for OTP verification.
 *
 * This route exists as a separate API endpoint (rather than being handled via TRPC) for two critical reasons:
 *
 * 1. **Email Security**: We cannot accept an email address from the client side. If we did, an attacker
 *    could guess customer IDs and receive the associated email addresses, exposing sensitive customer data.
 *    Instead, the email is stored server-side in a secure cookie during the send-otp flow and retrieved here.
 *
 * 2. **BetterAuth Session Cookie**: We need to correctly set the BetterAuth session ID cookie server-side.
 *    This requires forwarding Set-Cookie headers from BetterAuth's response, which is not easily achievable
 *    via TRPC. TRPC doesn't provide direct access to HTTP response headers like Set-Cookie, making it
 *    difficult to properly establish the authenticated session. By using a Next.js route handler, we can
 *    directly forward the Set-Cookie headers from BetterAuth's API response to the client.
 *
 * Client sends: { otp, organizationId, customerId }
 * Server: Validates OTP via BetterAuth, forwards Set-Cookie headers, returns success/error
 */
export async function POST(request: NextRequest) {
  try {
    const verifyOtpSchema = z.object({
      otp: z.string().length(6, 'OTP must be 6 digits'),
      organizationId: z.string(),
      customerId: z.string(),
    })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    const parseResult = verifyOtpSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: parseResult.error.message },
        { status: 400 }
      )
    }
    const { otp, organizationId, customerId } = parseResult.data
    // Note: otp format already validated by Zod schema above

    if (!organizationId || !customerId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing organizationId or customerId',
        },
        { status: 400 }
      )
    }
    const customer = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return selectCustomerById(customerId, transaction)
      })
    ).unwrap()
    if (!customer) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to verify OTP.',
        },
        { status: 400 }
      )
    }
    if (customer.organizationId !== organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to verify OTP.',
        },
        { status: 400 }
      )
    }
    // Set organization context (BetterAuth needs this)
    await setCustomerBillingPortalOrganizationId(organizationId)

    // Get email from secure cookie (set during sendOTP)
    const email = await getCustomerBillingPortalEmail()

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Session expired. Please request a new verification code.',
        },
        { status: 400 }
      )
    }

    // Call BetterAuth's customer auth API endpoint directly via HTTP to capture Set-Cookie headers
    // Uses the customer auth instance at /api/auth/customer to create a customer-scoped session
    const baseUrl = new URL(request.url).origin
    const originalCookies = request.headers.get('Cookie') || ''
    const orgCookie = `customer-billing-organization-id=${organizationId}`
    const cookieString = originalCookies
      ? `${originalCookies}; ${orgCookie}`
      : orgCookie

    const authResponse = await fetch(
      `${baseUrl}/api/auth/customer/sign-in/email-otp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieString,
          Origin: baseUrl,
        },
        body: JSON.stringify({ email, otp }),
      }
    )

    if (!authResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid or expired verification code.',
        },
        { status: 400 }
      )
    }

    // Forward all Set-Cookie headers from BetterAuth's response
    const setCookieHeaders = authResponse.headers.getSetCookie()

    // Extract the session token from Set-Cookie headers to update session context
    // Cookie format: customer.session_token=<token>; ...
    const sessionTokenCookieName = `${CUSTOMER_COOKIE_PREFIX}.session_token`
    let sessionToken: string | null = null

    for (const cookie of setCookieHeaders) {
      if (cookie.startsWith(`${sessionTokenCookieName}=`)) {
        // Extract the token value (before the first semicolon)
        const tokenMatch = cookie.match(
          new RegExp(`^${sessionTokenCookieName}=([^;]+)`)
        )
        if (tokenMatch) {
          sessionToken = decodeURIComponent(tokenMatch[1])
        }
        break
      }
    }

    // Update the session's contextOrganizationId in the database
    // This makes the organization context authoritative from the session, not cookies
    // CRITICAL: This is required for proper authorization - customer procedures read from session context
    if (sessionToken) {
      try {
        // BetterAuth stores the raw token in the database, but the cookie contains
        // a signed token (rawToken.signature). Extract just the raw token part.
        const rawToken = sessionToken.includes('.')
          ? sessionToken.split('.')[0]
          : sessionToken

        const updatedSession = await adminTransaction(
          async ({ transaction }) => {
            return updateSessionContextOrganizationId(
              rawToken,
              organizationId,
              transaction
            )
          }
        )

        // Verify the update succeeded - if no session was found, this is a critical error
        if (!updatedSession) {
          const error = new Error(
            `Failed to set contextOrganizationId: session not found for token`
          )
          Sentry.captureException(error, {
            extra: {
              organizationId,
              customerId,
              hasSessionToken: true,
              sessionTokenLength: sessionToken.length,
            },
          })
          // Fail the request - without contextOrganizationId, customer procedures will reject
          return NextResponse.json(
            {
              success: false,
              error:
                'Authentication succeeded but session setup failed. Please try again.',
            },
            { status: 500 }
          )
        }
      } catch (error) {
        // Report to Sentry for observability - this is a critical failure
        Sentry.captureException(error, {
          extra: {
            organizationId,
            customerId,
            context: 'verify-otp contextOrganizationId update',
          },
        })
        console.error(
          'Failed to set contextOrganizationId on session:',
          error
        )
        // Fail the request - without contextOrganizationId, customer procedures will reject
        return NextResponse.json(
          {
            success: false,
            error:
              'Authentication succeeded but session setup failed. Please try again.',
          },
          { status: 500 }
        )
      }
    } else {
      // No session token found in response - this is unexpected
      const error = new Error(
        'Customer auth response did not include session token cookie'
      )
      Sentry.captureException(error, {
        extra: {
          organizationId,
          customerId,
          setCookieHeadersCount: setCookieHeaders.length,
        },
      })
      return NextResponse.json(
        {
          success: false,
          error:
            'Authentication succeeded but session setup failed. Please try again.',
        },
        { status: 500 }
      )
    }

    // Clear the transient email cookie after successful verification
    await clearCustomerBillingPortalEmail()

    // Create success response and forward Set-Cookie headers from BetterAuth
    const response = NextResponse.json({
      success: true,
      redirectUrl: `/billing-portal/${organizationId}/${customerId}`,
    })

    for (const cookie of setCookieHeaders) {
      response.headers.append('Set-Cookie', cookie)
    }

    return response
  } catch (error) {
    console.error('verify-otp route error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to verify code. Please try again.',
      },
      { status: 500 }
    )
  }
}
