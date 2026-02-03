/**
 * Customer auth instance for billing portal users.
 * Supports OTP and magic link only - no password or social login.
 * Sessions expire after 24 hours for security.
 */
import { betterAuth } from 'better-auth'
import {
  customSession,
  emailOTP,
  magicLink,
} from 'better-auth/plugins'
import { Result } from 'better-result'
import { headers } from 'next/headers'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { getCustomerBillingPortalOrganizationId } from '../customerBillingPortalState'
import {
  sendCustomerBillingPortalMagicLink,
  sendCustomerBillingPortalOTP,
} from '../email'
import {
  CUSTOMER_AUTH_BASE_PATH,
  CUSTOMER_COOKIE_PREFIX,
} from './constants'
import {
  defaultCookieAttributes,
  sharedDatabaseAdapter,
  sharedDatabaseHooks,
} from './shared'

/**
 * Handle sending magic link for customer billing portal.
 */
const handleCustomerBillingPortalEmailOTP = async (params: {
  email: string
  url: string
  token: string
  organizationId: string
}) => {
  const { email, url, organizationId } = params
  // Get organization and customer info for the email
  const { organization, customer } = (
    await adminTransaction(async ({ transaction }) => {
      const org = (
        await selectOrganizationById(organizationId, transaction)
      ).unwrap()
      // Only look for live mode customers - billing portals are not supported for test mode customers
      const customers = await selectCustomers(
        { email, organizationId, livemode: true },
        transaction
      )
      return Result.ok({
        organization: org,
        customer: customers[0] || null,
      })
    })
  ).unwrap()

  // Send the magic link email
  await sendCustomerBillingPortalMagicLink({
    to: [email],
    url,
    customerName: customer?.name || undefined,
    organizationName: organization.name,
    livemode: customer?.livemode ?? false,
  })
}

/**
 * Handle sending OTP for customer billing portal.
 */
const handleSendVerificationOTP = async (params: {
  email: string
  otp: string
  organizationId: string
}) => {
  const { email, otp, organizationId } = params

  // Get organization and customer info for the email
  const { organization, customer } = (
    await adminTransaction(async ({ transaction }) => {
      const org = (
        await selectOrganizationById(organizationId, transaction)
      ).unwrap()
      // Only look for live mode customers - billing portals are not supported for test mode customers
      const customers = await selectCustomers(
        { email, organizationId, livemode: true },
        transaction
      )
      return Result.ok({
        organization: org,
        customer: customers[0] || null,
      })
    })
  ).unwrap()

  // Send OTP email using the proper email template
  await sendCustomerBillingPortalOTP({
    to: [email],
    otp,
    customerName: customer?.name || undefined,
    organizationName: organization.name,
    livemode: customer?.livemode ?? false,
  })
}

export const customerAuth = betterAuth({
  database: sharedDatabaseAdapter,
  basePath: CUSTOMER_AUTH_BASE_PATH,
  advanced: {
    cookiePrefix: CUSTOMER_COOKIE_PREFIX,
    defaultCookieAttributes,
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
        if (customerBillingPortalOrganizationId) {
          await handleSendVerificationOTP({
            email,
            otp,
            organizationId: customerBillingPortalOrganizationId,
          })
        } else {
          throw new Error(
            'Customer OTP requires organization context from billing portal'
          )
        }
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
        if (customerBillingPortalOrganizationId) {
          await handleCustomerBillingPortalEmailOTP({
            email,
            url,
            token,
            organizationId: customerBillingPortalOrganizationId,
          })
        } else {
          throw new Error(
            'Customer magic link requires organization context from billing portal'
          )
        }
      },
    }),
  ],
  databaseHooks: sharedDatabaseHooks,
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'customer',
        input: false, // don't allow user to set role
      },
    },
  },
  session: {
    // Customer sessions expire after 24 hours for security
    expiresIn: 60 * 60 * 24, // 24 hours in seconds
    updateAge: 60 * 60, // Update session every hour
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
  // Customer auth only supports OTP and magic link - no password or social login
  emailAndPassword: {
    enabled: false,
  },
})

/**
 * Get the current customer session from cookies.
 * Returns null if no valid customer session exists.
 */
export const getCustomerSession = async () => {
  const session = await customerAuth.api.getSession({
    headers: await headers(),
  })
  return session
}
