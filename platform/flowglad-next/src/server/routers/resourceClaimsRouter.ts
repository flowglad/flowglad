import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { authenticatedProcedureTransaction } from '@/db/authenticatedTransaction'
import { resourceClaimsClientSelectSchema } from '@/db/schema/resourceClaims'
import type { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import { selectActiveResourceClaims } from '@/db/tableMethods/resourceClaimMethods'
import { selectResources } from '@/db/tableMethods/resourceMethods'
import { selectSubscriptionItemFeaturesBySubscriptionItemIds } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { metadataSchema } from '@/db/tableUtils'
import {
  claimResourceTransaction,
  getResourceUsage,
  releaseResourceTransaction,
} from '@/resources/resourceClaimHelpers'
import { devOnlyProcedure, router } from '@/server/trpc'
import { FeatureType } from '@/types'

const resourceUsageOutputSchema = z.object({
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
})

/**
 * Shared input schema for claim operations.
 * subscriptionId is required to avoid arbitrary subscription selection.
 */
const claimResourceInputSchema = z
  .object({
    resourceSlug: z
      .string()
      .describe('The slug of the resource to claim'),
    subscriptionId: z
      .string()
      .describe('The subscription ID to claim resources for'),
    metadata: metadataSchema
      .optional()
      .describe('Optional metadata to attach to the claim(s)'),
    quantity: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Create N anonymous claims'),
    externalId: z
      .string()
      .max(255)
      .optional()
      .describe(
        'Create a single non-anonymous claim with this external identifier'
      ),
    externalIds: z
      .array(z.string().max(255))
      .nonempty()
      .optional()
      .describe(
        'Create multiple non-anonymous claims with these external identifiers'
      ),
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

/**
 * Shared input schema for release operations.
 * subscriptionId is required to avoid arbitrary subscription selection.
 */
const releaseResourceInputSchema = z
  .object({
    resourceSlug: z
      .string()
      .describe('The slug of the resource to release'),
    subscriptionId: z
      .string()
      .describe('The subscription ID to release resources for'),
    quantity: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Release N anonymous claims'),
    externalId: z
      .string()
      .max(255)
      .optional()
      .describe('Release a specific non-anonymous claim'),
    externalIds: z
      .array(z.string().max(255))
      .nonempty()
      .optional()
      .describe('Release multiple non-anonymous claims'),
    claimIds: z
      .array(z.string()).max(100)
      .nonempty()
      .optional()
      .describe('Release specific claims by their claim IDs'),
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

const getUsageInputSchema = z.object({
  subscriptionId: z
    .string()
    .describe('The subscription ID to get usage for'),
  resourceSlug: z
    .string()
    .optional()
    .describe('Optional resource slug to filter by'),
})

const listClaimsInputSchema = z.object({
  subscriptionId: z
    .string()
    .describe('The subscription ID to list claims for'),
  resourceSlug: z
    .string()
    .optional()
    .describe('Optional resource slug to filter by'),
})

const listClaimsOutputSchema = z.object({
  claims: z.array(resourceClaimsClientSelectSchema),
})

/**
 * Validates that a subscription belongs to the authenticated user's organization.
 * Returns the subscription if valid, throws FORBIDDEN error if not.
 * Uses generic error message to avoid leaking subscription existence.
 */
const validateSubscriptionAccess = async (
  subscriptionId: string,
  organizationId: string,
  transaction: Parameters<
    Parameters<typeof authenticatedProcedureTransaction>[0]
  >[0]['transaction']
) => {
  try {
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

    return subscription
  } catch (error) {
    // Wrap any error (including NotFoundError) in generic FORBIDDEN
    // to avoid leaking subscription existence
    if (error instanceof TRPCError) {
      throw error
    }
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Subscription not found',
    })
  }
}

const claimProcedure = devOnlyProcedure
  .input(claimResourceInputSchema)
  .output(claimOutputSchema)
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction, organizationId }) => {
        // Validate subscription belongs to this organization
        const subscription = await validateSubscriptionAccess(
          input.subscriptionId,
          organizationId,
          transaction
        )

        const result = await claimResourceTransaction(
          {
            organizationId,
            customerId: subscription.customerId,
            input: {
              resourceSlug: input.resourceSlug,
              subscriptionId: input.subscriptionId,
              metadata: input.metadata,
              quantity: input.quantity,
              externalId: input.externalId,
              externalIds: input.externalIds,
            },
          },
          transaction
        )

        return result
      }
    )
  )

