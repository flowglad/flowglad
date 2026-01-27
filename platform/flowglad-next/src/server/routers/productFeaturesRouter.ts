import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { z } from 'zod'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
} from '@/db/authenticatedTransaction'
import {
  createProductFeatureInputSchema,
  productFeatureClientSelectSchema,
  productFeaturesPaginatedListSchema,
  productFeaturesPaginatedSelectSchema,
} from '@/db/schema/productFeatures'
import { selectFeatureById } from '@/db/tableMethods/featureMethods'
import { selectPrices } from '@/db/tableMethods/priceMethods'
import {
  createOrRestoreProductFeature as createOrRestoreProductFeatureMethod,
  expireProductFeaturesByFeatureId,
  selectProductFeatureById,
  selectProductFeaturesPaginated,
} from '@/db/tableMethods/productFeatureMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import { idInputSchema } from '@/db/tableUtils'
import { protectedProcedure, router } from '@/server/trpc'
import { FeatureType, PriceType } from '@/types'
import {
  createPostOpenApiMeta,
  generateOpenApiMetas,
  RouteConfig,
  trpcToRest,
} from '@/utils/openapi'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'productFeature', // singular, camelCase
  tags: ['Product Features'], // plural, space-separated
})

export const productFeaturesRouteConfigs: Array<
  Record<string, RouteConfig>
> = [...routeConfigs, trpcToRest('productFeatures.expire')]

export const createOrRestoreProductFeature = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createProductFeatureInputSchema)
  .output(
    z.object({ productFeature: productFeatureClientSelectSchema })
  )
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        // Determine livemode from the associated product
        // The RLS on productFeatures ensures user has access to the product
        // and its organization, and that livemode matches current context.
        // Here, we need to set the livemode and organizationId fields on the productFeature record itself.
        const productResult = await selectProductById(
          input.productFeature.productId,
          transaction
        )

        if (Result.isError(productResult)) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Product with id ${input.productFeature.productId} not found`,
          })
        }

        const product = productResult.value

        // Validate that toggle features cannot be associated with single payment products
        const feature = (
          await selectFeatureById(
            input.productFeature.featureId,
            transaction
          )
        ).unwrap()

        if (feature.type === FeatureType.Toggle) {
          const defaultPrice = await selectPrices(
            {
              productId: input.productFeature.productId,
              isDefault: true,
              active: true,
            },
            transaction
          )
          if (
            defaultPrice.length > 0 &&
            defaultPrice[0].type === PriceType.SinglePayment
          ) {
            throw new Error(
              'Cannot associate toggle features with single payment products. Toggle features require subscription-based pricing.'
            )
          }
        }

        const productFeature =
          await createOrRestoreProductFeatureMethod(
            {
              ...input.productFeature,
              livemode: product.livemode,
              organizationId: product.organizationId,
            },
            transactionCtx
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
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
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
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        const productFeature = (
          await selectProductFeatureById(input.id, transaction)
        ).unwrap()
        return { productFeature }
      }
    )
  )

export const expireProductFeature = protectedProcedure
  .meta(
    createPostOpenApiMeta({
      // Use the canonical plural REST resource for consistency with `productFeatures.*` routes.
      resource: 'productFeatures',
      routeSuffix: 'expire',
      requireIdParam: true,
      summary: 'Expire Product Feature',
      description:
        'Expire a product feature, making it no longer available for subscription items',
      tags: ['Product Features'],
    })
  )
  .input(idInputSchema) // Input is the ID of the ProductFeature record
  .output(z.object({ success: z.boolean() })) // Indicate success
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, transactionCtx }) => {
        await expireProductFeaturesByFeatureId(
          [input.id],
          transactionCtx
        )
        return Result.ok({ success: true })
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
