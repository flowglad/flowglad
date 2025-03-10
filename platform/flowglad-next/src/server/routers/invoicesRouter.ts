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
  sendInvoiceReminderSchema,
} from '@/db/schema/invoiceLineItems'
import { selectCustomerProfileById } from '@/db/tableMethods/customerProfileMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import {
  insertInvoiceLineItems,
  selectInvoiceLineItems,
} from '@/db/tableMethods/invoiceLineItemMethods'
import { z } from 'zod'
import { sendInvoiceReminderEmail } from '@/utils/email'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'

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

const sendInvoiceReminderProcedure = protectedProcedure
  .meta(openApiMetas.POST)
  .input(sendInvoiceReminderSchema)
  .mutation(async ({ ctx, input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      const invoice = await selectInvoiceById(
        input.invoiceId,
        transaction
      )
      const customerProfile = await selectCustomerProfileById(
        invoice.CustomerProfileId,
        transaction
      )
      const customer = await selectCustomerById(
        customerProfile.CustomerId,
        transaction
      )
      const organization = await selectOrganizationById(
        invoice.OrganizationId!,
        transaction
      )
      const invoiceLineItems = await selectInvoiceLineItems(
        {
          InvoiceId: invoice.id,
        },
        transaction
      )

      await sendInvoiceReminderEmail({
        to: input.to,
        cc: input.cc,
        invoice,
        invoiceLineItems,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoURL ?? undefined,
      })

      return { success: true }
    })
  })

export const invoicesRouter = router({
  list: listInvoicesProcedure,
  create: createInvoiceProcedure,
  get: getInvoiceProcedure,
  update: updateInvoiceProcedure,
  sendReminder: sendInvoiceReminderProcedure,
})
