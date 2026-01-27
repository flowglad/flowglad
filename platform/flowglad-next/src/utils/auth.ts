import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import {
  admin,
  customSession,
  emailOTP,
  magicLink,
} from 'better-auth/plugins'
import { headers } from 'next/headers'
import { adminTransaction } from '@/db/adminTransaction'
import { db } from '@/db/client'
import {
  account,
  session,
  user,
  verification,
} from '@/db/schema/betterAuthSchema'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { betterAuthUserToApplicationUser } from './authHelpers'
import { getCustomerBillingPortalOrganizationId } from './customerBillingPortalState'
import {
  sendCustomerBillingPortalMagicLink,
  sendCustomerBillingPortalOTP,
  sendForgotPasswordEmail,
} from './email'

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

const handleMerchantEmailOTP = async ({}: {
  email: string
  url: string
  token: string
}) => {
  throw new Error('Not implemented')
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

  // Send OTP email using the proper email template
  await sendCustomerBillingPortalOTP({
    to: [email],
    otp,
    customerName: customer?.name || undefined,
    organizationName: organization.name,
    livemode: customer?.livemode ?? false,
  })
}

// For now, we rely on better-auth's native rate limiting
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user,
      session,
      account,
      verification,
    },
  }),
  plugins: [
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
    // OTP plugin - primary authentication method
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
          // For merchant emails (not implemented yet)
          throw new Error('Merchant OTP emails not implemented')
        }
      },
      otpLength: 6, // 6-digit OTP code
      expiresIn: 600, // 10 minutes in seconds (600 seconds)
      allowedAttempts: 3, // Maximum 3 attempts before OTP becomes invalid
    }),
    // Magic link plugin - fallback authentication method
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
          await handleMerchantEmailOTP({ email, url, token })
        }
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (betterAuthUser) => {
          await betterAuthUserToApplicationUser(betterAuthUser)
        },
      },
    },
  },
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
    additionalFields: {
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
    sendResetPassword: async ({ user, url, token }, request) => {
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

export const getSession = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  return session
}
