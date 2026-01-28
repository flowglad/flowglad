import { Result } from 'better-result'
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
    const txResult = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectInvoiceLineItemsPaginated(
          input,
          transaction
        )
        return Result.ok(data)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return txResult.unwrap()
  })

const getInvoiceLineItemProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(invoiceLineItemsClientSelectSchema)
  .query(async ({ ctx, input }) => {
    const txResult = await authenticatedTransaction(
      async ({ transaction }) => {
        const item = (
          await selectInvoiceLineItemById(input.id, transaction)
        ).unwrap()
        return Result.ok(item)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return txResult.unwrap()
  })

export const invoiceLineItemsRouter = router({
  list: listInvoiceLineItemsProcedure,
  get: getInvoiceLineItemProcedure,
})
