import { InvoiceStatus, SubscriptionItemType } from '@db-core/enums'
import {
  createInvoiceSchema,
  editInvoiceSchema,
  invoiceLineItemsClientSelectSchema,
  invoicesPaginatedTableRowDataSchema,
  invoiceWithLineItemsClientSchema,
} from '@db-core/schema/invoiceLineItems'
import {
  invoicesClientSelectSchema,
  invoicesPaginatedListSchema,
  invoicesPaginatedSelectSchema,
} from '@db-core/schema/invoices'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@db-core/tableUtils'
import { Result } from 'better-result'
import { z } from 'zod'
import {
  authenticatedProcedureTransaction,
  authenticatedTransactionWithResult,
} from '@/db/authenticatedTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import {
  insertInvoiceLineItems,
  selectInvoiceLineItems,
  selectInvoiceLineItemsAndInvoicesByInvoiceWhere,
} from '@/db/tableMethods/invoiceLineItemMethods'
import {
  insertInvoice,
  selectInvoiceById,
  selectInvoiceCountsByStatus,
  selectInvoicesPaginated,
  selectInvoicesTableRowData,
} from '@/db/tableMethods/invoiceMethods'
import {
  selectOrganizationAndFirstMemberByOrganizationId,
  selectOrganizationById,
} from '@/db/tableMethods/organizationMethods'
import { protectedProcedure, router } from '@/server/trpc'
import { fetchDiscountInfoForInvoice } from '@/utils/discountHelpers'
import { updateInvoiceTransaction } from '@/utils/invoiceHelpers'
import {
  createPostOpenApiMeta,
  generateOpenApiMetas,
} from '@/utils/openapi'
import { unwrapOrThrow } from '@/utils/resultHelpers'

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
    return (
      await authenticatedTransactionWithResult(
        async ({ transaction }) => {
          return Result.ok(
            await selectInvoicesPaginated(input, transaction)
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
  })

const getInvoiceProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(invoiceWithLineItemsClientSchema)
  .query(async ({ ctx, input }) => {
    return (
      await authenticatedTransactionWithResult(
        async ({ transaction }) => {
          const [invoiceAndLineItems] =
            await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
              { id: input.id },
              transaction
            )
          return Result.ok(invoiceAndLineItems)
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
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
    const { invoice, invoiceLineItems } = (
      await authenticatedTransactionWithResult(
        async ({ transaction }) => {
          return Result.ok(
            await updateInvoiceTransaction(
              input,
              ctx.livemode,
              transaction
            )
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
    return { invoice, invoiceLineItems }
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
    return (
      await authenticatedTransactionWithResult(
        async ({ transaction }) => {
          return Result.ok(
            await selectInvoiceCountsByStatus(transaction)
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
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
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return await selectInvoicesTableRowData({
          input,
          transaction,
        })
      }
    )
  )

export const invoicesRouter = router({
  list: listInvoicesProcedure,
  get: getInvoiceProcedure,
  getCountsByStatus: getCountsByStatusProcedure,
  getTableRows: getTableRowsProcedure,
})
