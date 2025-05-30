import { protectedProcedure, router } from '../trpc'
import {
  selectProductsPaginated,
  selectProductById,
  getProductTableRows,
} from '@/db/tableMethods/productMethods'
import {
  createProductTransaction,
  editProduct as editProductCatalog,
} from '@/utils/catalog'
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
import { selectPricesProductsAndCatalogsForOrganization } from '@/db/tableMethods/priceMethods'
import * as R from 'ramda'
import { Price } from '@/db/schema/prices'
import { Catalog } from '@/db/schema/catalogs'
import { selectProductsCursorPaginated } from '@/db/tableMethods/productMethods'
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
    const result = await authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        const { product, price } = input
        return createProductTransaction(
          {
            product,
            prices: [
              {
                ...price,
                isDefault: true,
              },
            ],
          },
          { transaction, userId, livemode }
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
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        const { product } = input

        const updatedProduct = await editProductCatalog(
          { product },
          { transaction, userId, livemode }
        )

        if (!updatedProduct) {
          throw new Error('Product not found or update failed')
        }
        if (input.price) {
          await safelyUpdatePrice(input.price, transaction)
        }
        return {
          product: updatedProduct,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

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
        catalogId: z.string().optional(),
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

        // Get products with prices and catalogs
        const productsResult =
          await selectPricesProductsAndCatalogsForOrganization(
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
