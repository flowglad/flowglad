import {
  createProductSchema,
  editProductSchema,
  productsTableRowDataSchema,
  productWithPricesSchema,
} from '@db-core/schema/prices'
import {
  productsClientSelectSchema,
  productsPaginatedListSchema,
  productsPaginatedSelectSchema,
} from '@db-core/schema/products'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
} from '@db-core/tableUtils'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import * as R from 'ramda'
import { z } from 'zod'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
  authenticatedTransaction,
  comprehensiveAuthenticatedTransaction,
} from '@/db/authenticatedTransaction'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectPricesProductsAndPricingModelsForOrganization } from '@/db/tableMethods/priceMethods'
import {
  selectProductPriceAndFeaturesByProductId,
  selectProductsCursorPaginated,
  selectProductsPaginated,
} from '@/db/tableMethods/productMethods'
import { validateProductCreation } from '@/utils/defaultProductValidation'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'
import {
  createProductTransaction,
  editProductTransaction as editProductPricingModel,
} from '@/utils/pricingModel'
import { protectedProcedure, router } from '../trpc'
import { errorHandlers } from '../trpcErrorHandler'

const { openApiMetas } = generateOpenApiMetas({
  resource: 'Product',
  tags: ['Products'],
})

export const productsRouteConfigs = {
  ...trpcToRest('products.list'),
  ...trpcToRest('products.create'),
  ...trpcToRest('products.update'),
  ...trpcToRest('products.get'),
}

const singleProductOutputSchema = z.object({
  product: productsClientSelectSchema,
})

export const createProduct = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createProductSchema)
  .output(singleProductOutputSchema)
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const { livemode, organizationId } = ctx
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        try {
          // Validate that default products cannot be created manually
          const validationResult = validateProductCreation(
            input.product
          )
          if (validationResult.status === 'error') {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: validationResult.error.reason,
            })
          }

          const { product, price, featureIds } = input
          const txResult = await createProductTransaction(
            {
              product,
              prices: [
                {
                  ...price,
                  isDefault: true,
                },
              ],
              featureIds,
            },
            { ...transactionCtx, livemode, organizationId }
          )
          return Result.ok({
            product: txResult.product,
          })
        } catch (error) {
          errorHandlers.product.handle(error, {
            operation: 'create',
            details: {
              productName: input.product.name,
              hasPrice: !!input.price,
              hasFeatures: !!input.featureIds,
            },
          })
          throw error
        }
      }
    )
  )

export const updateProduct = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editProductSchema)
  .output(singleProductOutputSchema)
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const { livemode, organizationId } = ctx
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Organization ID is required for this operation.',
          })
        }
        try {
          const updatedProduct = await editProductPricingModel(
            {
              product: input.product,
              featureIds: input.featureIds,
              price: input.price,
            },
            { ...transactionCtx, livemode, organizationId }
          )

          return Result.ok({
            product: updatedProduct,
          })
        } catch (error) {
          // Re-throw with enhanced error handling
          errorHandlers.product.handle(error, {
            operation: 'update',
            id: input.product.id,
            details: {
              productData: input.product,
              hasPrice: !!input.price,
              hasFeatures: !!input.featureIds,
            },
          })
          throw error
        }
      }
    )
  )

export const listProducts = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(productsPaginatedSelectSchema)
  .output(productsPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectProductsPaginated(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const getProduct = protectedProcedure
  .meta(openApiMetas.GET)
  .input(z.object({ id: z.string() }))
  .output(productWithPricesSchema)
  .query(async ({ input, ctx }) => {
    try {
      return await authenticatedTransaction(
        async ({ transaction }) => {
          const result =
            await selectProductPriceAndFeaturesByProductId(
              input.id,
              transaction
            )

          if (!result) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Product not found with id ${input.id}`,
            })
          }

          const { product, prices, features } = result

          if (!prices || prices.length === 0) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `No prices found for product with id ${input.id}`,
            })
          }

          return {
            ...product,
            prices,
            features,
            defaultPrice:
              prices.find((price) => price.isDefault) ?? prices[0],
          }
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    } catch (error) {
      errorHandlers.product.handle(error, {
        operation: 'get',
        id: input.id,
      })
      throw error
    }
  })

export const getTableRows = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        active: z.boolean().optional(),
        pricingModelId: z.string().optional(),
        excludeProductsWithNoPrices: z.boolean().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(productsTableRowDataSchema)
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectProductsCursorPaginated({ input, transaction })
      }
    )
  )

const getCountsByStatusSchema = z.object({})

export const getCountsByStatus = protectedProcedure
  .input(getCountsByStatusSchema)
  .output(
    z.array(
      z.object({
        status: z.string(),
        count: z.number(),
      })
    )
  )
  .query(async ({ ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, userId }) => {
        // Get the user's organization
        const [membership] = await selectMembershipAndOrganizations(
          {
            userId,
            focused: true,
          },
          transaction
        )

        // Get products with prices and pricing models
        const productsResult =
          await selectPricesProductsAndPricingModelsForOrganization(
            {},
            membership.organization.id,
            transaction
          )

        // Get unique products
        const uniqueProducts = R.uniqBy(
          (p) => p.id,
          productsResult.map((p) => p.product)
        )

        // Count active and inactive products
        const activeCount = uniqueProducts.filter(
          (p) => p.active
        ).length
        const inactiveCount = uniqueProducts.filter(
          (p) => !p.active
        ).length

        return [
          { status: 'active', count: activeCount },
          { status: 'inactive', count: inactiveCount },
        ]
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const productsRouter = router({
  list: listProducts,
  get: getProduct,
  create: createProduct,
  update: updateProduct,
  getTableRows,
  getCountsByStatus,
})
