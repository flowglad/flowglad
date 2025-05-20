import { router } from '../trpc'
import {
  createSubscriptionFeatureInputSchema,
  editSubscriptionFeatureInputSchema,
  subscriptionFeaturesClientSelectSchema,
  deactivateSubscriptionFeatureInputSchema,
  SubscriptionFeature,
} from '@/db/schema/subscriptionFeatures'
import {
  selectSubscriptionFeatureById,
  updateSubscriptionFeature,
  insertSubscriptionFeature,
  selectSubscriptionFeatures, // Assuming a paginated version might be added later or not needed for now
  deactivateSubscriptionFeature as deactivateSubscriptionFeatureMethod,
} from '@/db/tableMethods/subscriptionFeatureMethods'
import {
  generateOpenApiMetas,
  RouteConfig,
  createPostOpenApiMeta,
} from '@/utils/openapi'
import { protectedProcedure } from '@/server/trpc'
import { authenticatedProcedureTransaction } from '@/db/authenticatedTransaction'
import { idInputSchema } from '@/db/tableUtils'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'

const resourceName = 'subscriptionFeature' // Using camelCase for resource name consistent with other routers
const pluralResourceName = 'subscriptionFeatures' // Explicitly define plural for openapi path
const tags = ['SubscriptionFeatures']

const { openApiMetas, routeConfigs: baseRouteConfigsObj } =
  generateOpenApiMetas({
    resource: resourceName,
    tags,
  })

// Ensure baseRouteConfigsObj is treated as a plain object if it has array-like properties
const cleanedBaseRouteConfigs: Record<string, RouteConfig> = {}
for (const key in baseRouteConfigsObj) {
  if (
    Object.prototype.hasOwnProperty.call(baseRouteConfigsObj, key)
  ) {
    cleanedBaseRouteConfigs[key] = (baseRouteConfigsObj as any)[key]
  }
}

export const subscriptionFeaturesRouteConfigs: Record<
  string,
  RouteConfig
> = {
  ...cleanedBaseRouteConfigs,
  [`POST /${resourceName}s/:id/deactivate`]: {
    procedure: 'subscriptionFeatures.deactivate',
    pattern: new RegExp(`^${resourceName}s\/([^\/]+)\/deactivate$`),
    mapParams: (matches) => ({ id: matches[0] }),
  },
}

const subscriptionFeatureClientResponse = z.object({
  subscriptionFeature: subscriptionFeaturesClientSelectSchema,
})

const createSubscriptionFeature = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createSubscriptionFeatureInputSchema)
  .output(subscriptionFeatureClientResponse)
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction, ctx }) => {
        const organizationId = ctx.organizationId
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        // TODO: Potentially validate that the featureId, productFeatureId, and subscriptionId belong to the org

        const subscriptionFeature = await insertSubscriptionFeature(
          {
            ...input.subscriptionFeature,
            // livemode is part of tableBase, so it's handled by enhancedCreateInsertSchema
          },
          transaction
        )
        return { subscriptionFeature }
      }
    )
  )

// Assuming a simple list operation for now. Paginated version can be added if needed.
const listSubscriptionFeaturesProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(
    z
      .object({
        subscriptionId: z.string().optional(),
        productFeatureId: z.string().optional(),
      })
      .optional()
  ) // Example filter
  .output(
    z.object({
      subscriptionFeatures: z.array(
        subscriptionFeaturesClientSelectSchema
      ),
    })
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction, ctx }) => {
        const organizationId = ctx.organizationId
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        // Add organizationId to where clause if necessary, or rely on RLS via subscription
        // This simplistic select might need refinement based on actual query needs (e.g., by subscriptionId)
        const results = await selectSubscriptionFeatures(
          {
            // This needs to be based on how selectSubscriptionFeatures is implemented
            // e.g. if it can take {where: {subscriptionId: input.subscriptionId, organizationId: organizationId}}
            // For now, RLS on subscription will handle org scoping implicitly if data is joined correctly or policies are tight.
            ...(input?.subscriptionId && {
              subscriptionId: input.subscriptionId,
            }),
            ...(input?.productFeatureId && {
              productFeatureId: input.productFeatureId,
            }),
          },
          transaction
        )
        return { subscriptionFeatures: results }
      }
    )
  )

const editSubscriptionFeature = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editSubscriptionFeatureInputSchema)
  .output(subscriptionFeatureClientResponse)
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const updatePayload = {
          ...input.subscriptionFeature,
          id: input.id,
        } as SubscriptionFeature.Update

        const subscriptionFeature = await updateSubscriptionFeature(
          updatePayload,
          transaction
        )
        return { subscriptionFeature }
      }
    )
  )

const getSubscriptionFeature = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(subscriptionFeatureClientResponse)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const subscriptionFeature =
          await selectSubscriptionFeatureById(input.id, transaction)
        if (!subscriptionFeature) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `${resourceName} with id ${input.id} not found.`,
          })
        }
        return { subscriptionFeature }
      }
    )
  )

const deactivateSubscriptionFeature = protectedProcedure
  .meta(
    createPostOpenApiMeta({
      resource: pluralResourceName, // Use plural form for the path base
      summary: 'Deactivate a feature attached to a subscription',
      tags: tags,
      routeSuffix: 'deactivate', // This appends /deactivate
      requireIdParam: true, // This adds /{id}
      // idParamOverride is not needed if the param is 'id'
    })
  )
  .input(deactivateSubscriptionFeatureInputSchema)
  .output(subscriptionFeatureClientResponse)
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const { id, deactivatedAt } = input
        // Ensure the feature exists before attempting to deactivate
        const existingFeature = await selectSubscriptionFeatureById(
          id,
          transaction
        )
        if (!existingFeature) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `SubscriptionFeature with id ${id} not found.`,
          })
        }

        const subscriptionFeature =
          await deactivateSubscriptionFeatureMethod(
            existingFeature,
            deactivatedAt || new Date(), // Default to now if not provided
            transaction
          )
        return { subscriptionFeature }
      }
    )
  )

export const subscriptionFeaturesRouter = router({
  get: getSubscriptionFeature,
  create: createSubscriptionFeature,
  update: editSubscriptionFeature,
  list: listSubscriptionFeaturesProcedure,
  deactivate: deactivateSubscriptionFeature,
})
