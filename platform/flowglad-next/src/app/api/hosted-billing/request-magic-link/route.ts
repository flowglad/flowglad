import { z } from 'zod'
import { NextResponse } from 'next/server'
import {
  setHostedBillingCustomerExternalIdForStackAuthUser,
  withBillingApiRequestValidation,
} from '@/utils/hostedBillingApiHelpers'
import { adminTransaction } from '@/db/adminTransaction'
import {
  mapCustomerEmailToStackAuthHostedBillingUserId,
  selectCustomers,
} from '@/db/tableMethods/customerMethods'
import { hostedBillingStackServerApp } from '@/stack'
import { logger } from '@/utils/logger'
import { trace, SpanStatusCode } from '@opentelemetry/api'
import {
  createUserAndSendMagicLink,
  sendEmailToExistingUser,
} from './sendMagicLinkHandlers'
import { Customer } from '@/db/schema/customers'

const requestSchema = z.object({
  organizationId: z.string(),
  customerEmail: z.string().email(),
  customerExternalId: z.string(),
})

async function sendMagicLinkAndUpdateCustomerForIdentifiedStackAuthUser({
  customer,
  organizationId,
  customerExternalId,
}: {
  customer: Customer.Record
  organizationId: string
  customerExternalId: string
}) {
  if (!customer.stackAuthHostedBillingUserId) {
    throw new Error('Customer has no stack auth user id')
  }
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
}

async function sendMagicLinkAndUpdateCustomerForUnidentifiedStackAuthUser({
  customer,
  organizationId,
}: {
  customer: Customer.Record
  organizationId: string
}) {
  const stackAuthHostedBillingUserId = await adminTransaction(
    async ({ transaction }) => {
      return await mapCustomerEmailToStackAuthHostedBillingUserId(
        customer.email,
        transaction
      )
    }
  )
  if (!stackAuthHostedBillingUserId) {
    await createUserAndSendMagicLink({
      customerEmail: customer.email,
      customerId: customer.id,
      customerName: customer.name,
      organizationId,
      customerExternalId: customer.externalId,
    })
  } else {
    const user = await hostedBillingStackServerApp.getUser(
      stackAuthHostedBillingUserId
    )
    if (!user) {
      throw new Error('Stack Auth user not found')
    }
    await sendEmailToExistingUser({
      user,
      customerId: customer.id,
      customerName: customer.name,
      organizationId,
      customerExternalId: customer.externalId,
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
            stackAuthUserId: customer.stackAuthHostedBillingUserId,
          })

          if (customer.stackAuthHostedBillingUserId) {
            logger.info('Sending magic link to existing user', {
              customerId: customer.id,
              customerEmail: customer.email,
            })
            await sendMagicLinkAndUpdateCustomerForIdentifiedStackAuthUser(
              {
                customer,
                organizationId,
                customerExternalId,
              }
            )
          } else {
            logger.info('Creating new user and sending magic link', {
              customerId: customer.id,
              customerEmail: customer.email,
            })
            await sendMagicLinkAndUpdateCustomerForUnidentifiedStackAuthUser(
              {
                customer,
                organizationId,
              }
            )
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
