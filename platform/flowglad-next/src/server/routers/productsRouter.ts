import { protectedProcedure, router } from '../trpc'
import {
  selectProductsPaginated,
  selectProductById,
  selectProductsCursorPaginated,
} from '@/db/tableMethods/productMethods'
import { syncProductFeatures } from '@/db/tableMethods/productFeatureMethods'
import {
  validateProductCreation,
  validateDefaultProductUpdate,
} from '@/utils/defaultProductValidation'
import {
  createProductTransaction,
  editProduct as editProductPricingModel,
} from '@/utils/pricingModel'
import {
  createProductSchema,
  editProductSchema,
  productsTableRowDataSchema,
  productWithPricesSchema,
} from '@/db/schema/prices'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'
import { z } from 'zod'
import {
  productsClientSelectSchema,
  productsPaginatedListSchema,
  productsPaginatedSelectSchema,
} from '@/db/schema/products'
import {
  safelyUpdatePrice,
  selectPrices,
} from '@/db/tableMethods/priceMethods'
import { selectPricesProductsAndPricingModelsForOrganization } from '@/db/tableMethods/priceMethods'
import * as R from 'ramda'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
} from '@/db/tableUtils'

const { openApiMetas } = generateOpenApiMetas({
  resource: 'Product',
  tags: ['Products'],
})

export const productsRouteConfigs = {
  ...trpcToRest('products.list'),
  ...trpcToRest('products.create'),
  ...trpcToRest('products.update'),
}

const singleProductOutputSchema = z.object({
  product: productsClientSelectSchema,
})

export const createProduct = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createProductSchema)
  .output(singleProductOutputSchema)
  .mutation(async ({ input, ctx }) => {
    // Validate that default products cannot be created manually
    validateProductCreation(input.product)
    
    const result = await authenticatedTransaction(
      async ({ transaction, userId, livemode, organizationId }) => {
        const { product, price, featureIds } = input
        return createProductTransaction(
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
          { transaction, userId, livemode, organizationId }
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return {
      product: result.product,
    }
  })

export const editProduct = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editProductSchema)
  .output(singleProductOutputSchema)
  .mutation(
    authenticatedProcedureTransaction(
      async ({ transaction, input }) => {
        const { product, featureIds } = input

        // Fetch the existing product to check if it's a default product
        const existingProduct = await selectProductById(product.id, transaction)
        if (!existingProduct) {
          throw new Error('Product not found')
        }

        // Validate that default products can only have certain fields updated
        validateDefaultProductUpdate(product, existingProduct)

        const updatedProduct = await editProductPricingModel(
          { product, featureIds },
          transaction
        )

        if (!updatedProduct) {
          throw new Error('Product update failed')
        }

        if (input.price) {
          await safelyUpdatePrice(input.price, transaction)
        }
        return {
          product: updatedProduct,
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
    return authenticatedTransaction(
      async ({ transaction }) => {
        const product = await selectProductById(input.id, transaction)
        if (!product) {
          throw new Error('Product not found')
        }
        const prices = await selectPrices(
          {
            productId: product.id,
          },
          transaction
        )
        return {
          ...product,
          prices,
          defaultPrice:
            prices.find((price) => price.isDefault) ?? prices[0],
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const getTableRows = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        active: z.boolean().optional(),
        pricingModelId: z.string().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(productsTableRowDataSchema)
  )
  .query(
    authenticatedProcedureTransaction(selectProductsCursorPaginated)
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
  edit: editProduct,
  getTableRows,
  getCountsByStatus,
})
