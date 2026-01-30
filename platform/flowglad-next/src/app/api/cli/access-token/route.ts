import { FlowgladApiKeyType } from '@db-core/enums'
import type { ApiKey } from '@db-core/schema/apiKeys'
import { cliSessionApiKeyMetadataSchema } from '@db-core/schema/apiKeys'
import type { PricingModel } from '@db-core/schema/pricingModels'
import { Result } from 'better-result'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMemberships } from '@/db/tableMethods/membershipMethods'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import { selectUsers } from '@/db/tableMethods/userMethods'
import { auth } from '@/utils/auth'
import core from '@/utils/core'
import { unkey } from '@/utils/unkey'

export const runtime = 'nodejs'

const accessTokenRequestSchema = z.object({
  organizationId: z.string(),
  pricingModelId: z.string(),
  livemode: z.boolean(),
})

export type AccessTokenRequest = z.infer<
  typeof accessTokenRequestSchema
>

export interface AccessTokenResponse {
  accessToken: string
  expiresAt: string
}

type ValidationResult =
  | { valid: false; error: string; status: number }
  | { valid: true; userId: string; pricingModel: PricingModel.Record }

export async function POST(request: Request): Promise<NextResponse> {
  // Get the session from the Authorization header (Better Auth session token)
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Invalid or expired session',
      },
      { status: 401 }
    )
  }

  const betterAuthUserId = session.user.id

  // Parse and validate the request body
  let body: AccessTokenRequest
  try {
    const rawBody = await request.json()
    body = accessTokenRequestSchema.parse(rawBody)
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Bad Request',
        message: 'Invalid request body',
      },
      { status: 400 }
    )
  }

  const { organizationId, pricingModelId, livemode } = body

  // Validate user has access to the organization and pricing model
  const validationResult = await adminTransaction(
    async ({ transaction }): Promise<ValidationResult> => {
      // Get the application user from their Better Auth ID
      const [applicationUser] = await selectUsers(
        { betterAuthId: betterAuthUserId },
        transaction
      )

      if (!applicationUser) {
        return {
          valid: false,
          error: 'User not found',
          status: 404,
        }
      }

      // Check membership in the organization
      const memberships = await selectMemberships(
        { userId: applicationUser.id, organizationId },
        transaction
      )

      if (memberships.length === 0) {
        return {
          valid: false,
          error: 'User does not have access to this organization',
          status: 403,
        }
      }

      // Verify pricing model exists and belongs to the organization
      const pricingModelResult = await selectPricingModelById(
        pricingModelId,
        transaction
      )

      if (Result.isError(pricingModelResult)) {
        return {
          valid: false,
          error: 'Pricing model not found',
          status: 404,
        }
      }

      const pricingModel = pricingModelResult.value
      if (pricingModel.organizationId !== organizationId) {
        return {
          valid: false,
          error: 'Pricing model does not belong to this organization',
          status: 403,
        }
      }

      if (pricingModel.livemode !== livemode) {
        return {
          valid: false,
          error: `Pricing model livemode mismatch. Expected ${livemode}, got ${pricingModel.livemode}`,
          status: 400,
        }
      }

      return {
        valid: true,
        userId: applicationUser.id,
        pricingModel,
      }
    }
  )

  if (!validationResult.valid) {
    return NextResponse.json(
      { error: validationResult.error },
      { status: validationResult.status }
    )
  }

  // Create Unkey API key with 10-minute TTL
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
  const pmIdSuffix = pricingModelId
    .replace('pricing_model_', '')
    .slice(0, 4)

  const maybeStagingPrefix = core.IS_PROD ? '' : 'stg_'
  const prefix = `${maybeStagingPrefix}cli_${livemode ? 'live' : 'test'}_${pmIdSuffix}_`

  const cliMeta: ApiKey.CliSessionMetadata = {
    type: FlowgladApiKeyType.CliSession,
    userId: validationResult.userId,
    organizationId,
    pricingModelId,
  }

  // Validate metadata schema (ensures type safety)
  const validatedMeta = cliSessionApiKeyMetadataSchema.parse(cliMeta)

  let createKeyResult
  try {
    createKeyResult = await unkey().keys.createKey({
      apiId: core.envVariable('UNKEY_API_ID'),
      name: `CLI Session - ${organizationId} / ${pricingModelId}`,
      expires: expiresAt.getTime(),
      externalId: organizationId,
      prefix,
      meta: validatedMeta,
    })
  } catch (error) {
    console.error('Failed to create Unkey API key:', error)
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to create access token',
      },
      { status: 500 }
    )
  }

  // Check for API error response or missing key
  if (!createKeyResult.data?.key) {
    console.error('Unkey API error: missing key in response')
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to create access token',
      },
      { status: 500 }
    )
  }

  const response: AccessTokenResponse = {
    accessToken: createKeyResult.data.key,
    expiresAt: expiresAt.toISOString(),
  }

  return NextResponse.json(response)
}
