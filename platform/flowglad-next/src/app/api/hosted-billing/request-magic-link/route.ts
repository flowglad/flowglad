import { z } from 'zod'
import { NextResponse } from 'next/server'
import { withBillingApiRequestValidation } from '@/utils/hostedBillingApiHelpers'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectCustomers,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import { hostedBillingStackServerApp } from '@/stack'
import { logger } from '@/utils/logger'
import { trace, SpanStatusCode, context } from '@opentelemetry/api'

const requestSchema = z.object({
  organizationId: z.string(),
  customerEmail: z.string().email(),
  customerExternalId: z.string(),
})

const createUserAndSendMagicLink = async (params: {
  customerEmail: string
  customerId: string
  customerName: string
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

        await hostedBillingStackServerApp.sendMagicLinkEmail(
          params.customerEmail
        )

        logger.info('Magic link email sent', {
          customerEmail: params.customerEmail,
          userId: user.id,
        })

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
  customerEmail,
  customerId,
  customerName,
  stackAuthUserId,
}: {
  customerEmail: string
  customerId: string
  customerName: string
  stackAuthUserId: string
}) {
  logger.info(
    'Customer already has Stack Auth user ID, sending magic link',
    {
      customerId,
      stackAuthUserId,
    }
  )
  const stackAuthUser =
    await hostedBillingStackServerApp.getUser(stackAuthUserId)
  if (!stackAuthUser) {
    throw new Error(
      'Stack Auth user not found, please contact support'
    )
  }

  if (stackAuthUser.primaryEmailVerified) {
    await hostedBillingStackServerApp.sendMagicLinkEmail(
      customerEmail,
      {
        callbackUrl: 'http://localhost:3001/validate-magic-link',
      }
    )
    logger.info('Magic link email sent to existing user', {
      customerEmail,
      stackAuthUserId,
    })
  } else {
    const contactChannels = await stackAuthUser.listContactChannels()
    const primaryContactChannel = contactChannels.find(
      (channel) => channel.type === 'email' && channel.isPrimary
    )
    if (!primaryContactChannel) {
      logger.error(
        'No primary email contact channel found for stack auth user',
        {
          customerEmail,
          stackAuthUserId,
        }
      )
      throw new Error('No primary contact channel found')
    }
    await primaryContactChannel.sendVerificationEmail()
    logger.info('Verification email sent to existing user', {
      customerEmail,
      stackAuthUserId,
    })
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
          })

          if (customer.stackAuthHostedBillingUserId) {
            logger.info('Creating new user and sending magic link', {
              customerId: customer.id,
              customerEmail: customer.email,
            })

            await sendEmailToExistingUser({
              customerEmail,
              customerId: customer.id,
              customerName: customer.name,
              stackAuthUserId: customer.stackAuthHostedBillingUserId,
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
