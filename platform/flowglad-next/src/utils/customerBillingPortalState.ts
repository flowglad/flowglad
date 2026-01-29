import { cookies } from 'next/headers'
import core from './core'

const cookieName = 'customer-billing-organization-id'

/**
 * @deprecated This cookie is only used during the pre-auth OTP sign-in flow.
 * Post-authentication, organization context is stored in session.contextOrganizationId
 * and should be read from the session, not from this cookie.
 *
 * DO NOT use this function for authorization decisions in authenticated routes.
 * Use the organizationId from the session context instead (via TRPC context or getSession()).
 */
export const clearCustomerBillingPortalOrganizationId = async () => {
  const cookieStore = await cookies()
  await cookieStore.delete(cookieName)
}

/**
 * @deprecated This cookie is only used during the pre-auth OTP sign-in flow to pass
 * organization context to the BetterAuth OTP verification process.
 *
 * Post-authentication, organization context is stored in session.contextOrganizationId
 * and should be read from the session, not from this cookie.
 *
 * DO NOT use this function for authorization decisions in authenticated routes.
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
 * @deprecated This cookie is only used during the pre-auth OTP sign-in flow to pass
 * organization context to the BetterAuth OTP verification process.
 *
 * Post-authentication, organization context is stored in session.contextOrganizationId
 * and should be read from the session, not from this cookie.
 *
 * DO NOT use this function for authorization decisions in authenticated routes.
 * Use the organizationId from the session context instead (via TRPC context or getSession()).
 *
 * Valid usage: Pre-auth UI (e.g., during OTP email sending) where no session exists yet.
 * Invalid usage: Post-auth TRPC procedures or API routes for authorization.
 */
export const getCustomerBillingPortalOrganizationId =
  async (params?: { __testOrganizationId?: string }) => {
    if (core.IS_TEST) {
      return params?.__testOrganizationId
    }
    const cookieStore = await cookies()
    return cookieStore.get(cookieName)?.value
  }

// Customer email cookie for OTP verification
// Stored server-side to avoid exposing actual email to client
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
