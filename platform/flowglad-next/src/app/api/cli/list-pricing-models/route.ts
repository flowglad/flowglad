import { Result } from 'better-result'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMembershipAndOrganizationsByBetterAuthUserId } from '@/db/tableMethods/membershipMethods'
import {
  selectPricingModelById,
  selectPricingModels,
} from '@/db/tableMethods/pricingModelMethods'
import { auth } from '@/utils/auth'

export const runtime = 'nodejs'

const querySchema = z.object({
  organizationId: z.string().optional(),
  pricingModelId: z.string().optional(),
  livemode: z.enum(['true', 'false']).optional().default('false'),
})

export interface ListPricingModelsResponse {
  organization?: {
    id: string
    name: string
  }
  pricingModels: Array<{
    id: string
    name: string
    isDefault: boolean
    updatedAt: string
  }>
}

type PricingModelInfo = {
  id: string
  name: string
  isDefault: boolean
  updatedAt: string
}

type SuccessResult =
  | { pricingModels: PricingModelInfo[] }
  | {
      organization: { id: string; name: string }
      pricingModels: PricingModelInfo[]
    }

type ErrorResult = { error: string; status: number }

export async function GET(request: Request): Promise<NextResponse> {
  // Get Better Auth session
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

  // Parse query params
  const url = new URL(request.url)
  const parseResult = querySchema.safeParse({
    organizationId:
      url.searchParams.get('organizationId') ?? undefined,
    pricingModelId:
      url.searchParams.get('pricingModelId') ?? undefined,
    livemode: url.searchParams.get('livemode') ?? 'false',
  })

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'Bad Request',
        message: 'Invalid query parameters',
      },
      { status: 400 }
    )
  }

  const { organizationId, pricingModelId, livemode } =
    parseResult.data
  const isLivemode = livemode === 'true'

  // Require at least one of organizationId or pricingModelId
  if (!organizationId && !pricingModelId) {
    return NextResponse.json(
      {
        error: 'Bad Request',
        message: 'organizationId or pricingModelId is required',
      },
      { status: 400 }
    )
  }

  const betterAuthUserId = session.user.id

  const result = await adminTransaction(
    async ({
      transaction,
    }): Promise<Result<SuccessResult | ErrorResult, Error>> => {
      // Get memberships and orgs - deactivated memberships are filtered out by default
      const memberships =
        await selectMembershipAndOrganizationsByBetterAuthUserId(
          betterAuthUserId,
          transaction
        )

      // If pricingModelId provided alone, look up that PM and return with org info
      if (pricingModelId && !organizationId) {
        const pmResult = await selectPricingModelById(
          pricingModelId,
          transaction
        )
        if (Result.isError(pmResult)) {
          return Result.ok({
            error: 'Pricing model not found',
            status: 404,
          })
        }
        const pm = pmResult.value

        // Check user has access to the PM's org
        const pmOrg = memberships.find(
          (m) => m.organization.id === pm.organizationId
        )
        if (!pmOrg) {
          return Result.ok({ error: 'Forbidden', status: 403 })
        }

        return Result.ok({
          organization: {
            id: pmOrg.organization.id,
            name: pmOrg.organization.name,
          },
          pricingModels: [
            {
              id: pm.id,
              name: pm.name,
              isDefault: pm.isDefault,
              updatedAt: new Date(pm.updatedAt).toISOString(),
            },
          ],
        })
      }

      // Standard case: list all PMs for given org
      const hasAccess = memberships.some(
        (m) => m.organization.id === organizationId
      )
      if (!hasAccess) {
        return Result.ok({ error: 'Forbidden', status: 403 })
      }

      // Fetch pricing models
      const pms = await selectPricingModels(
        { organizationId: organizationId!, livemode: isLivemode },
        transaction
      )

      return Result.ok({
        pricingModels: pms.map((pm) => ({
          id: pm.id,
          name: pm.name,
          isDefault: pm.isDefault,
          updatedAt: new Date(pm.updatedAt).toISOString(),
        })),
      })
    },
    { livemode: isLivemode }
  )

  if (Result.isError(result)) {
    console.error('list-pricing-models error:', result.error)
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to retrieve pricing models',
      },
      { status: 500 }
    )
  }

  const data = result.value

  if ('error' in data) {
    return NextResponse.json(
      { error: data.error },
      { status: data.status }
    )
  }

  const response: ListPricingModelsResponse = data
  return NextResponse.json(response)
}
