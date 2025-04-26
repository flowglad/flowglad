import { NextResponse } from 'next/server'
import {
  setApiKeyOnServerMetadata,
  setHostedBillingApiKeyForStackAuthUser,
  withBillingApiRequestValidation,
} from '@/utils/hostedBillingApiHelpers'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { z } from 'zod'
import { createBillingPortalApiKeyTransaction } from '@/utils/apiKeyHelpers'
import { hostedBillingStackServerApp } from '@/stack'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'

const requestSchema = z.object({
  organizationId: z.string(),
  customerExternalId: z.string(),
})

/**
 * This method:
 * 0) Validates the request, including verifying the requestor is authenticated in the billing portal
 * 1) Attempts to find a customer by the provided organizationId and customerExternalId
 * 2) If no customer is found, returns a 401
 * 3) If a customer is found, creates a billing portal API key for the customer
 * 4) Updates the user's serverMetadata with the new API key
 * 5) Returns a 200, without the API key, to prevent it from ever being exposed
 */
export const POST = withBillingApiRequestValidation(
  async (request) => {
    try {
      const body = await request.json()
      const { organizationId, customerExternalId } =
        requestSchema.parse(body)

      const result = await adminTransaction(
        async ({ transaction, livemode }) => {
          const [customer] = await selectCustomers(
            {
              organizationId,
              externalId: customerExternalId,
              livemode,
            },
            transaction
          )
          const organization = await selectOrganizationById(
            organizationId,
            transaction
          )
          if (!customer) {
            return null
          }
          const { stackAuthHostedBillingUserId } = customer
          if (!stackAuthHostedBillingUserId) {
            return null
          }
          const apiKeyResult =
            await createBillingPortalApiKeyTransaction(
              {
                organization,
                stackAuthHostedBillingUserId,
                livemode,
                name: `Billing Portal API Key for ${customer.name} (id: ${customer.id})`,
              },
              transaction
            )
          return {
            apiKeyResult,
            customer,
          }
        },
        {
          livemode: request.livemode,
        }
      )
      if (!result) {
        return NextResponse.json(
          { error: 'Customer not found' },
          { status: 401 }
        )
      }
      const { customer, apiKeyResult } = result
      const { apiKey, shownOnlyOnceKey } = apiKeyResult
      const { stackAuthHostedBillingUserId } = customer
      if (!stackAuthHostedBillingUserId) {
        return NextResponse.json(
          { error: 'Customer not found' },
          { status: 401 }
        )
      }
      const user = await hostedBillingStackServerApp.getUser(
        stackAuthHostedBillingUserId
      )
      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 401 }
        )
      }
      await setHostedBillingApiKeyForStackAuthUser({
        stackAuthUser: user,
        organizationId,
        apiKey: shownOnlyOnceKey,
      })
      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Error in request-magic-link:', error)
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  },
  {
    authenticated: true,
  }
)
