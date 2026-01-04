import { type NextRequest, NextResponse } from 'next/server'
import {
  getCustomerBillingPortalEmail,
  setCustomerBillingPortalOrganizationId,
} from '@/utils/customerBillingPortalState'

/**
 * API Route handler for OTP verification.
 * Keeps the email secure (never exposed to client) while properly setting
 * BetterAuth cookies by forwarding them from BetterAuth's response.
 *
 * Client sends: { otp, organizationId, customerId }
 * Server: Validates OTP via BetterAuth, forwards Set-Cookie headers, returns success/error
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { otp, organizationId, customerId } = body

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
