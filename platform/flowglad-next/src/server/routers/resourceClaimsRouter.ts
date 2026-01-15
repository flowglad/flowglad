import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  type AuthenticatedProcedureTransactionParams,
  authenticatedProcedureTransaction,
} from '@/db/authenticatedTransaction'
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
  trpcToRest('resourceClaims.listResourceUsages', {
    routeParams: ['subscriptionId'],
    routeSuffix: 'usages',
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

const getUsageOutputSchema = z
  .object({
    usage: resourceUsageOutputSchema.meta({
      id: 'ResourceUsageData',
    }),
    claims: z.array(resourceClaimsClientSelectSchema),
  })
  .meta({
    id: 'ResourceUsage',
    description: 'The usage data for a resource.',
  })

const listResourceUsagesOutputSchema = z
  .array(getUsageOutputSchema)
  .meta({
    id: 'ResourceUsageList',
    description: 'List of resource usage data for the subscription.',
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
  getResourceUsageInputSchema.safeExtend({
    subscriptionId: z.string(),
  })

/**
 * Validates that a subscription belongs to the authenticated organization.
 * Returns the subscription and its customerId if valid.
 */
const validateSubscriptionOwnership = async (
  {
    subscriptionId,
    organizationId,
  }: {
    subscriptionId: string
    organizationId: string
  },
  transaction: DbTransaction
): Promise<{
  subscription: Awaited<ReturnType<typeof selectSubscriptionById>>
  customerId: string
}> => {
  const subscription = await selectSubscriptionById(
    subscriptionId,
    transaction
  )

  if (
    !subscription ||
    subscription.organizationId !== organizationId
  ) {
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
      async ({ input, ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        const { organizationId } = ctx
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        const { customerId } = await validateSubscriptionOwnership(
          { subscriptionId: input.subscriptionId, organizationId },
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
      async ({ input, ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        const { organizationId } = ctx
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        const { customerId } = await validateSubscriptionOwnership(
          { subscriptionId: input.subscriptionId, organizationId },
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
        'Get resource usage information for a subscription. Exactly one of resourceSlug or resourceId must be provided.',
      tags: ['Resource Claims'],
      protect: true,
    },
  })
  .input(getUsageInputSchemaWithRequiredSubscription)
  .output(getUsageOutputSchema)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        const { organizationId } = ctx
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        const { subscription } = await validateSubscriptionOwnership(
          { subscriptionId: input.subscriptionId, organizationId },
          transaction
        )

        let resourceLookup:
          | {
              slug: string
              pricingModelId: string
              organizationId: string
            }
          | {
              id: string
              pricingModelId: string
              organizationId: string
            }

        if (input.resourceSlug !== undefined) {
          resourceLookup = {
            slug: input.resourceSlug,
            pricingModelId: subscription.pricingModelId,
            organizationId,
          }
        } else {
          if (input.resourceId === undefined) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'Exactly one of resourceSlug or resourceId must be provided',
            })
          }

          resourceLookup = {
            id: input.resourceId,
            pricingModelId: subscription.pricingModelId,
            organizationId,
          }
        }

        const [resource] = await selectResources(
          resourceLookup,
          transaction
        )

        if (!resource) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Resource not found',
          })
        }

        const subscriptionItemsList = await selectSubscriptionItems(
          { subscriptionId: input.subscriptionId },
          transaction
        )

        if (subscriptionItemsList.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Subscription has no items',
          })
        }

        const subscriptionItemIds = subscriptionItemsList.map(
          (item) => item.id
        )
        const allFeatures = await selectSubscriptionItemFeatures(
          { subscriptionItemId: subscriptionItemIds },
          transaction
        )

        const resourceFeature = allFeatures.find(
          (
            feature
          ): feature is SubscriptionItemFeature.ResourceRecord =>
            feature.type === FeatureType.Resource &&
            feature.resourceId === resource.id
        )

        if (!resourceFeature) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Resource is not available on this subscription',
          })
        }

        const claimed =
          (
            await countActiveClaimsForSubscriptionItemFeatures(
              [resourceFeature.id],
              transaction
            )
          ).get(resourceFeature.id) ?? 0

        const capacity = resourceFeature.amount
        const usage = {
          resourceSlug: resource.slug,
          resourceId: resource.id,
          capacity,
          claimed,
          available: capacity - claimed,
        }

        const claims = await selectActiveResourceClaims(
          {
            subscriptionId: input.subscriptionId,
            resourceId: resource.id,
          },
          transaction
        )

        return { usage, claims }
      }
    )
  )

