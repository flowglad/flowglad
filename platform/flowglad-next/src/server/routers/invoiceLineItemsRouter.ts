import {
  invoiceLineItemsClientSelectSchema,
  invoiceLineItemsPaginatedListSchema,
  invoiceLineItemsPaginatedSelectSchema,
} from '@db-core/schema/invoiceLineItems'
import { idInputSchema } from '@db-core/tableUtils'
import { Result } from 'better-result'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  selectInvoiceLineItemById,
  selectInvoiceLineItemsPaginated,
} from '@/db/tableMethods/invoiceLineItemMethods'
import { protectedProcedure, router } from '@/server/trpc'
import { generateOpenApiMetas } from '@/utils/openapi'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'invoiceLineItem',
  tags: ['Invoice Line Items'],
})

export const invoiceLineItemsRouteConfigs = routeConfigs

const listInvoiceLineItemsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(invoiceLineItemsPaginatedSelectSchema)
  .output(invoiceLineItemsPaginatedListSchema)
  .query(async ({ ctx, input }) => {
    return (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await selectInvoiceLineItemsPaginated(input, transaction)
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
  })

const getInvoiceLineItemProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(invoiceLineItemsClientSelectSchema)
  .query(async ({ ctx, input }) => {
    return (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return Result.ok(
            (
              await selectInvoiceLineItemById(input.id, transaction)
            ).unwrap()
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
  })

export const invoiceLineItemsRouter = router({
  list: listInvoiceLineItemsProcedure,
  get: getInvoiceLineItemProcedure,
})
