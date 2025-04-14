import { router } from '@/server/trpc'
import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import {
  editPriceSchema,
  pricesClientSelectSchema,
  pricesPaginatedListSchema,
  pricesPaginatedSelectSchema,
} from '@/db/schema/prices'
import { editPriceTransaction } from '@/utils/catalog'
import { createPriceSchema } from '@/db/schema/prices'
import {
  insertPrice,
  selectPrices,
  selectPricesPaginated,
  selectPricesTableRowData,
} from '@/db/tableMethods/priceMethods'
import { TRPCError } from '@trpc/server'
import { generateOpenApiMetas } from '@/utils/openapi'
import { z } from 'zod'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
} from '@/db/tableUtils'
import { PriceType } from '@/types'

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

        // Get all prices for this product to validate default price constraint
        const existingPrices = await selectPrices(
          { productId: price.productId },
          transaction
        )

        // If we're setting this price as default, ensure no other prices are default
        const defaultPrices = [...existingPrices, price].filter(
          (v) => v.isDefault
        )

        if (defaultPrices.length !== 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'There must be exactly one default price per product',
          })
        }

        const newPrice = await insertPrice(price, transaction)
        return {
          price: newPrice,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const editPrice = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editPriceSchema)
  .output(singlePriceOutputSchema)
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, userId }) => {
        const { price } = input

        const updatedPrice = await editPriceTransaction(
          { price },
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
    createPaginatedTableRowOutputSchema(
      z.object({
        price: pricesClientSelectSchema,
        product: z.object({
          id: z.string(),
          name: z.string(),
        }),
      })
    )
  )
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const { cursor, limit = 10, filters = {} } = input

        // Use the existing selectPricesTableRowData function
        const priceRows = await selectPricesTableRowData(
          ctx.organizationId || '',
          transaction
        )

        // Apply filters
        let filteredRows = priceRows
        if (filters.productId) {
          filteredRows = filteredRows.filter(
            (row) => row.price.productId === filters.productId
          )
        }
        if (filters.type) {
          filteredRows = filteredRows.filter(
            (row) => row.price.type === filters.type
          )
        }
        if (filters.isDefault !== undefined) {
          filteredRows = filteredRows.filter(
            (row) => row.price.isDefault === filters.isDefault
          )
        }

        // Apply pagination
        const startIndex = cursor ? parseInt(cursor, 10) : 0
        const endIndex = startIndex + limit
        const paginatedRows = filteredRows.slice(startIndex, endIndex)
        const hasMore = endIndex < filteredRows.length

        return {
          data: paginatedRows,
          currentCursor: cursor || '0',
          nextCursor: hasMore ? endIndex.toString() : undefined,
          hasMore,
          total: filteredRows.length,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const pricesRouter = router({
  list: listPrices,
  create: createPrice,
  edit: editPrice,
  getTableRows,
})
