import { protectedProcedure, router } from '@/server/trpc'
import {
  invoicesClientSelectSchema,
  invoicesPaginatedListSchema,
  invoicesPaginatedSelectSchema,
} from '@/db/schema/invoices'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  insertInvoice,
  selectInvoiceById,
  selectInvoicesPaginated,
  selectInvoiceCountsByStatus,
  selectInvoicesTableRowData,
} from '@/db/tableMethods/invoiceMethods'
import {
  idInputSchema,
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
} from '@/db/tableUtils'
import {
  createPostOpenApiMeta,
  generateOpenApiMetas,
} from '@/utils/openapi'
import {
  createInvoiceSchema,
  editInvoiceSchema,
  invoiceLineItemsClientSelectSchema,
  invoiceWithLineItemsClientSchema,
  sendInvoiceReminderSchema,
} from '@/db/schema/invoiceLineItems'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import {
  insertInvoiceLineItems,
  selectInvoiceLineItems,
  selectInvoiceLineItemsAndInvoicesByInvoiceWhere,
} from '@/db/tableMethods/invoiceLineItemMethods'
import { z } from 'zod'
import {
  sendInvoiceReminderEmail,
  sendInvoiceNotificationEmail,
} from '@/utils/email'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { updateInvoiceTransaction } from '@/utils/invoiceHelpers'
import { InvoiceStatus } from '@/types'

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
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectInvoicesPaginated(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getInvoiceProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(invoiceWithLineItemsClientSchema)
  .query(async ({ ctx, input }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const [invoiceAndLineItems] =
          await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
            { id: input.id },
            transaction
          )
        return invoiceAndLineItems
      },
      {
        apiKey: ctx.apiKey,
      }
    )
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
    return authenticatedTransaction(
      async ({ transaction }) => {
        const {
          invoice: invoiceInsert,
          invoiceLineItems: invoiceLineItemInserts,
          autoSend,
        } = input
        const customer = await selectCustomerById(
          invoiceInsert.customerId,
          transaction
        )

        const invoice = await insertInvoice(
          {
            ...invoiceInsert,
            livemode: ctx.livemode,
            dueDate: invoiceInsert.dueDate ?? new Date(),
            organizationId: ctx.organizationId!,
          },
          transaction
        )

        const invoiceLineItems = await insertInvoiceLineItems(
          invoiceLineItemInserts.map((invoiceLineItemInsert) => ({
            ...invoiceLineItemInsert,
            invoiceId: invoice.id,
            livemode: ctx.livemode,
          })),
          transaction
        )

        if (!customer.stripeCustomerId) {
          throw new Error(
            `Customer ${customer.id} does not have a stripeCustomerId`
          )
        }

        if (autoSend) {
          const organization = await selectOrganizationById(
            ctx.organizationId!,
            transaction
          )
          await sendInvoiceNotificationEmail({
            to: [customer.email],
            invoice,
            invoiceLineItems,
            organizationName: organization.name,
            organizationLogoUrl: organization.logoURL ?? undefined,
          })
        }

        return { invoice, invoiceLineItems }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
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
      await authenticatedTransaction(
        async ({ transaction }) => {
          return updateInvoiceTransaction(
            input,
            ctx.livemode,
            transaction
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    return { invoice, invoiceLineItems }
  })

const sendInvoiceReminderProcedure = protectedProcedure
  .meta(
    createPostOpenApiMeta({
      resource: 'invoices/:id',
      routeSuffix: 'send-reminder',
      summary: 'Send Reminder Email for an Invoice',
      tags: ['Invoices', 'Invoice', 'Invoice Reminder'],
      idParamOverride: 'invoiceId',
    })
  )
  .input(sendInvoiceReminderSchema)
  .output(z.object({ success: z.boolean() }))
  .mutation(async ({ ctx, input }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const invoice = await selectInvoiceById(
          input.invoiceId,
          transaction
        )
        const organization = await selectOrganizationById(
          invoice.organizationId!,
          transaction
        )
        const invoiceLineItems = await selectInvoiceLineItems(
          {
            invoiceId: invoice.id,
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
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getCountsByStatusProcedure = protectedProcedure
  .input(z.object({}))
  .output(
    z.array(
      z.object({
        status: z.nativeEnum(InvoiceStatus),
        count: z.number(),
      })
    )
  )
  .query(async ({ ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectInvoiceCountsByStatus(transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getTableRowsProcedure = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        status: z.nativeEnum(InvoiceStatus).optional(),
        customerId: z.string().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(
      z.object({
        invoice: invoicesClientSelectSchema,
        invoiceLineItems: invoiceLineItemsClientSelectSchema.array(),
        customer: z.object({
          id: z.string(),
          name: z.string(),
        }),
      })
    )
  )
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const { cursor, limit = 10, filters = {} } = input

        // Use the existing selectInvoicesTableRowData function
        const invoiceRows = await selectInvoicesTableRowData(
          ctx.organizationId || '',
          transaction
        )

        // Apply filters
        let filteredRows = invoiceRows
        if (filters.status) {
          filteredRows = filteredRows.filter(
            (row) => row.invoice.status === filters.status
          )
        }
        if (filters.customerId) {
          filteredRows = filteredRows.filter(
            (row) => row.invoice.customerId === filters.customerId
          )
        }

        // Apply pagination
        const startIndex = cursor ? parseInt(cursor, 10) : 0
        const endIndex = startIndex + limit
        const paginatedRows = filteredRows.slice(startIndex, endIndex)
        const hasMore = endIndex < filteredRows.length

        return {
          data: paginatedRows,
          hasMore,
          total: filteredRows.length,
          currentCursor: cursor || '0',
          nextCursor: hasMore ? endIndex.toString() : undefined,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const invoicesRouter = router({
  list: listInvoicesProcedure,
  create: createInvoiceProcedure,
  get: getInvoiceProcedure,
  update: updateInvoiceProcedure,
  sendReminder: sendInvoiceReminderProcedure,
  getCountsByStatus: getCountsByStatusProcedure,
  getTableRows: getTableRowsProcedure,
})
