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
  trpcToRest,
  RouteConfig,
  createPostOpenApiMeta,
} from '@/utils/openapi'
import { protectedProcedure } from '@/server/trpc'
import { authenticatedProcedureTransaction } from '@/db/authenticatedTransaction'
import {
  idInputSchema,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
} from '@/db/tableUtils'
import { z } from 'zod'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
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

const createSubscriptionFeature = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createSubscriptionFeatureInputSchema)
  .output(
    z.object({
      [resourceName]: subscriptionFeaturesClientSelectSchema,
    })
  )
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction, userId, livemode, ctx }) => {
        const organizationId = ctx.organizationId
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        // TODO: Potentially validate that the featureId, productFeatureId, and subscriptionId belong to the org

        const result = await insertSubscriptionFeature(
          {
            ...input.subscriptionFeature,
            // livemode is part of tableBase, so it's handled by enhancedCreateInsertSchema
          },
          transaction
        )
        return { [resourceName]: result }
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
      [resourceName + 's']: z.array(
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
        return { [resourceName + 's']: results }
      }
    )
  )

const editSubscriptionFeature = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editSubscriptionFeatureInputSchema)
  .output(
    z.object({
      [resourceName]: subscriptionFeaturesClientSelectSchema,
    })
  )
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        // Addressing the type issue for the update operation.
        // The input.subscriptionFeature is a ClientUpdate, which is a discriminated union.
        // updateSubscriptionFeature expects the internal update schema, also a discriminated union.
        // Direct spreading should work if the types align. The error suggests they might not.
        // This could be due to optional fields in ClientUpdate that are required in Update,
        // or vice-versa, specifically around the discriminator 'type'.

        // Forcing the type to be present as it should be for an update of a discriminated union.
        // This assumes that if 'type' is part of the update, it will be provided.
        // If the schema definition of SubscriptionFeature.ClientUpdate allows for 'type' to be omitted
        // during an update, this part of the logic or the schema itself needs reconsideration.
        const updatePayload: SubscriptionFeature.Update = {
          id: input.id,
          ...input.subscriptionFeature,
        } as SubscriptionFeature.Update // Cast to ensure alignment, may hide deeper schema issues

        const result = await updateSubscriptionFeature(
          updatePayload,
          transaction
        )
        return { [resourceName]: result }
      }
    )
  )

const getSubscriptionFeature = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(
    z.object({
      [resourceName]: subscriptionFeaturesClientSelectSchema,
    })
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const result = await selectSubscriptionFeatureById(
          input.id,
          transaction
        )
        if (!result) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `${resourceName} with id ${input.id} not found.`,
          })
        }
        return { [resourceName]: result }
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
  .output(
    z.object({
      [resourceName]: subscriptionFeaturesClientSelectSchema,
    })
  )
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

        const result = await deactivateSubscriptionFeatureMethod(
          id,
          deactivatedAt || new Date(), // Default to now if not provided
          transaction
        )
        return { [resourceName]: result }
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
