import { NextResponse } from 'next/server'
import { withBillingApiRequestValidation } from '@/utils/hostedBillingApiHelpers'
import { z } from 'zod'
import { hostedBillingStackServerApp } from '@/stack'
import { adminTransaction } from '@/db/adminTransaction'
import { verifyApiKey } from '@/utils/unkey'
import { verifyBillingPortalApiKeyTransaction } from '@/utils/apiKeyHelpers'

const requestSchema = z.object({
  organizationId: z.string(),
})

/**
 * This method:
 * 0) Validates the request, including verifying the requestor is authenticated in the billing portal
 * 1) Attempts to find a customer by the provided organizationId
 * 2) If no customer is found, returns a 401
 * 3) If a customer is found, attempts to access the API key
 * 4) If the API key is valid, returns a 200
 * 5) If the API key is invalid, creates a new API key
 * 6) Returns a 200
 */
export const POST = withBillingApiRequestValidation(
  async (request) => {
    try {
      const body = await request.json()
      const { organizationId } = requestSchema.parse(body)

      const user = await hostedBillingStackServerApp.getUser()
      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 401 }
        )
      }

      const apiKey = user.serverMetadata?.[organizationId]
      if (!apiKey) {
        return NextResponse.json(
          { error: 'API key not found' },
          { status: 401 }
        )
      }

      const verifyResult = await verifyApiKey(apiKey)
      if (verifyResult.valid) {
        return NextResponse.json({ success: true })
      }
      // Remove invalid key from metadata
      const updatedMetadata = { ...user.serverMetadata }
      delete updatedMetadata[organizationId]

      // Create new API key
      const result = await adminTransaction(
        async ({ transaction }) => {
          return verifyBillingPortalApiKeyTransaction(
            {
              organizationId,
              livemode: request.livemode,
              user,
            },
            transaction
          )
        },
        {
          livemode: request.livemode,
        }
      )

      if (!result) {
        return NextResponse.json(
          { error: 'Failed to verify billing portal API key' },
          { status: 400 }
        )
      }

      const { shownOnlyOnceKey } = result

      // Update user metadata with new key
      await user.update({
        serverMetadata: {
          ...updatedMetadata,
          [organizationId]: shownOnlyOnceKey,
        },
      })
      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Error in verify-billing-portal-api-key:', error)
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
