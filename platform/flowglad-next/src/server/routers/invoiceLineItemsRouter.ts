import { protectedProcedure, router } from '@/server/trpc'
import {
  invoiceLineItemsClientSelectSchema,
  invoiceLineItemsPaginatedListSchema,
  invoiceLineItemsPaginatedSelectSchema,
} from '@/db/schema/invoiceLineItems'
import { authenticatedTransaction } from '@/db/databaseMethods'
import {
  selectInvoiceLineItemById,
  selectInvoiceLineItemsPaginated,
} from '@/db/tableMethods/invoiceLineItemMethods'
import { idInputSchema } from '@/db/tableUtils'
import { generateOpenApiMetas } from '@/utils/openapi'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'Invoice Line Item',
  tags: ['Invoice Line Items'],
})

export const invoiceLineItemsRouteConfigs = routeConfigs

const listInvoiceLineItemsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(invoiceLineItemsPaginatedSelectSchema)
  .output(invoiceLineItemsPaginatedListSchema)
  .query(async ({ ctx, input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      return selectInvoiceLineItemsPaginated(input, transaction)
    })
  })

const getInvoiceLineItemProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(invoiceLineItemsClientSelectSchema)
  .query(async ({ ctx, input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      return selectInvoiceLineItemById(input.id, transaction)
    })
  })

export const invoiceLineItemsRouter = router({
  list: listInvoiceLineItemsProcedure,
  get: getInvoiceLineItemProcedure,
})
