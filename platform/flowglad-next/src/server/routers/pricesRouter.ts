import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  createPriceSchema,
  editPriceSchema,
  Price,
  pricesClientSelectSchema,
  pricesPaginatedListSchema,
  pricesPaginatedSelectSchema,
  pricesTableRowDataSchema,
} from '@/db/schema/prices'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  insertPrice,
  safelyInsertPrice,
  safelyUpdatePrice,
  selectPriceById,
  selectPricesPaginated,
  selectPricesTableRowData,
} from '@/db/tableMethods/priceMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
  NotFoundError,
} from '@/db/tableUtils'
import { protectedProcedure, router } from '@/server/trpc'
import { PriceType } from '@/types'
import { validateDefaultPriceUpdate } from '@/utils/defaultProductValidation'
import { generateOpenApiMetas } from '@/utils/openapi'
import { createPriceTransaction } from '@/utils/pricingModel'
import { validatePriceImmutableFields } from '@/utils/validateImmutableFields'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'Price',
  tags: ['Prices'],
})

export const pricesRouteConfigs = routeConfigs

export const listPrices = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(pricesPaginatedSelectSchema)
  .output(pricesPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectPricesPaginated(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const singlePriceOutputSchema = z.object({
  price: pricesClientSelectSchema,
})

export const createPrice = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createPriceSchema)
  .output(singlePriceOutputSchema)
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, livemode, organizationId, userId }) => {
        const { price } = input
        const newPrice = await createPriceTransaction(
          { price },
          {
            transaction,
            livemode,
            organizationId,
            userId,
          }
        )
        return {
          price: newPrice,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const updatePrice = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editPriceSchema)
  .output(singlePriceOutputSchema)
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const { price } = input

        // Fetch the existing price and its product to check if it's a default price on a default product
        const existingPrice = await selectPriceById(
          price.id,
          transaction
        )
        if (!existingPrice) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Price not found',
          })
        }

        // Product validation only applies to non-usage prices.
        // Usage prices don't have productId, so skip product-related validation.
        let product = null
        if (Price.hasProductId(existingPrice)) {
          product = await selectProductById(
            existingPrice.productId,
            transaction
          )
          if (!product) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Product not found',
            })
          }

          // Validate that default prices on default products maintain their constraints
          validateDefaultPriceUpdate(price, existingPrice, product)

          // Disallow slug changes for the default price of a default product
          if (
            product.default &&
            existingPrice.isDefault &&
            price.slug !== undefined &&
            price.slug !== existingPrice.slug
          ) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message:
                'Cannot change the slug of the default price for a default product',
            })
          }
        }

        // Validate immutable fields for ALL prices
        validatePriceImmutableFields({
          update: price,
          existing: existingPrice,
        })

        const updatedPrice = await safelyUpdatePrice(
          {
            ...price,
            type: existingPrice.type,
          },
          transaction
        )
        return {
          price: updatedPrice,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const getPrice = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ price: pricesClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    const price = await authenticatedTransaction(
      async ({ transaction }) => {
        try {
          return await selectPriceById(input.id, transaction)
        } catch (error) {
          if (error instanceof NotFoundError) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Price not found',
            })
          }
          throw error
        }
      },
      { apiKey: ctx.apiKey }
    )
    return { price }
  })

/**
 * Filter schema for the prices.getTableRows endpoint.
 *
 * @property productId - Filter prices by the associated product ID
 * @property type - Filter prices by price type (Subscription, Usage, SinglePayment)
 * @property isDefault - Filter prices by whether they are the default price for their product
 * @property usageMeterId - Filter usage prices by their associated usage meter ID. Only applies to prices with type=Usage
 * @property active - Filter prices by their active status. When true, returns only active prices; when false, returns only inactive prices
 */
export const pricesGetTableRowsFiltersSchema = z.object({
  productId: z.string().optional(),
  type: z.enum(PriceType).optional(),
  isDefault: z.boolean().optional(),
  usageMeterId: z.string().optional(),
  active: z.boolean().optional(),
})

export type PricesGetTableRowsFilters = z.infer<
  typeof pricesGetTableRowsFiltersSchema
>

export const getTableRows = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      pricesGetTableRowsFiltersSchema
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(pricesTableRowDataSchema)
  )
  .query(authenticatedProcedureTransaction(selectPricesTableRowData))

export const setPriceAsDefault = protectedProcedure
  .input(idInputSchema)
  .output(z.object({ price: pricesClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const oldPrice = await selectPriceById(input.id, transaction)
        const price = await safelyUpdatePrice(
          { id: input.id, isDefault: true, type: oldPrice.type },
          transaction
        )
        return { price }
      }
    )
  )

export const archivePrice = protectedProcedure
  .input(idInputSchema)
  .output(z.object({ price: pricesClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const oldPrice = await selectPriceById(input.id, transaction)
        const price = await safelyUpdatePrice(
          { id: input.id, active: false, type: oldPrice.type },
          transaction
        )
        return { price }
      }
    )
  )

export const pricesRouter = router({
  list: listPrices,
  create: createPrice,
  update: updatePrice,
  getTableRows,
  setAsDefault: setPriceAsDefault,
  archive: archivePrice,
  get: getPrice,
})
