import { TRPCError } from '@trpc/server'
import { kebabCase } from 'change-case'
import { z } from 'zod'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
} from '@/db/authenticatedTransaction'
import {
  createSubscriptionItemFeatureInputSchema,
  editSubscriptionItemFeatureInputSchema,
  expireSubscriptionItemFeatureInputSchema,
  type SubscriptionItemFeature,
  subscriptionItemFeaturesClientSelectSchema,
} from '@/db/schema/subscriptionItemFeatures'
import {
  expireSubscriptionItemFeature as expireSubscriptionItemFeatureMethod,
  insertSubscriptionItemFeature,
  selectClientSubscriptionItemFeatureAndFeatureById,
  selectSubscriptionItemFeatureById,
  updateSubscriptionItemFeature as updateSubscriptionItemFeatureDB,
} from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { idInputSchema } from '@/db/tableUtils'
import { protectedProcedure } from '@/server/trpc'
import { CacheDependency } from '@/utils/cache'
import {
  createPostOpenApiMeta,
  generateOpenApiMetas,
  type RouteConfig,
} from '@/utils/openapi'
import { router } from '../trpc'

const resourceName = 'subscriptionItemFeature' // Using camelCase for resource name consistent with other routers
const pluralResourceName = 'subscriptionItemFeatures' // Explicitly define plural for openapi path
const tags = ['Subscription Item Features']

const { openApiMetas, routeConfigs: baseRouteConfigs } =
  generateOpenApiMetas({
    resource: resourceName,
    tags,
  })

export const subscriptionItemFeaturesRouteConfigs: Array<
  Record<string, RouteConfig>
> = [
  ...baseRouteConfigs,
  {
    [`POST /${kebabCase(pluralResourceName)}/:id/expire`]: {
      procedure: 'subscriptionItemFeatures.expire',
      pattern: new RegExp(
        `^${kebabCase(pluralResourceName)}/([^/]+)/expire$`
      ),
      mapParams: (matches) => ({ id: matches[0] }),
    },
  },
] as const

const subscriptionItemFeatureClientResponse = z.object({
  subscriptionItemFeature: subscriptionItemFeaturesClientSelectSchema,
})

const createSubscriptionItemFeature = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createSubscriptionItemFeatureInputSchema)
  .output(subscriptionItemFeatureClientResponse)
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const { transaction, invalidateCache } = transactionCtx
        const { organizationId } = ctx
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        // FIXME: Potentially validate that the featureId, productFeatureId, and subscriptionId belong to the org

        const { id: subscriptionItemFeatureId, subscriptionItemId } =
          await insertSubscriptionItemFeature(
            {
              ...input.subscriptionItemFeature,
              livemode: ctx.livemode,
            },
            transaction
          )
        const [subscriptionItemFeature] =
          await selectClientSubscriptionItemFeatureAndFeatureById(
            subscriptionItemFeatureId,
            transaction
          )
        invalidateCache(
          CacheDependency.subscriptionItemFeatures(subscriptionItemId)
        )
        return { result: { subscriptionItemFeature } }
      }
    )
  )

const updateSubscriptionItemFeature = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editSubscriptionItemFeatureInputSchema)
  .output(subscriptionItemFeatureClientResponse)
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction, invalidateCache } = transactionCtx
        // Get existing record to obtain subscriptionItemId for cache invalidation
        const existingFeature =
          await selectSubscriptionItemFeatureById(
            input.id,
            transaction
          )
        if (!existingFeature) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `SubscriptionItemFeature with id ${input.id} not found.`,
          })
        }

        const updatePayload = {
          ...input.subscriptionItemFeature,
          id: input.id,
        } as SubscriptionItemFeature.Update

        await updateSubscriptionItemFeatureDB(
          updatePayload,
          transaction
        )
        const [subscriptionItemFeature] =
          await selectClientSubscriptionItemFeatureAndFeatureById(
            input.id,
            transaction
          )
        invalidateCache(
          CacheDependency.subscriptionItemFeatures(
            existingFeature.subscriptionItemId
          )
        )
        return { result: { subscriptionItemFeature } }
      }
    )
  )

const getSubscriptionItemFeature = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(subscriptionItemFeatureClientResponse)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
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
      summary: 'Expire Subscription Item Feature',
      description:
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
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction, invalidateCache } = transactionCtx
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
        invalidateCache(
          CacheDependency.subscriptionItemFeatures(
            existingFeature.subscriptionItemId
          )
        )
        return { result: { subscriptionItemFeature } }
      }
    )
  )

export const subscriptionItemFeaturesRouter = router({
  get: getSubscriptionItemFeature,
  create: createSubscriptionItemFeature,
  update: updateSubscriptionItemFeature,
  deactivate: expireSubscriptionItemFeature,
})
