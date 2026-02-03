/**
 * Customer Billing Portal State Management
 *
 * IMPORTANT: These cookies are for TRANSIENT, PRE-AUTH use only.
 *
 * After successful authentication, the authoritative organization context
 * is stored in the customer session's `contextOrganizationId` field.
 * Post-auth code should read from the session, not these cookies.
 *
 * Cookie purposes:
 * - `customer-billing-organization-id`: Temporary storage during sign-in flow.
 *   Used to pass org context to better-auth's session creation hook.
 *   NOT authoritative post-auth - use session.contextOrganizationId instead.
 *
 * - `customer-billing-email`: Security measure during OTP verification.
 *   Stores the customer's email server-side to prevent email injection attacks.
 *   Short-lived (15 min) and cleared after successful verification.
 */
import { cookies } from 'next/headers'
import core from './core'

const cookieName = 'customer-billing-organization-id'

export const clearCustomerBillingPortalOrganizationId = async () => {
  const cookieStore = await cookies()
  await cookieStore.delete(cookieName)
}

/**
 * Sets the organization ID cookie for the customer billing portal sign-in flow.
 *
 * IMPORTANT: This is for PRE-AUTH use only. After successful authentication,
 * the organization context is stored in session.contextOrganizationId and
 * this cookie should not be read for authorization decisions.
 */
export const setCustomerBillingPortalOrganizationId = async (
  organizationId: string
) => {
  const cookieStore = await cookies()
  await cookieStore.set(cookieName, organizationId, {
    maxAge: 60 * 60 * 24, // 24 hours in seconds
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })
}

/**
 * Gets the organization ID from the cookie.
 *
 * @deprecated POST-AUTH: Use session.contextOrganizationId instead.
 * This function should only be used during the sign-in flow (pre-auth).
 * After authentication, read from the customer session's contextOrganizationId.
 */
export const getCustomerBillingPortalOrganizationId =
  async (params?: { __testOrganizationId?: string }) => {
    if (core.IS_TEST) {
      return params?.__testOrganizationId
    }
    const cookieStore = await cookies()
    return cookieStore.get(cookieName)?.value
  }

/**
 * Customer email cookie for OTP verification.
 * Stored server-side to avoid exposing actual email to client.
 *
 * This is a security measure to prevent email injection attacks during
 * OTP verification. The email is set when sending the OTP and read when
 * verifying, ensuring the client cannot substitute a different email.
 */
const customerEmailCookieName = 'customer-billing-email'

export const setCustomerBillingPortalEmail = async (
  email: string
) => {
  const cookieStore = await cookies()
  await cookieStore.set(customerEmailCookieName, email, {
    maxAge: 60 * 15, // 15 minutes (matches OTP expiry of 10 min + buffer)
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })
}

export const getCustomerBillingPortalEmail = async (params?: {
  __testEmail?: string
}) => {
  if (core.IS_TEST) {
    return params?.__testEmail
  }
  const cookieStore = await cookies()
  return cookieStore.get(customerEmailCookieName)?.value
}

export const clearCustomerBillingPortalEmail = async () => {
  const cookieStore = await cookies()
  await cookieStore.delete(customerEmailCookieName)
}
