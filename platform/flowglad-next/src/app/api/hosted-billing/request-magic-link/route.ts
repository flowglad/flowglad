import { z } from 'zod'
import { NextResponse } from 'next/server'
import { withBillingApiRequestValidation } from '@/utils/hostedBillingApiHelpers'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectCustomers,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import { hostedBillingStackServerApp } from '@/stack'

const requestSchema = z.object({
  organizationId: z.string(),
  customerEmail: z.string().email(),
})

const createUserAndSendMagicLink = async (params: {
  customerEmail: string
  customerId: string
  customerName: string
}) => {
  const user = await hostedBillingStackServerApp.createUser({
    primaryEmail: params.customerEmail,
    primaryEmailAuthEnabled: true,
    displayName: params.customerName,
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
  await hostedBillingStackServerApp.sendMagicLinkEmail(
    params.customerEmail
  )
}

export const POST = withBillingApiRequestValidation(
  async (request) => {
    try {
      const body = await request.json()
      const { organizationId, customerEmail } =
        requestSchema.parse(body)

      const customer = await adminTransaction(
        async ({ transaction }) => {
          const customers = await selectCustomers(
            {
              organizationId,
              email: customerEmail,
            },
            transaction
          )

          return customers[0]
        }
      )

      if (!customer) {
        return NextResponse.json({ success: true })
      }

      if (customer.stackAuthHostedBillingUserId) {
        await hostedBillingStackServerApp.sendMagicLinkEmail(
          customerEmail
        )
      } else {
        await createUserAndSendMagicLink({
          customerEmail,
          customerId: customer.id,
          customerName: customer.name,
        })
      }
      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Error in request-magic-link:', error)
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
)
