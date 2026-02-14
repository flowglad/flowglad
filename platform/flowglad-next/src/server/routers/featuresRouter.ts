import {
  createFeatureSchema,
  editFeatureSchema,
  featuresClientSelectSchema,
} from '@db-core/schema/features'

import {
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@db-core/tableUtils'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { z } from 'zod'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  featuresTableRowOutputSchema,
  insertFeature,
  selectFeatureById,
  selectFeatures,
  selectFeaturesPaginated,
  selectFeaturesTableRowData,
  updateFeatureTransaction,
} from '@/db/tableMethods/featureMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { protectedProcedure } from '@/server/trpc'
import { generateOpenApiMetas } from '@/utils/openapi'
import { unwrapOrThrow } from '@/utils/resultHelpers'
import { router } from '../trpc'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'feature',
  tags: ['Features'],
})

export const featuresRouteConfigs = routeConfigs

const featuresPaginatedSelectSchema = createPaginatedSelectSchema(
  featuresClientSelectSchema
)
const featuresPaginatedListSchema = createPaginatedListQuerySchema(
  featuresClientSelectSchema
)

export const createFeature = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createFeatureSchema)
  .output(z.object({ feature: featuresClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const { livemode, organizationId } = ctx
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        const pricingModelId = ctx.isApi
          ? ctx.apiKeyPricingModelId
          : ctx.focusedPricingModelId
        if (!pricingModelId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: ctx.isApi
              ? 'Unable to determine pricing model scope. Ensure your API key is associated with a pricing model.'
              : 'Unable to determine pricing model scope. Please select a pricing model.',
          })
        }
        const feature = await insertFeature(
          {
            ...input.feature,
            pricingModelId,
            organizationId,
            livemode,
          },
          transactionCtx
        )
        return { feature }
      }
    )
  )

const listFeaturesProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(featuresPaginatedSelectSchema)
  .output(featuresPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await selectFeaturesPaginated(input, transaction)
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
  })

export const updateFeature = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editFeatureSchema)
  .output(z.object({ feature: featuresClientSelectSchema }))
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, transactionCtx }) => {
        const feature = await updateFeatureTransaction(
          {
            ...input.feature,
            id: input.id,
          },
          transactionCtx
        )
        return Result.ok({ feature })
      }
    )
  )

export const getFeature = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ feature: featuresClientSelectSchema }))
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        const feature = (
          await selectFeatureById(input.id, transaction)
        ).unwrap()
        return { feature }
      }
    )
  )

export const getTableRows = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        pricingModelId: z.string().optional(),
        active: z.boolean().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(featuresTableRowOutputSchema)
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return await selectFeaturesTableRowData({
          input,
          transaction,
        })
      }
    )
  )

const getFeaturesForPricingModel = protectedProcedure
  .input(
    z.object({
      pricingModelId: z.string(),
    })
  )
  .output(
    z.object({
      features: z.array(featuresClientSelectSchema),
    })
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        const features = await selectFeatures(
          {
            pricingModelId: input.pricingModelId,
          },
          transaction
        )
        return { features }
      }
    )
  )

export const featuresRouter = router({
  get: getFeature,
  create: createFeature,
  update: updateFeature,
  list: listFeaturesProcedure,
  getTableRows,
  getFeaturesForPricingModel,
})
