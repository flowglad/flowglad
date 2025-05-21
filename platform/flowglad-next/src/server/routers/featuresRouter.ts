import { router } from '../trpc'
import {
  createFeatureSchema,
  editFeatureSchema,
  featuresClientSelectSchema,
} from '@/db/schema/features'
import {
  selectFeatureById,
  updateFeature,
  insertFeature,
  selectFeaturesPaginated,
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
        const feature = await insertFeature(
          {
            ...input.feature,
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

export const editFeature = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editFeatureSchema)
  .output(z.object({ feature: featuresClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const feature = await updateFeature(
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

export const featuresRouter = router({
  get: getFeature,
  create: createFeature,
  update: editFeature,
  list: listFeaturesProcedure,
})
