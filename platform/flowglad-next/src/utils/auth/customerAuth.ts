import { betterAuth } from 'better-auth'
import { emailOTP, magicLink } from 'better-auth/plugins'
import { headers } from 'next/headers'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  sendCustomerBillingPortalMagicLink,
  sendCustomerBillingPortalOTP,
} from '../email'
import { getCustomerBillingPortalOrganizationId } from '../customerBillingPortalState'
import { CUSTOMER_COOKIE_PREFIX } from './constants'
import { sharedAuthConfig } from './shared'

const handleCustomerBillingPortalEmailOTP = async (params: {
  email: string
  url: string
  token: string
  organizationId: string
}) => {
  const { email, url, token, organizationId } = params
  // Get organization and customer info for the email
  const { organization, customer } = await adminTransaction(
    async ({ transaction }) => {
      const org = (
        await selectOrganizationById(organizationId, transaction)
      ).unwrap()
      // Only look for live mode customers - billing portals are not supported for test mode customers
      const customers = await selectCustomers(
        { email, organizationId, livemode: true },
        transaction
      )
      return {
        organization: org,
        customer: customers[0] || null,
      }
    }
  )

  // Build the magic link URL with OTP
  // Send the magic link email
  await sendCustomerBillingPortalMagicLink({
    to: [email],
    url,
    customerName: customer?.name || undefined,
    organizationName: organization.name,
    livemode: customer?.livemode ?? false,
  })
}

const handleSendVerificationOTP = async (params: {
  email: string
  otp: string
  organizationId: string
}) => {
  const { email, otp, organizationId } = params

  // Get organization and customer info for the email
  const { organization, customer } = await adminTransaction(
    async ({ transaction }) => {
      const org = (
        await selectOrganizationById(organizationId, transaction)
      ).unwrap()
      // Only look for live mode customers - billing portals are not supported for test mode customers
      const customers = await selectCustomers(
        { email, organizationId, livemode: true },
        transaction
      )
      return {
        organization: org,
        customer: customers[0] || null,
      }
    }
  )

  // Send OTP email using the proper email template
  await sendCustomerBillingPortalOTP({
    to: [email],
    otp,
    customerName: customer?.name || undefined,
    organizationName: organization.name,
    livemode: customer?.livemode ?? false,
  })
}

/**
 * Customer auth instance for billing portal authentication.
 * Only supports OTP and magic link authentication (no password/OAuth).
 * Sessions expire after 24 hours for security.
 */
export const customerAuth = betterAuth({
  ...sharedAuthConfig,
  advanced: {
    cookiePrefix: CUSTOMER_COOKIE_PREFIX,
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
    },
  },
  basePath: '/api/auth/customer',
  session: {
    // 24h customer sessions for security
    expiresIn: 60 * 60 * 24,
    additionalFields: {
      scope: {
        type: 'string' as const,
        required: true,
        defaultValue: 'customer',
        input: false, // server-only
      },
      contextOrganizationId: {
        type: 'string' as const,
        required: false,
        input: false, // set programmatically during sign-in
      },
    },
  },
  plugins: [
    ...(sharedAuthConfig.plugins || []),
    // Customer-specific: emailOTP only (no password, no Google OAuth)
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        const customerBillingPortalOrganizationId =
          await getCustomerBillingPortalOrganizationId()
        if (customerBillingPortalOrganizationId) {
          await handleSendVerificationOTP({
            email,
            otp,
            organizationId: customerBillingPortalOrganizationId,
          })
        } else {
          throw new Error('Customer OTP requires organization context')
        }
      },
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 3,
    }),
    magicLink({
      async sendMagicLink({ email, url, token }) {
        const customerBillingPortalOrganizationId =
          await getCustomerBillingPortalOrganizationId()
        if (customerBillingPortalOrganizationId) {
          await handleCustomerBillingPortalEmailOTP({
            email,
            url,
            token,
            organizationId: customerBillingPortalOrganizationId,
          })
        } else {
          throw new Error('Customer magic link requires organization context')
        }
      },
    }),
  ],
})

/**
 * Get customer session from request headers.
 */
export const getCustomerSession = async () => {
  const session = await customerAuth.api.getSession({
    headers: await headers(),
  })
  return session
}
