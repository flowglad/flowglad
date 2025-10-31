import { router } from '@/server/trpc'
import { protectedProcedure } from '@/server/trpc'
import {
  authenticatedTransaction,
  authenticatedProcedureTransaction,
} from '@/db/authenticatedTransaction'
import { validateDefaultPriceUpdate } from '@/utils/defaultProductValidation'
import { validatePriceImmutableFields } from '@/utils/validateImmutableFields'
import {
  editPriceSchema,
  pricesClientSelectSchema,
  pricesPaginatedListSchema,
  pricesPaginatedSelectSchema,
  usagePriceClientSelectSchema,
} from '@/db/schema/prices'
import { createPriceSchema } from '@/db/schema/prices'
import {
  insertPrice,
  safelyInsertPrice,
  safelyUpdatePrice,
  selectPrices,
  selectPricesPaginated,
  selectPricesTableRowData,
  pricesTableRowOutputSchema,
  selectPriceById,
} from '@/db/tableMethods/priceMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import { TRPCError } from '@trpc/server'
import { generateOpenApiMetas } from '@/utils/openapi'
import { z } from 'zod'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@/db/tableUtils'
import { PriceType } from '@/types'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'

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
      async ({ transaction }) => {
        const { price } = input

        // Get product to check if it's a default product
        const product = await selectProductById(
          price.productId,
          transaction
        )

        // Get all prices for this product to validate constraints
        const existingPrices = await selectPrices(
          { productId: price.productId },
          transaction
        )

        // Forbid creating additional prices for default products
        if (product.default && existingPrices.length > 0) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'Cannot create additional prices for the default plan',
          })
        }

        // If we're setting this price as default, ensure no other prices are default
        const defaultPrices = [...existingPrices, price].filter(
          (v) => v.isDefault
        )
        if (defaultPrices.length > 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'There must be exactly one default price per product',
          })
        }

        // Validate that default prices on default products must have unitPrice = 0
        if (
          price.isDefault &&
          product.default &&
          price.unitPrice !== 0
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Default prices on default products must have unitPrice = 0',
          })
        }
        const organization = await selectOrganizationById(
          ctx.organizationId!,
          transaction
        )
        const existingProductHasNoDefaultPrice =
          existingPrices.length === 0
        const newPrice = await safelyInsertPrice(
          {
            ...price,
            isDefault:
              existingProductHasNoDefaultPrice ||
              input.price.isDefault,
            livemode: ctx.livemode,
            currency: organization.defaultCurrency,
            externalId: null,
          },
          transaction
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

        const product = await selectProductById(
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

        // Validate immutable fields for ALL prices
        validatePriceImmutableFields({
          update: price,
          existing: existingPrice,
        })

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
        return selectPriceById(input.id, transaction)
      },
      { apiKey: ctx.apiKey }
    )
    return { price }
  })

export const getTableRows = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        productId: z.string().optional(),
        type: z.nativeEnum(PriceType).optional(),
        isDefault: z.boolean().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(pricesTableRowOutputSchema)
  )
  .query(authenticatedProcedureTransaction(selectPricesTableRowData))

export const listUsagePricesForProduct = protectedProcedure
  .input(z.object({ productId: z.string() }))
  .output(z.array(usagePriceClientSelectSchema))
  .query(
    authenticatedProcedureTransaction(
      async ({ transaction, input }) => {
        const prices = await selectPrices(
          {
            type: PriceType.Usage,
            productId: input.productId,
            active: true,
          },
          transaction
        )
        return prices.filter(
          (price) => price.type === PriceType.Usage
        )
      }
    )
  )

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
  listUsagePricesForProduct,
  setAsDefault: setPriceAsDefault,
  archive: archivePrice,
  get: getPrice,
})
