import { router } from '../trpc'
import {
  createSubscriptionItemFeatureInputSchema,
  editSubscriptionItemFeatureInputSchema,
  subscriptionItemFeaturesClientSelectSchema,
  expireSubscriptionItemFeatureInputSchema,
  SubscriptionItemFeature,
} from '@/db/schema/subscriptionItemFeatures'
import {
  selectSubscriptionItemFeatureById,
  updateSubscriptionItemFeature,
  insertSubscriptionItemFeature,
  expireSubscriptionItemFeature as expireSubscriptionItemFeatureMethod,
  selectClientSubscriptionItemFeatureAndFeatureById,
} from '@/db/tableMethods/subscriptionItemFeatureMethods'
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
import { kebabCase } from 'change-case'

const resourceName = 'subscriptionItemFeature' // Using camelCase for resource name consistent with other routers
const pluralResourceName = 'subscriptionItemFeatures' // Explicitly define plural for openapi path
const tags = ['SubscriptionItemFeatures']

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

export const subscriptionItemFeaturesRouteConfigs: Record<
  string,
  RouteConfig
> = {
  ...cleanedBaseRouteConfigs,
  [`POST /${kebabCase(pluralResourceName)}/:id/expire`]: {
    procedure: 'subscriptionItemFeatures.expire',
    pattern: new RegExp(
      `^${kebabCase(pluralResourceName)}\/([^\/]+)\/expire$`
    ),
    mapParams: (matches) => ({ id: matches[0] }),
  },
}

const subscriptionItemFeatureClientResponse = z.object({
  subscriptionItemFeature: subscriptionItemFeaturesClientSelectSchema,
})

const createSubscriptionItemFeature = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createSubscriptionItemFeatureInputSchema)
  .output(subscriptionItemFeatureClientResponse)
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

        const { id: subscriptionItemFeatureId } =
          await insertSubscriptionItemFeature(
            {
              ...input.subscriptionItemFeature,
              // livemode is part of tableBase, so it's handled by enhancedCreateInsertSchema
            },
            transaction
          )
        const [subscriptionItemFeature] =
          await selectClientSubscriptionItemFeatureAndFeatureById(
            subscriptionItemFeatureId,
            transaction
          )
        return { subscriptionItemFeature }
      }
    )
  )

const updateSubscriptionItemFeature = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editSubscriptionItemFeatureInputSchema)
  .output(subscriptionItemFeatureClientResponse)
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const updatePayload = {
          ...input.subscriptionItemFeature,
          id: input.id,
        } as SubscriptionItemFeature.Update

        await updateSubscriptionItemFeature(
          updatePayload,
          transaction
        )
        const [subscriptionItemFeature] =
          await selectClientSubscriptionItemFeatureAndFeatureById(
            input.id,
            transaction
          )
        return { subscriptionItemFeature }
      }
    )
  )

const getSubscriptionItemFeature = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(subscriptionItemFeatureClientResponse)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const [subscriptionItemFeature] =
          await selectClientSubscriptionItemFeatureAndFeatureById(
            input.id,
            transaction
          )
        if (!subscriptionItemFeature) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `${resourceName} with id ${input.id} not found.`,
          })
        }
        return { subscriptionItemFeature }
      }
    )
  )

const expireSubscriptionItemFeature = protectedProcedure
  .meta(
    createPostOpenApiMeta({
      resource: pluralResourceName, // Use plural form for the path base
      summary:
        'Expire a feature attached to a subscription item, no longer granting the customer access to it',
      tags: tags,
      routeSuffix: 'expire', // This appends /deactivate
      requireIdParam: true, // This adds /{id}
      // idParamOverride is not needed if the param is 'id'
    })
  )
  .input(expireSubscriptionItemFeatureInputSchema)
  .output(subscriptionItemFeatureClientResponse)
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const { id, expiredAt } = input
        // Ensure the feature exists before attempting to deactivate
        const existingFeature =
          await selectSubscriptionItemFeatureById(id, transaction)
        if (!existingFeature) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `SubscriptionItemFeature with id ${id} not found.`,
          })
        }

        const { id: subscriptionItemFeatureId } =
          await expireSubscriptionItemFeatureMethod(
            existingFeature,
            expiredAt || new Date(), // Default to now if not provided
            transaction
          )
        const [subscriptionItemFeature] =
          await selectClientSubscriptionItemFeatureAndFeatureById(
            subscriptionItemFeatureId,
            transaction
          )
        return { subscriptionItemFeature }
      }
    )
  )

export const subscriptionItemFeaturesRouter = router({
  get: getSubscriptionItemFeature,
  create: createSubscriptionItemFeature,
  update: updateSubscriptionItemFeature,
  deactivate: expireSubscriptionItemFeature,
})
