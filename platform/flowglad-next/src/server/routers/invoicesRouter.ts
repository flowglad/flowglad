import { protectedProcedure, router } from '@/server/trpc'
import {
  invoicesClientSelectSchema,
  invoicesPaginatedListSchema,
  invoicesPaginatedSelectSchema,
} from '@/db/schema/invoices'
import { authenticatedTransaction } from '@/db/databaseMethods'
import {
  insertInvoice,
  selectInvoiceById,
  selectInvoicesPaginated,
  updateInvoice,
} from '@/db/tableMethods/invoiceMethods'
import { idInputSchema } from '@/db/tableUtils'
import { generateOpenApiMetas } from '@/utils/openapi'
import {
  createInvoiceSchema,
  editInvoiceSchema,
  invoiceLineItemsClientSelectSchema,
} from '@/db/schema/invoiceLineItems'
import { selectCustomerProfileById } from '@/db/tableMethods/customerProfileMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import {
  bulkUpsertInvoiceLineItems,
  insertInvoiceLineItems,
} from '@/db/tableMethods/invoiceLineItemMethods'
import { z } from 'zod'

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
    return authenticatedTransaction(async ({ transaction }) => {
      return selectInvoicesPaginated(input, transaction)
    })
  })

const getInvoiceProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(invoicesClientSelectSchema)
  .query(async ({ ctx, input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      return selectInvoiceById(input.id, transaction)
    })
  })

const createInvoiceProcedure = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createInvoiceSchema)
  .output(
    z.object({
      invoice: invoicesClientSelectSchema,
      invoiceLineItems: invoiceLineItemsClientSelectSchema.array(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      const {
        invoice: invoiceInsert,
        invoiceLineItems: invoiceLineItemInserts,
      } = input
      const customerProfile = await selectCustomerProfileById(
        invoiceInsert.CustomerProfileId,
        transaction
      )

      const invoice = await insertInvoice(
        {
          ...invoiceInsert,
          livemode: ctx.livemode,
          dueDate: invoiceInsert.dueDate ?? new Date(),
          OrganizationId: ctx.OrganizationId!,
        },
        transaction
      )

      const invoiceLineItems = await insertInvoiceLineItems(
        invoiceLineItemInserts.map((invoiceLineItemInsert) => ({
          ...invoiceLineItemInsert,
          InvoiceId: invoice.id,
          livemode: ctx.livemode,
        })),
        transaction
      )

      if (!customerProfile.stripeCustomerId) {
        throw new Error(
          `Customer profile ${customerProfile.id} does not have a stripeCustomerId`
        )
      }

      return { invoice, invoiceLineItems }
    })
  })

const updateInvoiceProcedure = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editInvoiceSchema)
  .output(
    z.object({
      invoice: invoicesClientSelectSchema,
      invoiceLineItems: invoiceLineItemsClientSelectSchema.array(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const invoice = await authenticatedTransaction(
      async ({ transaction }) => {
        return updateInvoice(input.invoice, transaction)
      }
    )
    return { invoice, invoiceLineItems: [] }
  })

export const invoicesRouter = router({
  list: listInvoicesProcedure,
  create: createInvoiceProcedure,
  get: getInvoiceProcedure,
  update: updateInvoiceProcedure,
})
