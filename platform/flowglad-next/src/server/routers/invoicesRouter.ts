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
  InvoiceLineItem,
  invoiceLineItemsClientSelectSchema,
  sendInvoiceReminderSchema,
} from '@/db/schema/invoiceLineItems'
import { selectCustomerProfileById } from '@/db/tableMethods/customerProfileMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import {
  deleteInvoiceLineItems,
  insertInvoiceLineItem,
  insertInvoiceLineItems,
  selectInvoiceLineItems,
  updateInvoiceLineItem,
} from '@/db/tableMethods/invoiceLineItemMethods'
import { z } from 'zod'
import {
  sendInvoiceReminderEmail,
  sendInvoiceNotificationEmail,
} from '@/utils/email'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { update } from 'ramda'
import { updatePaymentIntent } from '@/utils/stripe'

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
      autoSend: z.boolean().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      const {
        invoice: invoiceInsert,
        invoiceLineItems: invoiceLineItemInserts,
        autoSend,
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

      if (autoSend) {
        const organization = await selectOrganizationById(
          ctx.OrganizationId!,
          transaction
        )
        await sendInvoiceNotificationEmail({
          to: [customerProfile.email],
          invoice,
          invoiceLineItems,
          organizationName: organization.name,
          organizationLogoUrl: organization.logoURL ?? undefined,
        })
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
    const { invoice, invoiceLineItems } =
      await authenticatedTransaction(async ({ transaction }) => {
        const updatedInvoice = await updateInvoice(
          input.invoice,
          transaction
        )
        const existingInvoiceLineItems = await selectInvoiceLineItems(
          {
            InvoiceId: updatedInvoice.id,
          },
          transaction
        )

        const lineItemsToDelete = existingInvoiceLineItems.filter(
          (invoiceLineItem) =>
            !input.invoiceLineItems.includes(invoiceLineItem)
        )

        await deleteInvoiceLineItems(
          lineItemsToDelete.map((invoiceLineItem) => ({
            id: invoiceLineItem.id,
          })),
          transaction
        )
        await Promise.all(
          input.invoiceLineItems.map(async (invoiceLineItem) => {
            if ('id' in invoiceLineItem) {
              return updateInvoiceLineItem(
                invoiceLineItem,
                transaction
              )
            } else {
              return insertInvoiceLineItem(
                {
                  ...invoiceLineItem,
                  livemode: ctx.livemode,
                },
                transaction
              )
            }
          })
        )
        const invoiceLineItems = await selectInvoiceLineItems(
          {
            InvoiceId: updatedInvoice.id,
          },
          transaction
        )
        return { invoice: updatedInvoice, invoiceLineItems }
      })
    return { invoice, invoiceLineItems }
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
