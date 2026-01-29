import { idInputSchema } from '@db-core/tableUtils'
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
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectInvoiceLineItemsPaginated(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getInvoiceLineItemProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(invoiceLineItemsClientSelectSchema)
  .query(async ({ ctx, input }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return (
          await selectInvoiceLineItemById(input.id, transaction)
        ).unwrap()
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const invoiceLineItemsRouter = router({
  list: listInvoiceLineItemsProcedure,
  get: getInvoiceLineItemProcedure,
})
