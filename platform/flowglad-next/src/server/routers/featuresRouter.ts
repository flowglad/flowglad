import { TRPCError } from '@trpc/server'
import { router } from '../trpc'
import {
  createFeatureSchema,
  editFeatureSchema,
  featuresClientSelectSchema,
} from '@/db/schema/features'
import {
  selectFeatureById,
  updateFeatureTransaction,
  insertFeature,
  selectFeaturesPaginated,
  selectFeaturesTableRowData,
  featuresTableRowOutputSchema,
  selectFeatures,
} from '@/db/tableMethods/featureMethods'
import { generateOpenApiMetas } from '@/utils/openapi'
import { protectedProcedure } from '@/server/trpc'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  idInputSchema,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
  createPaginatedTableRowOutputSchema,
  createPaginatedTableRowInputSchema,
} from '@/db/tableUtils'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { z } from 'zod'

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
      async ({ input, transaction, userId, livemode }) => {
        const [{ organization }] =
          await selectMembershipAndOrganizations(
            {
              userId,
              focused: true,
            },
            transaction
          )

        // Resolve usage meter slug to ID if provided
        let featureInput = input.feature
        if (
          featureInput.type === 'usage_credit_grant' &&
          'usageMeterSlug' in featureInput &&
          featureInput.usageMeterSlug
        ) {
          const { selectUsageMeterBySlugAndPricingModelId } =
            await import('@/db/tableMethods/usageMeterMethods')
          const usageMeter =
            await selectUsageMeterBySlugAndPricingModelId(
              {
                slug: featureInput.usageMeterSlug,
                pricingModelId: featureInput.pricingModelId,
              },
              transaction
            )
          if (!usageMeter) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Usage meter with slug "${featureInput.usageMeterSlug}" not found for this pricing model`,
            })
          }
          // Replace usageMeterSlug with resolved usageMeterId
          featureInput = {
            ...featureInput,
            usageMeterId: usageMeter.id,
            usageMeterSlug: undefined,
          }
        }

        const feature = await insertFeature(
          {
            ...featureInput,
            organizationId: organization.id,
            livemode,
          },
          transaction
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
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectFeaturesPaginated(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const updateFeature = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editFeatureSchema)
  .output(z.object({ feature: featuresClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const feature = await updateFeatureTransaction(
          {
            ...input.feature,
            id: input.id,
          },
          transaction
        )
        return { feature }
      }
    )
  )

export const getFeature = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ feature: featuresClientSelectSchema }))
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const feature = await selectFeatureById(input.id, transaction)
        return { feature }
      }
    )
  )

export const getTableRows = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        pricingModelId: z.string().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(featuresTableRowOutputSchema)
  )
  .query(
    authenticatedProcedureTransaction(selectFeaturesTableRowData)
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
      async ({ input, transaction }) => {
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