const releaseProcedure = devOnlyProcedure
  .input(releaseResourceInputSchema)
  .output(releaseOutputSchema)
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction, organizationId }) => {
        // Validate subscription belongs to this organization
        const subscription = await validateSubscriptionAccess(
          input.subscriptionId,
          organizationId,
          transaction
        )

        const result = await releaseResourceTransaction(
          {
            organizationId,
            customerId: subscription.customerId,
            input: {
              resourceSlug: input.resourceSlug,
              subscriptionId: input.subscriptionId,
              quantity: input.quantity,
              externalId: input.externalId,
              externalIds: input.externalIds,
              claimIds: input.claimIds,
            },
          },
          transaction
        )

        return result
      }
    )
  )

const getUsageProcedure = devOnlyProcedure
  .input(getUsageInputSchema)
  .output(getUsageOutputSchema)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction, organizationId }) => {
        // Validate subscription belongs to this organization
        const subscription = await validateSubscriptionAccess(
          input.subscriptionId,
          organizationId,
          transaction
        )

        // Get all subscription items for this subscription
        const subscriptionItemsList = await selectSubscriptionItems(
          { subscriptionId: input.subscriptionId },
          transaction
        )

        const subscriptionItemIds = subscriptionItemsList.map(
          (item) => item.id
        )

        // Batch fetch all subscription item features (fixes N+1)
        const allFeatures =
          await selectSubscriptionItemFeaturesBySubscriptionItemIds(
            subscriptionItemIds,
            transaction
          )

        // Filter to resource features
        const allResourceFeatures: Array<{
          feature: SubscriptionItemFeature.ResourceRecord
          resourceId: string
        }> = []

        for (const feature of allFeatures) {
          if (
            feature.type === FeatureType.Resource &&
            feature.resourceId
          ) {
            allResourceFeatures.push({
              feature:
                feature as SubscriptionItemFeature.ResourceRecord,
              resourceId: feature.resourceId,
            })
          }
        }

        // If a specific resourceSlug is requested, filter
        let resourcesToQuery = allResourceFeatures
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

          const resourceId = resources[0].id
          resourcesToQuery = allResourceFeatures.filter(
            (rf) => rf.resourceId === resourceId
          )
        }

        // Batch fetch all resource details in single query
        const resourceIds = [
          ...new Set(resourcesToQuery.map((rf) => rf.resourceId)),
        ]
        const resourcesMap = new Map<
          string,
          { id: string; slug: string }
        >()

        if (resourceIds.length > 0) {
          const resourcesList = await selectResources(
            { id: resourceIds },
            transaction
          )
          for (const resource of resourcesList) {
            resourcesMap.set(resource.id, {
              id: resource.id,
              slug: resource.slug,
            })
          }
        }

        // Get usage for each resource feature
        const usageResults: Array<{
          resourceSlug: string
          resourceId: string
          capacity: number
          claimed: number
          available: number
        }> = []

        for (const { feature, resourceId } of resourcesToQuery) {
          const usage = await getResourceUsage(
            input.subscriptionId,
            feature.id,
            transaction
          )
          const resource = resourcesMap.get(resourceId)

          if (resource) {
            usageResults.push({
              resourceSlug: resource.slug,
              resourceId: resource.id,
              ...usage,
            })
          }
        }

        return { usage: usageResults }
      }
    )
  )

const listClaimsProcedure = devOnlyProcedure
  .input(listClaimsInputSchema)
  .output(listClaimsOutputSchema)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction, organizationId }) => {
        // Validate subscription belongs to this organization
        const subscription = await validateSubscriptionAccess(
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
