import { cookies } from 'next/headers'
import core from './core'

const cookieName = 'customer-billing-organization-id'

export const clearCustomerBillingPortalOrganizationId = async () => {
  const cookieStore = await cookies()
  await cookieStore.delete(cookieName)
}

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
