import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import {
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
    if (!otp || typeof otp !== 'string' || otp.length !== 6) {
      return NextResponse.json(
        { success: false, error: 'Invalid OTP format' },
        { status: 400 }
      )
    }

    if (!organizationId || !customerId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing organizationId or customerId',
        },
        { status: 400 }
      )
    }
    const customer = await adminTransaction(
      async ({ transaction }) => {
        return await selectCustomerById(customerId, transaction)
      }
    )
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

    // Call BetterAuth's API endpoint directly via HTTP to capture Set-Cookie headers
    const baseUrl = new URL(request.url).origin
    const originalCookies = request.headers.get('Cookie') || ''
    const orgCookie = `customer-billing-organization-id=${organizationId}`
    const cookieString = originalCookies
      ? `${originalCookies}; ${orgCookie}`
      : orgCookie

    const authResponse = await fetch(
      `${baseUrl}/api/auth/sign-in/email-otp`,
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

    // Create success response and forward Set-Cookie headers from BetterAuth
    const response = NextResponse.json({
      success: true,
      redirectUrl: `/billing-portal/${organizationId}/${customerId}`,
    })

    // Forward all Set-Cookie headers from BetterAuth's response
    const setCookieHeaders = authResponse.headers.getSetCookie()
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
