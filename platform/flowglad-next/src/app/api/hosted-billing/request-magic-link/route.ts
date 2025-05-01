import { z } from 'zod'
import { NextResponse } from 'next/server'
import {
  setHostedBillingCustomerExternalIdForStackAuthUser,
  withBillingApiRequestValidation,
} from '@/utils/hostedBillingApiHelpers'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectCustomers,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import { hostedBillingStackServerApp } from '@/stack'
import { logger } from '@/utils/logger'
import { trace, SpanStatusCode, context } from '@opentelemetry/api'
import { ServerUser } from '@stackframe/stack'
import core from '@/utils/core'

const requestSchema = z.object({
  organizationId: z.string(),
  customerEmail: z.string().email(),
  customerExternalId: z.string(),
})

const sendVerificationEmailToUser = async (
  user: ServerUser,
  baseURL: string
) => {
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
    callbackUrl: `${baseURL}/verify-email`,
  })
  logger.info('Verification link email sent', {
    userPrimaryEmail: user.primaryEmail,
    stackAuthUserId: user.id,
    primaryContactChannel: primaryContactChannel.value,
  })
}

const createUserAndSendMagicLink = async (params: {
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
          await updateCustomer(
            {
              id: params.customerId,
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

async function sendEmailToExistingUser({
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
  const baseURL = `${core.envVariable('HOSTED_BILLING_PORTAL_URL')}/api/${organizationId}/${customerExternalId}`
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
    baseURL,
    primaryEmailVerified: user.primaryEmailVerified,
  }
  if (user.primaryEmailVerified) {
    await hostedBillingStackServerApp.sendMagicLinkEmail(
      user.primaryEmail!,
      {
        callbackUrl: `${baseURL}/validate-magic-link`,
      }
    )
    logger.info(
      'Primary email verified, login with magic link email sent to existing user',
      emailAndUserId
    )
  } else {
    await sendVerificationEmailToUser(user, baseURL)
    logger.info(
      'Primary email not verified, verification link email sent to existing user',
      emailAndUserId
    )
  }
}

export const POST = withBillingApiRequestValidation(
  async (request) => {
    const tracer = trace.getTracer('magic-link-request')
    return tracer.startActiveSpan(
      'requestMagicLink',
      async (span) => {
        try {
          const body = await request.json()
          const {
            organizationId,
            customerEmail,
            customerExternalId,
          } = requestSchema.parse(body)

          span.setAttributes({
            'organization.id': organizationId,
            'customer.email': customerEmail,
            'customer.external_id': customerExternalId,
            'billing.livemode': request.livemode,
          })

          logger.info('Processing magic link request', {
            organizationId,
            customerEmail,
            customerExternalId,
            livemode: request.livemode,
          })

          const customer = await adminTransaction(
            async ({ transaction }) => {
              const customers = await selectCustomers(
                {
                  organizationId,
                  email: customerEmail,
                  externalId: customerExternalId,
                },
                transaction
              )

              return customers[0]
            }
          )

          if (!customer) {
            logger.info(
              'No customer found, silently returning success',
              {
                organizationId,
                customerEmail,
                customerExternalId,
              }
            )
            span.setStatus({ code: SpanStatusCode.OK })
            return NextResponse.json({ success: true })
          }

          logger.info('Customer found', {
            customerId: customer.id,
            customerEmail: customer.email,
            hasStackAuthUserId:
              !!customer.stackAuthHostedBillingUserId,
            stackAuthUserId: customer.stackAuthHostedBillingUserId,
          })

          if (customer.stackAuthHostedBillingUserId) {
            logger.info('Sending magic link to existing user', {
              customerId: customer.id,
              customerEmail: customer.email,
            })
            const user = await hostedBillingStackServerApp.getUser(
              customer.stackAuthHostedBillingUserId
            )
            if (!user) {
              throw new Error('Stack Auth user not found')
            }
            await setHostedBillingCustomerExternalIdForStackAuthUser({
              stackAuthUser: user,
              organizationId,
              customerExternalId,
            })
            await sendEmailToExistingUser({
              user,
              customerId: customer.id,
              customerName: customer.name,
              organizationId,
              customerExternalId,
            })
          } else {
            logger.info('Creating new user and sending magic link', {
              customerId: customer.id,
              customerEmail: customer.email,
            })

            await createUserAndSendMagicLink({
              customerEmail,
              customerId: customer.id,
              customerName: customer.name,
              organizationId,
              customerExternalId,
            })
          }

          span.setStatus({ code: SpanStatusCode.OK })
          return NextResponse.json({ success: true })
        } catch (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message:
              error instanceof Error
                ? error.message
                : 'Internal server error',
          })
          span.setAttributes({
            'error.type': 'MAGIC_LINK_REQUEST_ERROR',
          })

          logger.error('Error in request-magic-link', {
            error:
              error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            path: request.nextUrl.pathname,
          })

          console.error('====Error in request-magic-link', {
            error,
          })

          return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
          )
        } finally {
          span.end()
        }
      }
    )
  }
)
