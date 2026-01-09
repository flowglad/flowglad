import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { resourceClaimsClientSelectSchema } from '@/db/schema/resourceClaims'
import type { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectActiveResourceClaims } from '@/db/tableMethods/resourceClaimMethods'
import { selectResources } from '@/db/tableMethods/resourceMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  isSubscriptionInTerminalState,
  selectSubscriptionById,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
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
  subscriptionId: z.string().optional(),
  resourceSlug: z.string().optional(),
})

const listClaimsOutputSchema = z.object({
  claims: z.array(resourceClaimsClientSelectSchema),
})

const claimProcedure = devOnlyProcedure
  .input(claimResourceInputSchema)
  .output(claimOutputSchema)
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, userId }) => {
        // Get organization from user's focused membership
        const [{ organization }] =
          await selectMembershipAndOrganizations(
            {
              userId,
              focused: true,
            },
            transaction
          )

        // Find customer - for API access we need to determine the customer from context
        // For now, we'll use the first customer for the organization (merchant-side operation)
        const customers = await selectCustomers(
          { organizationId: organization.id },
          transaction
        )

        if (customers.length === 0) {
          throw new Error(
            'No customers found for organization. Cannot claim resources without a customer context.'
          )
        }

        // If subscriptionId is provided, use that subscription's customer
        // Otherwise, use the first customer (this is a merchant operation)
        let customerId: string
        if (input.subscriptionId) {
          const subscription = await selectSubscriptionById(
            input.subscriptionId,
            transaction
          )
          customerId = subscription.customerId
        } else {
          // For merchant operations without a specific subscription,
          // we need to find an active subscription to work with
          const activeSubscriptions = await selectSubscriptions(
            { organizationId: organization.id },
            transaction
          )

          const nonTerminalSubscription = activeSubscriptions.find(
            (s) => !isSubscriptionInTerminalState(s.status)
          )

          if (!nonTerminalSubscription) {
            throw new Error(
              'No active subscription found. Please provide a subscriptionId.'
            )
          }

          customerId = nonTerminalSubscription.customerId
        }

        const result = await claimResourceTransaction(
          {
            organizationId: organization.id,
            customerId,
            input,
          },
          transaction
        )

        return result
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const releaseProcedure = devOnlyProcedure
  .input(releaseResourceInputSchema)
  .output(releaseOutputSchema)
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, userId }) => {
        // Get organization from user's focused membership
        const [{ organization }] =
          await selectMembershipAndOrganizations(
            {
              userId,
              focused: true,
            },
            transaction
          )

        // If subscriptionId is provided, use that subscription's customer
        let customerId: string
        if (input.subscriptionId) {
          const subscription = await selectSubscriptionById(
            input.subscriptionId,
            transaction
          )
          customerId = subscription.customerId
        } else {
          // For merchant operations without a specific subscription,
          // we need to find an active subscription to work with
          const activeSubscriptions = await selectSubscriptions(
            { organizationId: organization.id },
            transaction
          )

          const nonTerminalSubscription = activeSubscriptions.find(
            (s) => !isSubscriptionInTerminalState(s.status)
          )

          if (!nonTerminalSubscription) {
            throw new Error(
              'No active subscription found. Please provide a subscriptionId.'
            )
          }

          customerId = nonTerminalSubscription.customerId
        }

        const result = await releaseResourceTransaction(
          {
            organizationId: organization.id,
            customerId,
            input,
          },
          transaction
        )

        return result
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getUsageProcedure = devOnlyProcedure
  .input(getResourceUsageInputSchema)
  .output(getUsageOutputSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, userId }) => {
        // Get organization from user's focused membership
        const [{ organization }] =
          await selectMembershipAndOrganizations(
            {
              userId,
              focused: true,
            },
            transaction
          )

        // Resolve subscription
        let subscriptionId: string
        if (input.subscriptionId) {
          subscriptionId = input.subscriptionId
        } else {
          const activeSubscriptions = await selectSubscriptions(
            { organizationId: organization.id },
            transaction
          )

          const nonTerminalSubscription = activeSubscriptions.find(
            (s) => !isSubscriptionInTerminalState(s.status)
          )

          if (!nonTerminalSubscription) {
            throw new Error(
              'No active subscription found. Please provide a subscriptionId.'
            )
          }

          subscriptionId = nonTerminalSubscription.id
        }

        const subscription = await selectSubscriptionById(
          subscriptionId,
          transaction
        )

        // Get all subscription items for this subscription
        const subscriptionItemsList = await selectSubscriptionItems(
          { subscriptionId },
          transaction
        )

        // Get all subscription item features of type Resource
        const allResourceFeatures: Array<{
          feature: SubscriptionItemFeature.ResourceRecord
          resourceId: string
        }> = []

        for (const item of subscriptionItemsList) {
          const features = await selectSubscriptionItemFeatures(
            { subscriptionItemId: item.id },
            transaction
          )

          for (const feature of features) {
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
        }

        // If a specific resourceSlug is requested, filter
        let resourcesToQuery = allResourceFeatures
        if (input.resourceSlug) {
          const resources = await selectResources(
            {
              slug: input.resourceSlug,
              pricingModelId: subscription.pricingModelId,
              organizationId: organization.id,
            },
            transaction
          )

          if (resources.length === 0) {
            throw new Error(
              `Resource with slug "${input.resourceSlug}" not found`
            )
          }

          const resourceId = resources[0].id
          resourcesToQuery = allResourceFeatures.filter(
            (rf) => rf.resourceId === resourceId
          )
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
            subscriptionId,
            feature.id,
            transaction
          )

          // Get resource to get the slug
          const [resource] = await selectResources(
            { id: resourceId },
            transaction
          )

          if (resource) {
            usageResults.push({
              resourceSlug: resource.slug,
              resourceId: resource.id,
              ...usage,
            })
          }
        }

        return { usage: usageResults }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const listClaimsProcedure = devOnlyProcedure
  .input(listClaimsInputSchema)
  .output(listClaimsOutputSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, userId }) => {
        // Get organization from user's focused membership
        const [{ organization }] =
          await selectMembershipAndOrganizations(
            {
              userId,
              focused: true,
            },
            transaction
          )

        // Resolve subscription
        let subscriptionId: string
        if (input.subscriptionId) {
          subscriptionId = input.subscriptionId
        } else {
          const activeSubscriptions = await selectSubscriptions(
            { organizationId: organization.id },
            transaction
          )

          const nonTerminalSubscription = activeSubscriptions.find(
            (s) => !isSubscriptionInTerminalState(s.status)
          )

          if (!nonTerminalSubscription) {
            throw new Error(
              'No active subscription found. Please provide a subscriptionId.'
            )
          }

          subscriptionId = nonTerminalSubscription.id
        }

        const subscription = await selectSubscriptionById(
          subscriptionId,
          transaction
        )

        // Build the where clause for claims
        const whereClause: {
          subscriptionId: string
          resourceId?: string
        } = {
          subscriptionId,
        }

        // If resourceSlug is provided, resolve to resourceId
        if (input.resourceSlug) {
          const resources = await selectResources(
            {
              slug: input.resourceSlug,
              pricingModelId: subscription.pricingModelId,
              organizationId: organization.id,
            },
            transaction
          )

          if (resources.length === 0) {
            throw new Error(
              `Resource with slug "${input.resourceSlug}" not found`
            )
          }

          whereClause.resourceId = resources[0].id
        }

        // Get active claims
        const claims = await selectActiveResourceClaims(
          whereClause,
          transaction
        )

        return { claims }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const resourceClaimsRouter = router({
  claim: claimProcedure,
  release: releaseProcedure,
  getUsage: getUsageProcedure,
  listClaims: listClaimsProcedure,
})
