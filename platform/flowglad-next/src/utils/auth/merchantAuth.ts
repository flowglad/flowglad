/**
 * Merchant auth instance for dashboard/merchant users.
 * Supports email/password, Google OAuth, and device authorization (CLI).
 * Admin plugin is merchant-only.
 *
 * NOTE: emailOTP and magicLink plugins are included here temporarily for backward
 * compatibility with customer billing portal code that still uses `auth` (aliased to merchantAuth).
 * These will be removed from merchantAuth once Patch 6 migrates the billing portal to customerAuth.
 */
import { betterAuth } from 'better-auth'
import {
  admin,
  customSession,
  deviceAuthorization,
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
  sendForgotPasswordEmail,
} from '../email'
import {
  MERCHANT_AUTH_BASE_PATH,
  MERCHANT_COOKIE_PREFIX,
} from './constants'
import {
  defaultCookieAttributes,
  sharedDatabaseAdapter,
  sharedDatabaseHooks,
} from './shared'

/**
 * Handle sending magic link for customer billing portal.
 * @deprecated This will be moved to customerAuth in Patch 6
 */
const handleCustomerBillingPortalEmailOTP = async (params: {
  email: string
  url: string
  token: string
  organizationId: string
}) => {
  const { email, url, organizationId } = params
  const { organization, customer } = await adminTransaction(
    async ({ transaction }) => {
      const org = (
        await selectOrganizationById(organizationId, transaction)
      ).unwrap()
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
 * @deprecated This will be moved to customerAuth in Patch 6
 */
const handleSendVerificationOTP = async (params: {
  email: string
  otp: string
  organizationId: string
}) => {
  const { email, otp, organizationId } = params

  const { organization, customer } = await adminTransaction(
    async ({ transaction }) => {
      const org = (
        await selectOrganizationById(organizationId, transaction)
      ).unwrap()
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

  await sendCustomerBillingPortalOTP({
    to: [email],
    otp,
    customerName: customer?.name || undefined,
    organizationName: organization.name,
    livemode: customer?.livemode ?? false,
  })
}

export const merchantAuth = betterAuth({
  database: sharedDatabaseAdapter,
  basePath: MERCHANT_AUTH_BASE_PATH,
  advanced: {
    cookiePrefix: MERCHANT_COOKIE_PREFIX,
    defaultCookieAttributes,
  },
  plugins: [
    // Admin plugin is merchant-only
    admin(),
    customSession(async ({ user, session }) => {
      return {
        focusedRole: [],
        user: {
          ...user,
        },
        session,
      }
    }),
    // OTP plugin - included for backward compatibility with customer billing portal
    // TODO: Remove from merchantAuth once Patch 6 migrates billing portal to customerAuth
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
          throw new Error('Merchant OTP emails not implemented')
        }
      },
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 3,
    }),
    // Magic link plugin - for both merchant password reset and customer billing portal
    // TODO: Remove customer magic link handling once Patch 6 migrates billing portal to customerAuth
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
          throw new Error('Merchant magic link not implemented')
        }
      },
    }),
    // Device Authorization plugin for CLI authentication via OAuth Device Flow (RFC 8628)
    // Note: verificationUri is NOT configurable - plugin hardcodes to /device
    // We handle this via a redirect page at /app/device/page.tsx -> /cli/authorize
    deviceAuthorization({
      expiresIn: '10m', // 10 minutes for code entry
      interval: '5s', // 5 second polling interval
      userCodeLength: 8, // 8 character user code
      deviceCodeLength: 40,
      validateClient: async (clientId) => clientId === 'flowglad-cli',
    }),
  ],
  databaseHooks: sharedDatabaseHooks,
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'merchant',
        input: false, // don't allow user to set role
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 90, // 90 days in seconds (better-auth default)
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    additionalFields: {
      scope: {
        type: 'string',
        required: true,
        defaultValue: 'merchant',
        input: false, // server-only
      },
      contextOrganizationId: {
        type: 'string',
        required: false,
        defaultValue: undefined,
        input: false, // don't allow user to set contextOrganizationId
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await sendForgotPasswordEmail({
        to: [user.email],
        url,
      })
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
})

/**
 * Get the current merchant session from cookies.
 * Returns null if no valid merchant session exists.
 */
export const getMerchantSession = async () => {
  const session = await merchantAuth.api.getSession({
    headers: await headers(),
  })
  return session
}
