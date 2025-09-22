import { router, protectedProcedure } from '@/server/trpc'
import { z } from 'zod'
import {
  createProductFeatureInputSchema,
  productFeatureClientSelectSchema,
  productFeaturesPaginatedSelectSchema,
  productFeaturesPaginatedListSchema,
} from '@/db/schema/productFeatures'
import {
  selectProductFeatureById,
  selectProductFeaturesPaginated,
  expireProductFeaturesByFeatureId,
  createOrRestoreProductFeature as createOrRestoreProductFeatureMethod,
} from '@/db/tableMethods/productFeatureMethods'
import { authenticatedProcedureTransaction } from '@/db/authenticatedTransaction'
import {
  createPostOpenApiMeta,
  generateOpenApiMetas,
  RouteConfig,
} from '@/utils/openapi'
import { idInputSchema } from '@/db/tableUtils'
import { selectProductById } from '@/db/tableMethods/productMethods'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'productFeature', // singular, camelCase
  tags: ['ProductFeatures'], // plural, PascalCase
})

export const productFeaturesRouteConfigs = routeConfigs

export const createOrRestoreProductFeature = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createProductFeatureInputSchema)
  .output(
    z.object({ productFeature: productFeatureClientSelectSchema })
  )
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction, userId }) => {
        // Determine livemode from the associated product
        // The RLS on productFeatures ensures user has access to the product
        // and its organization, and that livemode matches current context.
        // Here, we need to set the livemode and organizationId fields on the productFeature record itself.
        const product = await selectProductById(
          input.productFeature.productId,
          transaction
        )
        if (!product) {
          throw new Error(
            'Associated product not found or access denied.'
          ) // TRPCError can be used here
        }

        const productFeature =
          await createOrRestoreProductFeatureMethod(
            {
              ...input.productFeature,
              livemode: product.livemode,
              organizationId: product.organizationId,
            },
            transaction
          )
        return { productFeature }
      }
    )
  )

const listProductFeatures = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(productFeaturesPaginatedSelectSchema) // Input schema from productFeatures.ts
  .output(productFeaturesPaginatedListSchema) // Output schema from productFeatures.ts
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        // selectProductFeaturesPaginated expects { cursor?, limit? } and transaction
        // The input (productFeaturesPaginatedSelectSchema) should match this structure.
        return selectProductFeaturesPaginated(input, transaction)
      }
    )
  )

export const getProductFeature = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema) // General input schema for fetching by ID
  .output(
    z.object({ productFeature: productFeatureClientSelectSchema })
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const productFeature = await selectProductFeatureById(
          input.id,
          transaction
        )
        if (!productFeature) {
          // Consider throwing a TRPCError NOT_FOUND
          throw new Error('ProductFeature not found')
        }
        return { productFeature }
      }
    )
  )

export const expireProductFeature = protectedProcedure
  .meta(
    createPostOpenApiMeta({
      resource: 'productFeature',
      routeSuffix: 'expire',
      requireIdParam: true,
      summary:
        'Expire a product feature, making it no longer available for subscription items',
      tags: ['ProductFeatures'],
    })
  )
  .input(idInputSchema) // Input is the ID of the ProductFeature record
  .output(z.object({ success: z.boolean() })) // Indicate success
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        await expireProductFeaturesByFeatureId(
          [input.id],
          transaction
        )
        return { success: true }
      }
    )
  )

export const productFeaturesRouter = router({
  create: createOrRestoreProductFeature,
  list: listProductFeatures,
  get: getProductFeature,
  expire: expireProductFeature,
  // No update or delete procedures exposed to client
})
