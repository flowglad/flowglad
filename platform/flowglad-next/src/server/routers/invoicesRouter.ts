import { Result } from 'better-result'
import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  editInvoiceSchema,
  invoiceLineItemsClientSelectSchema,
  invoicesPaginatedTableRowDataSchema,
  invoiceWithLineItemsClientSchema,
} from '@/db/schema/invoiceLineItems'
import {
  invoicesClientSelectSchema,
  invoicesPaginatedListSchema,
  invoicesPaginatedSelectSchema,
} from '@/db/schema/invoices'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import {
  selectInvoiceCountsByStatus,
  selectInvoicesPaginated,
  selectInvoicesTableRowData,
} from '@/db/tableMethods/invoiceMethods'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@/db/tableUtils'
import { protectedProcedure, router } from '@/server/trpc'
import { InvoiceStatus } from '@/types'
import { updateInvoiceTransaction } from '@/utils/invoiceHelpers'
import { generateOpenApiMetas } from '@/utils/openapi'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'Invoice',
  tags: ['Invoices'],
})

export const invoicesRouteConfigs = routeConfigs

const listInvoicesProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(invoicesPaginatedSelectSchema)
  .output(invoicesPaginatedListSchema)
  .query(async ({ ctx, input }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectInvoicesPaginated(input, transaction)
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const getInvoiceProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(invoiceWithLineItemsClientSchema)
  .query(async ({ ctx, input }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const [invoiceAndLineItems] =
          await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
            { id: input.id },
            transaction
          )
        return Result.ok(invoiceAndLineItems)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const updateInvoiceProcedure = protectedProcedure
  .input(editInvoiceSchema)
  .output(
    z.object({
      invoice: invoicesClientSelectSchema,
      invoiceLineItems: invoiceLineItemsClientSelectSchema.array(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await updateInvoiceTransaction(
          input,
          ctx.livemode,
          transaction
        )
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const getCountsByStatusProcedure = protectedProcedure
  .input(z.object({}))
  .output(
    z.array(
      z.object({
        status: z.enum(InvoiceStatus),
        count: z.number(),
      })
    )
  )
  .query(async ({ ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectInvoiceCountsByStatus(transaction)
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const getTableRowsProcedure = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        status: z.enum(InvoiceStatus).optional(),
        customerId: z.string().optional(),
        subscriptionId: z.string().optional(),
        invoiceId: z.string().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(
      invoicesPaginatedTableRowDataSchema
    )
  )
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectInvoicesTableRowData({
          input,
          transaction,
        })
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

export const invoicesRouter = router({
  list: listInvoicesProcedure,
  get: getInvoiceProcedure,
  update: updateInvoiceProcedure,
  getCountsByStatus: getCountsByStatusProcedure,
  getTableRows: getTableRowsProcedure,
})
