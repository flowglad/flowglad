import { router, protectedProcedure } from '@/server/trpc'
import { z } from 'zod'
import {
  createProductFeatureInputSchema,
  productFeatureClientSelectSchema,
  productFeaturesPaginatedSelectSchema, // Input schema for list
  productFeaturesPaginatedListSchema, // Output schema for list
} from '@/db/schema/productFeatures'
import {
  insertProductFeature,
  selectProductFeatureById,
  selectProductFeaturesPaginated, // Use the paginated selector
  deleteProductFeatureById, // Import delete method
} from '@/db/tableMethods/productFeatureMethods'
import { authenticatedProcedureTransaction } from '@/db/authenticatedTransaction'
import { generateOpenApiMetas, RouteConfig } from '@/utils/openapi'
import { idInputSchema } from '@/db/tableUtils'
import { selectProductById } from '@/db/tableMethods/productMethods' // To get product's livemode

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'productFeature', // singular, camelCase
  tags: ['ProductFeatures'], // plural, PascalCase
})

// Let TypeScript infer the type of routeConfigs, similar to other routers
export const productFeaturesRouteConfigs = routeConfigs

export const createProductFeature = protectedProcedure
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
        // Here, we need to set the livemode field on the productFeature record itself.
        const product = await selectProductById(
          input.productFeature.productId,
          transaction
        )
        if (!product) {
          throw new Error(
            'Associated product not found or access denied.'
          ) // TRPCError can be used here
        }

        const productFeature = await insertProductFeature(
          {
            ...input.productFeature,
            livemode: product.livemode, // Set livemode from the product
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

export const deleteProductFeature = protectedProcedure
  .meta(openApiMetas.DELETE)
  .input(idInputSchema) // Input is the ID of the ProductFeature record
  .output(z.object({ success: z.boolean() })) // Indicate success
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        // Before deleting, ensure the record exists and user has access (RLS handles this implicitly on select)
        // Optional: explicitly select first to return a more specific error or the deleted object if needed.
        // const existing = await selectProductFeatureById(input.id, transaction);
        // if (!existing) {
        //   throw new TRPCError({ code: 'NOT_FOUND', message: 'ProductFeature not found.' });
        // }
        await deleteProductFeatureById(input.id, transaction)
        return { success: true }
      }
    )
  )

export const productFeaturesRouter = router({
  create: createProductFeature,
  list: listProductFeatures,
  get: getProductFeature,
  delete: deleteProductFeature, // Add delete procedure
  // No update or delete procedures exposed to client
})
