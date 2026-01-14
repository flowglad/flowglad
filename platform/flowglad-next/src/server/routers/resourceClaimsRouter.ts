import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { authenticatedProcedureTransaction } from '@/db/authenticatedTransaction'
import { resourceClaimsClientSelectSchema } from '@/db/schema/resourceClaims'
import type { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import {
  countActiveClaimsForSubscriptionItemFeatures,
  selectActiveResourceClaims,
} from '@/db/tableMethods/resourceClaimMethods'
import { selectResources } from '@/db/tableMethods/resourceMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import type { DbTransaction } from '@/db/types'
import {
  claimResourceInputSchema,
  claimResourceTransaction,
  getResourceUsageInputSchema,
  releaseResourceInputSchema,
  releaseResourceTransaction,
} from '@/resources/resourceClaimHelpers'
import { devOnlyProcedure, router } from '@/server/trpc'
import { FeatureType } from '@/types'
import { trpcToRest } from '@/utils/openapi'

export const resourceClaimsRouteConfigs = [
  trpcToRest('resourceClaims.claim', {
    routeParams: ['subscriptionId'],
  }),
  trpcToRest('resourceClaims.release', {
    routeParams: ['subscriptionId'],
  }),
  trpcToRest('resourceClaims.getUsage', {
    routeParams: ['subscriptionId'],
  }),
  trpcToRest('resourceClaims.listClaims', {
    routeParams: ['subscriptionId'],
  }),
]

const resourceUsageOutputSchema = z.object({
  resourceSlug: z.string(),
  resourceId: z.string(),
  capacity: z.number().int(),
  claimed: z.number().int(),
  available: z.number().int(),
})

const claimOutputSchema = z.object({
  claims: z.array(resourceClaimsClientSelectSchema),
  usage: resourceUsageOutputSchema,
})

const releaseOutputSchema = z.object({
  releasedClaims: z.array(resourceClaimsClientSelectSchema),
  usage: resourceUsageOutputSchema,
})

const getUsageOutputSchema = z.object({
  usage: z.array(
    z.object({
      resourceSlug: z.string(),
      resourceId: z.string(),
      capacity: z.number().int(),
      claimed: z.number().int(),
      available: z.number().int(),
    })
  ),
  claims: z.array(resourceClaimsClientSelectSchema),
})

const listClaimsInputSchema = z.object({
  subscriptionId: z.string(),
  resourceSlug: z.string().optional(),
})

const listClaimsOutputSchema = z.object({
  claims: z.array(resourceClaimsClientSelectSchema),
})

// Override the input schemas to make subscriptionId required for router endpoints
const claimInputSchemaWithRequiredSubscription =
  claimResourceInputSchema
    .safeExtend({
      subscriptionId: z.string(),
    })
    .refine(
      (data) => {
        const provided = [
          data.quantity !== undefined,
          data.externalId !== undefined,
          data.externalIds !== undefined,
        ].filter(Boolean)
        return provided.length === 1
      },
      {
        message:
          'Exactly one of quantity, externalId, or externalIds must be provided',
      }
    )

const releaseInputSchemaWithRequiredSubscription =
  releaseResourceInputSchema
    .safeExtend({
      subscriptionId: z.string(),
    })
    .refine(
      (data) => {
        const provided = [
          data.quantity !== undefined,
          data.externalId !== undefined,
          data.externalIds !== undefined,
          data.claimIds !== undefined,
        ].filter(Boolean)
        return provided.length === 1
      },
      {
        message:
          'Exactly one of quantity, externalId, externalIds, or claimIds must be provided',
      }
    )

const getUsageInputSchemaWithRequiredSubscription =
  getResourceUsageInputSchema.extend({
    subscriptionId: z.string(),
  })

/**
 * Validates that a subscription belongs to the authenticated organization.
 * Returns the subscription and its customerId if valid.
 */
async function validateSubscriptionOwnership(
  subscriptionId: string,
  organizationId: string,
  transaction: DbTransaction
): Promise<{
  subscription: Awaited<ReturnType<typeof selectSubscriptionById>>
  customerId: string
}> {
  const subscription = await selectSubscriptionById(
    subscriptionId,
    transaction
  )

  if (subscription.organizationId !== organizationId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Subscription not found',
    })
  }

  return { subscription, customerId: subscription.customerId }
}

const claimProcedure = devOnlyProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/resource-claims/{subscriptionId}/claim',
      summary: 'Claim Resource',
      description:
        'Claim a resource for a subscription. Exactly one of quantity, externalId, or externalIds must be provided.',
      tags: ['Resource Claims'],
      protect: true,
    },
  })
  .input(claimInputSchemaWithRequiredSubscription)
  .output(claimOutputSchema)
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction, organizationId }) => {
        const { customerId } = await validateSubscriptionOwnership(
          input.subscriptionId,
          organizationId,
          transaction
        )

        const result = await claimResourceTransaction(
          {
            organizationId,
            customerId,
            input,
          },
          transaction
        )

        return result
      }
    )
  )

const releaseProcedure = devOnlyProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/resource-claims/{subscriptionId}/release',
      summary: 'Release Resource',
      description:
        'Release claimed resources for a subscription. Exactly one of quantity, externalId, externalIds, or claimIds must be provided.',
      tags: ['Resource Claims'],
      protect: true,
    },
  })
  .input(releaseInputSchemaWithRequiredSubscription)
  .output(releaseOutputSchema)
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction, organizationId }) => {
        const { customerId } = await validateSubscriptionOwnership(
          input.subscriptionId,
          organizationId,
          transaction
        )

        const result = await releaseResourceTransaction(
          {
            organizationId,
            customerId,
            input,
          },
          transaction
        )

        return result
      }
    )
  )

