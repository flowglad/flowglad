import { betterAuth } from 'better-auth'
import {
  customSession,
  emailOTP,
  magicLink,
} from 'better-auth/plugins'
import { headers } from 'next/headers'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { getCustomerBillingPortalOrganizationId } from '../customerBillingPortalState'
import {
  sendCustomerBillingPortalMagicLink,
  sendCustomerBillingPortalOTP,
} from '../email'
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
 * Customer authentication instance.
 * This instance is used for customer billing portal authentication and includes:
 * - OTP authentication only (no password, no social login)
 * - Magic link authentication
 * - Customer-scoped sessions with 24-hour expiry
 * - No admin plugin (customer-only access)
 */
export const customerAuth = betterAuth({
  ...sharedAuthConfig,
  advanced: {
    cookiePrefix: CUSTOMER_COOKIE_PREFIX,
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  },
  basePath: '/api/auth/customer',
  session: {
    // 24h customer sessions for security
    expiresIn: 60 * 60 * 24,
    additionalFields: {
      scope: {
        type: 'string',
        required: true,
        defaultValue: 'customer',
        input: false, // server-only
      },
      contextOrganizationId: {
        type: 'string',
        required: false,
        input: false, // set programmatically during sign-in
      },
    },
  },
  plugins: [
    customSession(async ({ user, session }) => {
      return {
        focusedRole: [],
        user: {
          ...user,
        },
        session,
      }
    }),
    // OTP plugin - primary authentication method for customers
    // Configured with 6-digit OTP, 10-minute expiry, and 3 allowed attempts
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        const customerBillingPortalOrganizationId =
          await getCustomerBillingPortalOrganizationId()
        if (!customerBillingPortalOrganizationId) {
          throw new Error(
            'Customer billing portal organization ID not found in cookies'
          )
        }
        await handleSendVerificationOTP({
          email,
          otp,
          organizationId: customerBillingPortalOrganizationId,
        })
      },
      otpLength: 6, // 6-digit OTP code
      expiresIn: 600, // 10 minutes in seconds (600 seconds)
      allowedAttempts: 3, // Maximum 3 attempts before OTP becomes invalid
    }),
    // Magic link plugin - fallback authentication method for customers
    magicLink({
      async sendMagicLink({ email, url, token }) {
        const customerBillingPortalOrganizationId =
          await getCustomerBillingPortalOrganizationId()
        if (!customerBillingPortalOrganizationId) {
          throw new Error(
            'Customer billing portal organization ID not found in cookies'
          )
        }
        await handleCustomerBillingPortalEmailOTP({
          email,
          url,
          token,
          organizationId: customerBillingPortalOrganizationId,
        })
      },
    }),
  ],
})

/**
 * Get the current customer session.
 * Returns null if no customer session exists or if the session is not a customer session.
 */
export const getCustomerSession = async () => {
  const session = await customerAuth.api.getSession({
    headers: await headers(),
  })

  return session
}
