import { Result } from 'better-result'
import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  createFeatureSchema,
  editFeatureSchema,
  featuresClientSelectSchema,
} from '@/db/schema/features'
import {
  featuresTableRowOutputSchema,
  insertFeature,
  selectFeatureById,
  selectFeatures,
  selectFeaturesPaginated,
  selectFeaturesTableRowData,
  updateFeatureTransaction,
} from '@/db/tableMethods/featureMethods'
import {
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@/db/tableUtils'
import { protectedProcedure } from '@/server/trpc'
import { generateOpenApiMetas } from '@/utils/openapi'
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
  .mutation(async ({ input, ctx }) => {
    const { livemode, organizationId } = ctx
    if (!organizationId) {
      throw new Error('organizationId is required')
    }
    const result = await authenticatedTransaction(
      async (params) => {
        const feature = await insertFeature(
          {
            ...input.feature,
            organizationId,
            livemode,
          },
          params
        )
        return Result.ok({ feature })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const listFeaturesProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(featuresPaginatedSelectSchema)
  .output(featuresPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectFeaturesPaginated(input, transaction)
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const updateFeature = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editFeatureSchema)
  .output(z.object({ feature: featuresClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async (params) => {
        const feature = await updateFeatureTransaction(
          {
            ...input.feature,
            id: input.id,
          },
          params
        )
        return Result.ok({ feature })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const getFeature = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ feature: featuresClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const feature = (
          await selectFeatureById(input.id, transaction)
        ).unwrap()
        return Result.ok({ feature })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

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
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectFeaturesTableRowData({
          input,
          transaction,
        })
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

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
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const features = await selectFeatures(
          {
            pricingModelId: input.pricingModelId,
          },
          transaction
        )
        return Result.ok({ features })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const featuresRouter = router({
  get: getFeature,
  create: createFeature,
  update: updateFeature,
  list: listFeaturesProcedure,
  getTableRows,
  getFeaturesForPricingModel,
})