const getUsageProcedure = devOnlyProcedure
  .meta({
    openapi: {
      method: 'GET',
      path: '/api/v1/resource-claims/{subscriptionId}/usage',
      summary: 'Get Resource Usage',
      description:
        'Get resource usage information for a subscription. Optionally filter by resourceSlug.',
      tags: ['Resource Claims'],
      protect: true,
    },
  })
  .input(getUsageInputSchemaWithRequiredSubscription)
  .output(getUsageOutputSchema)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction, organizationId }) => {
        const { subscription } = await validateSubscriptionOwnership(
          input.subscriptionId,
          organizationId,
          transaction
        )

        // Get all subscription items for this subscription
        const subscriptionItemsList = await selectSubscriptionItems(
          { subscriptionId: input.subscriptionId },
          transaction
        )

        if (subscriptionItemsList.length === 0) {
          return { usage: [], claims: [] }
        }

        // Batch fetch all subscription item features for all items at once
        const subscriptionItemIds = subscriptionItemsList.map(
          (item) => item.id
        )
        const allFeatures = await selectSubscriptionItemFeatures(
          { subscriptionItemId: subscriptionItemIds },
          transaction
        )

        // Filter to only resource features
        const resourceFeatures = allFeatures.filter(
          (
            feature
          ): feature is SubscriptionItemFeature.ResourceRecord =>
            feature.type === FeatureType.Resource &&
            feature.resourceId !== null
        )

        if (resourceFeatures.length === 0) {
          return { usage: [], claims: [] }
        }

        // Collect unique resource IDs
        const resourceIds = [
          ...new Set(resourceFeatures.map((f) => f.resourceId!)),
        ]

        // Batch fetch all resources at once
        const resourcesResult = await selectResources(
          { id: resourceIds },
          transaction
        )
        const resourcesById = new Map(
          resourcesResult.map((r) => [r.id, r])
        )

        // If a specific resourceSlug is requested, filter
        let featuresToQuery = resourceFeatures
        if (input.resourceSlug) {
          const matchingResource = resourcesResult.find(
            (r) =>
              r.slug === input.resourceSlug &&
              r.pricingModelId === subscription.pricingModelId &&
              r.organizationId === organizationId
          )

          if (!matchingResource) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Resource not found',
            })
          }

          featuresToQuery = resourceFeatures.filter(
            (rf) => rf.resourceId === matchingResource.id
          )
        }

        // Batch fetch active claim counts for all features in a single query
        const featureIds = featuresToQuery.map((f) => f.id)
        const claimCountsByFeatureId =
          await countActiveClaimsForSubscriptionItemFeatures(
            featureIds,
            transaction
          )

        // Build usage results by combining feature capacity with batched claim counts
        const usageResults = featuresToQuery
          .map((feature) => {
            const resource = resourcesById.get(feature.resourceId!)
            if (!resource) {
              return null
            }

            const capacity = feature.amount
            const claimed =
              claimCountsByFeatureId.get(feature.id) ?? 0
            const available = capacity - claimed

            return {
              resourceSlug: resource.slug,
              resourceId: resource.id,
              capacity,
              claimed,
              available,
            }
          })
          .filter(
            (
              result
            ): result is {
              resourceSlug: string
              resourceId: string
              capacity: number
              claimed: number
              available: number
            } => result !== null
          )

        // Fetch active claims for the resources being returned
        const usageResourceIds = usageResults.map((u) => u.resourceId)
        const claims =
          usageResourceIds.length > 0
            ? await selectActiveResourceClaims(
                {
                  subscriptionId: input.subscriptionId,
                  resourceId: usageResourceIds,
                },
                transaction
              )
            : []

        return { usage: usageResults, claims }
      }
    )
  )

const listClaimsProcedure = devOnlyProcedure
  .meta({
    openapi: {
      method: 'GET',
      path: '/api/v1/resource-claims/{subscriptionId}/claims',
      summary: 'List Resource Claims',
      description:
        'List active resource claims for a subscription. Optionally filter by resourceSlug.',
      tags: ['Resource Claims'],
      protect: true,
    },
  })
  .input(listClaimsInputSchema)
  .output(listClaimsOutputSchema)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction, organizationId }) => {
        const { subscription } = await validateSubscriptionOwnership(
          input.subscriptionId,
          organizationId,
          transaction
        )

        // Build the where clause for claims
        const whereClause: {
          subscriptionId: string
          resourceId?: string
        } = {
          subscriptionId: input.subscriptionId,
        }

        // If resourceSlug is provided, resolve to resourceId
        if (input.resourceSlug) {
          const resources = await selectResources(
            {
              slug: input.resourceSlug,
              pricingModelId: subscription.pricingModelId,
              organizationId,
            },
            transaction
          )

          if (resources.length === 0) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Resource not found',
            })
          }

          whereClause.resourceId = resources[0].id
        }

        // Get active claims
        const claims = await selectActiveResourceClaims(
          whereClause,
          transaction
        )

        return { claims }
      }
    )
  )

export const resourceClaimsRouter = router({
  claim: claimProcedure,
  release: releaseProcedure,
  getUsage: getUsageProcedure,
  listClaims: listClaimsProcedure,
})
