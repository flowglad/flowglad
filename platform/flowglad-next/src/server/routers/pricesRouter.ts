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
  validateUsagePriceSlug,
} from '@/db/schema/prices'
import {
  ensureUsageMeterHasDefaultPrice,
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
import { isNoChargePrice } from '@/utils/usage/noChargePriceHelpers'
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
      async (transactionCtx) => {
        const { price } = input

        validateUsagePriceSlug(price)

        const newPrice = await createPriceTransaction(
          { price },
          transactionCtx
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
      async (transactionCtx) => {
        const { transaction } = transactionCtx
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

        // No_charge price protection - these checks must come BEFORE other validation
        // No_charge prices can only have their name changed
        // Note: Only usage prices can be no_charge prices
        const existingIsNoCharge =
          existingPrice.type === PriceType.Usage &&
          existingPrice.slug &&
          isNoChargePrice(existingPrice.slug)
        if (existingIsNoCharge) {
          // Reject archiving (setting active to false)
          if (price.active === false) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'No charge prices cannot be archived. They are protected as fallback prices.',
            })
          }
          // Reject slug changes
          if (
            price.slug !== undefined &&
            price.slug !== existingPrice.slug
          ) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'The slug of a no charge price is immutable. Only the name can be changed.',
            })
          }
          // Reject unsetting isDefault on a no_charge price that is currently default
          // Note: Internal cascade logic (setPricesForUsageMeterToNonDefault) bypasses this,
          // so setting another price as default still works correctly
          if (
            price.isDefault === false &&
            existingPrice.isDefault === true
          ) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'Default no_charge prices cannot be unset; isDefault is immutable for fallback prices.',
            })
          }
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

        // Validate reserved slug for usage prices being updated
        // Only validate if the slug is actually changing - existing _no_charge prices
        // should be editable for other fields without triggering slug validation
        if (
          existingPrice.type === PriceType.Usage &&
          price.slug !== undefined &&
          price.slug !== existingPrice.slug
        ) {
          validateUsagePriceSlug({
            type: existingPrice.type,
            slug: price.slug,
          })
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
          transactionCtx
        )

        // Default cascade logic for usage prices:
        // When a usage price is unset as default (isDefault: false) or deactivated (active: false),
        // ensure the usage meter still has a default price by falling back to no_charge
        if (
          existingPrice.type === PriceType.Usage &&
          existingPrice.usageMeterId
        ) {
          const wasDefault = existingPrice.isDefault
          const isNoLongerDefault =
            price.isDefault === false || price.active === false
          if (wasDefault && isNoLongerDefault) {
            await ensureUsageMeterHasDefaultPrice(
              existingPrice.usageMeterId,
              transactionCtx
            )
          }
        }

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
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectPricesTableRowData({ input, transaction })
      }
    )
  )

export const setPriceAsDefault = protectedProcedure
  .input(idInputSchema)
  .output(z.object({ price: pricesClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        const oldPrice = await selectPriceById(input.id, transaction)
        const price = await safelyUpdatePrice(
          { id: input.id, isDefault: true, type: oldPrice.type },
          transactionCtx
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
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        const oldPrice = await selectPriceById(input.id, transaction)

        // No_charge price protection - cannot be archived
        // Note: Only usage prices can be no_charge prices
        if (
          oldPrice.type === PriceType.Usage &&
          oldPrice.slug &&
          isNoChargePrice(oldPrice.slug)
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'No charge prices cannot be archived. They are protected as fallback prices.',
          })
        }

        const price = await safelyUpdatePrice(
          { id: input.id, active: false, type: oldPrice.type },
          transactionCtx
        )

        // Default cascade logic for usage prices:
        // When archiving a default usage price, ensure the meter still has a default
        if (
          oldPrice.type === PriceType.Usage &&
          oldPrice.usageMeterId &&
          oldPrice.isDefault
        ) {
          await ensureUsageMeterHasDefaultPrice(
            oldPrice.usageMeterId,
            transactionCtx
          )
        }

        return { price }
      }
    )
  )

/**
 * Atomically replaces a usage price by creating a new price and archiving the old one.
 *
 * This is used when editing a usage price's immutable fields (unitPrice, usageEventsPerUnit).
 * Unlike product prices where createPriceTransaction handles archiving automatically,
 * usage meters can have multiple active prices, so we need explicit control over
 * which price gets archived.
 */
export const replaceUsagePrice = protectedProcedure
  .input(
    z.object({
      newPrice: createPriceSchema.shape.price,
      oldPriceId: z.string(),
    })
  )
  .output(
    z.object({
      newPrice: pricesClientSelectSchema,
      archivedPrice: pricesClientSelectSchema,
    })
  )
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async (transactionCtx) => {
        const { transaction } = transactionCtx
        // Verify the old price exists and is a usage price
        let oldPrice
        try {
          oldPrice = await selectPriceById(
            input.oldPriceId,
            transaction
          )
        } catch (error) {
          if (error instanceof NotFoundError) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Price with id "${input.oldPriceId}" not found`,
            })
          }
          throw error
        }
        if (oldPrice.type !== PriceType.Usage) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'replaceUsagePrice can only be used with usage prices',
          })
        }

        // Validate the new price belongs to the same usage meter
        if (input.newPrice.usageMeterId !== oldPrice.usageMeterId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'New price must belong to the same usage meter as the old price',
          })
        }

        validateUsagePriceSlug(input.newPrice)

        // Create the new price
        const newPrice = await createPriceTransaction(
          { price: input.newPrice },
          transactionCtx
        )

        // Archive the old price
        const archivedPrice = await safelyUpdatePrice(
          {
            id: input.oldPriceId,
            active: false,
            type: oldPrice.type,
          },
          transactionCtx
        )

        return { newPrice, archivedPrice }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const pricesRouter = router({
  list: listPrices,
  create: createPrice,
  update: updatePrice,
  getTableRows,
  setAsDefault: setPriceAsDefault,
  archive: archivePrice,
  get: getPrice,
  replaceUsagePrice,
})
