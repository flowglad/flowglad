import { z } from 'zod'
import { setHostedBillingCustomerExternalIdForStackAuthUser } from '@/utils/hostedBillingApiHelpers'
import { adminTransaction } from '@/db/adminTransaction'
import { assignStackAuthHostedBillingUserIdToCustomersWithMatchingEmailButNoStackAuthHostedBillingUserId } from '@/db/tableMethods/customerMethods'
import { hostedBillingStackServerApp } from '@/stack'
import { logger } from '@/utils/logger'
import { trace, SpanStatusCode, context } from '@opentelemetry/api'
import { ServerUser } from '@stackframe/stack'
import core from '@/utils/core'

export async function sendVerificationEmailToUser(
  user: ServerUser,
  params: {
    organizationId: string
    customerExternalId: string
  }
) {
  const contactChannels = await user.listContactChannels()
  const primaryContactChannel = contactChannels.find(
    (channel) => channel.type === 'email' && channel.isPrimary
  )
  if (!primaryContactChannel) {
    logger.warn('No primary contact channel found for user', {
      userPrimaryEmail: user.primaryEmail,
      stackAuthUserId: user.id,
    })
    throw new Error('No primary contact channel found for user')
  }
  // @ts-expect-error - actually works but not correctly typed
  await primaryContactChannel.sendVerificationEmail({
    callbackUrl: core.billingPortalPageURL({
      organizationId: params.organizationId,
      customerExternalId: params.customerExternalId,
      page: 'validate-magic-link',
    }),
  })
  logger.info('Verification link email sent', {
    userPrimaryEmail: user.primaryEmail,
    stackAuthUserId: user.id,
    primaryContactChannel: primaryContactChannel.value,
  })
}

export const createUserAndSendMagicLink = async (params: {
  customerEmail: string
  customerId: string
  customerName: string
  organizationId: string
  customerExternalId: string
}) => {
  const tracer = trace.getTracer('magic-link')
  return tracer.startActiveSpan(
    'createUserAndSendMagicLink',
    async (span) => {
      try {
        span.setAttributes({
          'customer.email': params.customerEmail,
          'customer.id': params.customerId,
          'customer.name': params.customerName,
        })

        logger.info('Creating user and sending magic link', {
          customerEmail: params.customerEmail,
          customerId: params.customerId,
          customerName: params.customerName,
        })

        const user = await hostedBillingStackServerApp.createUser({
          primaryEmail: params.customerEmail,
          primaryEmailAuthEnabled: true,
          displayName: params.customerName,
          otpAuthEnabled: true,
          /**
           * Todo: review this with Stack Auth team to ensure this is good to go
           */
          primaryEmailVerified: true,
        })

        await setHostedBillingCustomerExternalIdForStackAuthUser({
          stackAuthUser: user,
          organizationId: params.organizationId,
          customerExternalId: params.customerExternalId,
        })

        logger.info('User created successfully', {
          userId: user.id,
          customerEmail: params.customerEmail,
        })

        await adminTransaction(async ({ transaction }) => {
          await assignStackAuthHostedBillingUserIdToCustomersWithMatchingEmailButNoStackAuthHostedBillingUserId(
            {
              email: params.customerEmail,
              stackAuthHostedBillingUserId: user.id,
            },
            transaction
          )
        })

        logger.info('Customer updated with Stack Auth user ID', {
          customerId: params.customerId,
          stackAuthUserId: user.id,
        })
        await sendEmailToExistingUser({
          user,
          customerId: params.customerId,
          customerName: params.customerName,
          organizationId: params.organizationId,
          customerExternalId: params.customerExternalId,
        })
        // keep this in case we need to go back to verify and magic link emails being different flows
        // await sendVerificationEmailToUser(
        //   user,
        //   `${core.envVariable('HOSTED_BILLING_PORTAL_URL')}/api/${params.organizationId}/${params.customerExternalId}`
        // )
        span.setStatus({ code: SpanStatusCode.OK })
        return { userId: user.id }
      } catch (error) {
        console.error('Error in createUserAndSendMagicLink', {
          error,
        })
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to create user and send magic link',
        })
        span.setAttributes({ 'error.type': 'USER_CREATION_ERROR' })
        logger.error('Failed to create user and send magic link', {
          error:
            error instanceof Error ? error.message : String(error),
          customerEmail: params.customerEmail,
          customerId: params.customerId,
        })
        throw error
      } finally {
        span.end()
      }
    }
  )
}

export async function sendEmailToExistingUser({
  customerId,
  user,
  organizationId,
  customerExternalId,
}: {
  user: ServerUser
  customerId: string
  customerName: string
  organizationId: string
  customerExternalId: string
}) {
  logger.info(
    'Customer already has Stack Auth user ID, sending magic link',
    {
      customerId,
      stackAuthUserId: user.id,
    }
  )
  const emailAndUserId = {
    primaryEmail: user.primaryEmail!,
    stackAuthUserId: user.id,
    primaryEmailVerified: user.primaryEmailVerified,
  }
  if (user.primaryEmailVerified) {
    await hostedBillingStackServerApp.sendMagicLinkEmail(
      user.primaryEmail!,
      {
        callbackUrl: core.billingPortalPageURL({
          organizationId,
          customerExternalId,
          page: 'validate-magic-link',
        }),
      }
    )
    logger.info(
      'Primary email verified, login with magic link email sent to existing user',
      emailAndUserId
    )
  } else {
    await sendVerificationEmailToUser(user, {
      organizationId,
      customerExternalId,
    })
    logger.info(
      'Primary email not verified, verification link email sent to existing user',
      emailAndUserId
    )
  }
}