const listResourceUsagesInputSchema = z
  .object({
    subscriptionId: z.string(),
    resourceSlugs: z
      .array(z.string())
      .max(100)
      .optional()
      .describe(
        'List of resource slugs to filter by. If not provided, will return usage for all resources on the subscription.'
      ),
    resourceIds: z
      .array(z.string())
      .optional()
      .describe(
        'List of resource IDs to filter by. If not provided, will return usage for all resources on the subscription.'
      ),
  })
  .meta({
    id: 'ListResourceUsagesInput',
  })

const listResourceUsagesProcedure = devOnlyProcedure
  .meta({
    openapi: {
      method: 'GET',
      path: '/api/v1/resource-claims/{subscriptionId}/usages',
      summary: 'List Resource Usages',
      description:
        'List resource usage information for all resources on the subscription.',
      tags: ['Resource Claims'],
      protect: true,
    },
  })
  .input(listResourceUsagesInputSchema)
  .output(listResourceUsagesOutputSchema)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        const { organizationId } = ctx
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        const { subscription } = await validateSubscriptionOwnership(
          { subscriptionId: input.subscriptionId, organizationId },
          transaction
        )

        const subscriptionItemsList = await selectSubscriptionItems(
          { subscriptionId: input.subscriptionId },
          transaction
        )

        if (subscriptionItemsList.length === 0) {
          return []
        }

        const subscriptionItemIds = subscriptionItemsList.map(
          (item) => item.id
        )
        const allFeatures = await selectSubscriptionItemFeatures(
          { subscriptionItemId: subscriptionItemIds },
          transaction
        )

        const resourceFeatures = allFeatures.filter(
          (
            feature
          ): feature is SubscriptionItemFeature.ResourceRecord =>
            feature.type === FeatureType.Resource &&
            feature.resourceId !== null
        )

        if (resourceFeatures.length === 0) {
          return []
        }

        const resourceIds = Array.from(
          new Set(resourceFeatures.map((f) => f.resourceId!))
        )

        const resourcesResult = await selectResources(
          {
            id: resourceIds,
            pricingModelId: subscription.pricingModelId,
            organizationId,
          },
          transaction
        )

        // Apply filtering based on input parameters
        let filteredResources = resourcesResult
        if (input.resourceSlugs && input.resourceSlugs.length > 0) {
          const slugSet = new Set(input.resourceSlugs)
          filteredResources = resourcesResult.filter((r) =>
            slugSet.has(r.slug)
          )
        } else if (
          input.resourceIds &&
          input.resourceIds.length > 0
        ) {
          const idSet = new Set(input.resourceIds)
          filteredResources = resourcesResult.filter((r) =>
            idSet.has(r.id)
          )
        }

        const resourcesById = new Map(
          filteredResources.map((r) => [r.id, r])
        )

        const featureIds = resourceFeatures.map((f) => f.id)
        const claimCountsByFeatureId =
          await countActiveClaimsForSubscriptionItemFeatures(
            featureIds,
            transaction
          )

        const usageResults = resourceFeatures
          .map((feature) => {
            const resource = resourcesById.get(feature.resourceId!)
            if (!resource) {
              return null
            }

            const capacity = feature.amount
            const claimed =
              claimCountsByFeatureId.get(feature.id) ?? 0

            return {
              resourceSlug: resource.slug,
              resourceId: resource.id,
              capacity,
              claimed,
              available: capacity - claimed,
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

        const usageResourceIds = usageResults.map((u) => u.resourceId)
        const claims =
          usageResourceIds.length === 0
            ? []
            : await selectActiveResourceClaims(
                {
                  subscriptionId: input.subscriptionId,
                  resourceId: usageResourceIds,
                },
                transaction
              )

        const claimsByResourceId = new Map<string, typeof claims>()
        for (const claim of claims) {
          const existing = claimsByResourceId.get(claim.resourceId)
          if (existing) {
            existing.push(claim)
          } else {
            claimsByResourceId.set(claim.resourceId, [claim])
          }
        }

        return usageResults.map((usage) => ({
          usage,
          claims: claimsByResourceId.get(usage.resourceId) ?? [],
        }))
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
      async ({ input, ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        const { organizationId } = ctx
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        const { subscription } = await validateSubscriptionOwnership(
          { subscriptionId: input.subscriptionId, organizationId },
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
  listResourceUsages: listResourceUsagesProcedure,
  listClaims: listClaimsProcedure,
})
