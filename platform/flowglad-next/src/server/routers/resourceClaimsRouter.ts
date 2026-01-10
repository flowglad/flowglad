import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { authenticatedProcedureTransaction } from '@/db/authenticatedTransaction'
import { resourceClaimsClientSelectSchema } from '@/db/schema/resourceClaims'
import type { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import { selectActiveResourceClaims } from '@/db/tableMethods/resourceClaimMethods'
import { selectResources } from '@/db/tableMethods/resourceMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import type { DbTransaction } from '@/db/types'
import {
  claimResourceInputSchema,
  claimResourceTransaction,
  getResourceUsage,
  getResourceUsageInputSchema,
  releaseResourceInputSchema,
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

const listClaimsInputSchema = z.object({
  subscriptionId: z.string(),
  resourceSlug: z.string().optional(),
})

const listClaimsOutputSchema = z.object({
  claims: z.array(resourceClaimsClientSelectSchema),
})

// Override the input schemas to make subscriptionId required for router endpoints
const claimInputSchemaWithRequiredSubscription =
  claimResourceInputSchema.innerType().extend({
    subscriptionId: z.string(),
  })

const releaseInputSchemaWithRequiredSubscription =
  releaseResourceInputSchema.innerType().extend({
    subscriptionId: z.string(),
  })

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
          return { usage: [] }
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
          return { usage: [] }
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

        // Get usage for each resource feature (these are individual queries but necessary for accurate counts)
        const usageResults: Array<{
          resourceSlug: string
          resourceId: string
          capacity: number
          claimed: number
          available: number
        }> = []

        for (const feature of featuresToQuery) {
          const usage = await getResourceUsage(
            input.subscriptionId,
            feature.id,
            transaction
          )

          const resource = resourcesById.get(feature.resourceId!)
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
