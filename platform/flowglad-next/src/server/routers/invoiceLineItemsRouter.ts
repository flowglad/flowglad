import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  invoiceLineItemsClientSelectSchema,
  invoiceLineItemsPaginatedListSchema,
  invoiceLineItemsPaginatedSelectSchema,
} from '@/db/schema/invoiceLineItems'
import {
  selectInvoiceLineItemById,
  selectInvoiceLineItemsPaginated,
} from '@/db/tableMethods/invoiceLineItemMethods'
import { idInputSchema } from '@/db/tableUtils'
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
          return selectInvoiceLineItemsPaginated(input, transaction)
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
          return selectInvoiceLineItemById(input.id, transaction)
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
