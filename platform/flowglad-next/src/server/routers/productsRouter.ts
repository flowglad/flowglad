import { protectedProcedure, router } from '../trpc'
import {
  insertProduct,
  updateProduct,
  selectProductsPaginated,
  selectProductById,
} from '@/db/tableMethods/productMethods'
import {
  createProductTransaction,
  editProduct as editProductCatalog,
  editPriceTransaction,
} from '@/utils/catalog'
import {
  createProductSchema,
  editProductSchema,
  productWithPricesSchema,
} from '@/db/schema/prices'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'
import { z } from 'zod'
import {
  productsClientSelectSchema,
  productsPaginatedListSchema,
  productsPaginatedSelectSchema,
} from '@/db/schema/products'
import { selectPrices } from '@/db/tableMethods/priceMethods'

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
            prices: [price],
          },
          { transaction, userId, livemode }
        )
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
  .mutation(async ({ input }) => {
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
        await editPriceTransaction(
          { price: input.price },
          transaction
        )
        return {
          product: updatedProduct,
        }
      }
    )
  })

export const listProducts = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(productsPaginatedSelectSchema)
  .output(productsPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      return selectProductsPaginated(input, transaction)
    })
  })

export const getProduct = protectedProcedure
  .meta(openApiMetas.GET)
  .input(z.object({ id: z.string() }))
  .output(productWithPricesSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(async ({ transaction }) => {
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
    })
  })

export const productsRouter = router({
  list: listProducts,
  get: getProduct,
  create: createProduct,
  edit: editProduct,
})
