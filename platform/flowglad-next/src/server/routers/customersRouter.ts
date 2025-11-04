import { router } from '../trpc'
import { protectedProcedure } from '@/server/trpc'
import { errorHandlers } from '../trpcErrorHandler'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import { z } from 'zod'
import {
  selectCustomerById,
  selectCustomers,
  selectCustomersPaginated,
  updateCustomer as updateCustomerDb,
  selectCustomersCursorPaginatedWithTableRowData,
  selectCustomerByExternalIdAndOrganizationId,
} from '@/db/tableMethods/customerMethods'
import {
  customerClientSelectSchema,
  editCustomerOutputSchema,
  editCustomerInputSchema,
  customersPaginatedSelectSchema,
  customersPaginatedListSchema,
  customersPaginatedTableRowOutputSchema,
  customersPaginatedTableRowInputSchema,
  Customer,
} from '@/db/schema/customers'
import { TRPCError } from '@trpc/server'
import { createCustomerBookkeeping } from '@/utils/bookkeeping'
import { revalidatePath } from 'next/cache'
import { createCustomerInputSchema } from '@/db/tableMethods/purchaseMethods'
import {
  CreateCustomerOutputSchema,
  createCustomerOutputSchema,
  purchaseClientSelectSchema,
} from '@/db/schema/purchases'
import {
  createGetOpenApiMeta,
  generateOpenApiMetas,
  trpcToRest,
  RouteConfig,
} from '@/utils/openapi'
import { externalIdInputSchema } from '@/db/tableUtils'
import { pricingModelWithProductsAndUsageMetersSchema } from '@/db/schema/prices'
import { richSubscriptionClientSelectSchema } from '@/subscriptions/schemas'
import { paymentMethodClientSelectSchema } from '@/db/schema/paymentMethods'
import { invoiceWithLineItemsClientSchema } from '@/db/schema/invoiceLineItems'
import { customerBillingTransaction } from '@/utils/bookkeeping/customerBilling'
import { TransactionOutput } from '@/db/transactionEnhacementTypes'
import { subscriptionWithCurrent } from '@/db/tableMethods/subscriptionMethods'
import { organizationBillingPortalURL } from '@/utils/core'
import { createCustomersCsv } from '@/utils/csv-export'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'
import { generateCsvExportTask } from '@/trigger/exports/generate-csv-export'
import { createTriggerIdempotencyKey } from '@/utils/backendCore'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'customer',
  tags: ['Customer'],
  idParamOverride: 'externalId',
})

export const customersRouteConfigs = routeConfigs

export const customerBillingRouteConfig: Record<string, RouteConfig> =
  {
    'GET /customers/:externalId/billing': {
      procedure: 'customers.getBilling',
      pattern: new RegExp(`^customers\/([^\\/]+)\/billing$`),
      mapParams: (matches) => {
        return {
          externalId: matches[0],
        }
      },
    },
  }

const createCustomerProcedure = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createCustomerInputSchema)
  .output(createCustomerOutputSchema)
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({
        input,
        transaction,
        userId,
        livemode,
        ctx,
        organizationId,
      }): Promise<TransactionOutput<CreateCustomerOutputSchema>> => {
        try {
          if (!organizationId) {
            throw new Error('organizationId is required')
          }

          const { customer } = input
          /**
           * We have to parse the customer record here because of the billingAddress json
           */
          const createdCustomerOutput =
            await createCustomerBookkeeping(
              {
                customer: {
                  ...customer,
                  organizationId,
                },
              },
              { transaction, livemode, organizationId }
            )

          if (ctx.path) {
            await revalidatePath(ctx.path)
          }

          const subscription = createdCustomerOutput.result
            .subscription
            ? subscriptionWithCurrent(
                createdCustomerOutput.result.subscription
              )
            : undefined
          return {
            result: {
              data: {
                customer: createdCustomerOutput.result.customer,
                subscription,
                subscriptionItems:
                  createdCustomerOutput.result.subscriptionItems,
              },
            },
            eventsToInsert: createdCustomerOutput.eventsToInsert,
            ledgerCommand: createdCustomerOutput.ledgerCommand,
          }
        } catch (error) {
          errorHandlers.customer.handle(error, {
            operation: 'create',
            details: { customerData: input.customer },
          })
          throw error
        }
      }
    )
  )

export const updateCustomer = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editCustomerInputSchema)
  .output(editCustomerOutputSchema)
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction, organizationId }) => {
        try {
          const { customer } = input
          const customerRecord =
            await selectCustomerByExternalIdAndOrganizationId(
              {
                externalId: input.externalId,
                organizationId,
              },
              transaction
            )

          if (!customerRecord) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Customer with externalId ${input.externalId} not found`,
            })
          }
          const updatedCustomer = await updateCustomerDb(
            {
              ...customer,
              id: customerRecord.id,
            },
            transaction
          )
          return {
            customer: updatedCustomer,
          }
        } catch (error) {
          errorHandlers.customer.handle(error, {
            operation: 'update',
            id: input.externalId,
            details: {
              customerData: input.customer,
              externalId: input.externalId,
              note: 'error context.id is the externalId of the customer',
            },
          })
          throw error
        }
      }
    )
  )

export const getCustomerById = protectedProcedure
  .input(z.object({ id: z.string() }))
  .output(z.object({ customer: customerClientSelectSchema }))
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        try {
          const customer = await selectCustomerById(
            input.id,
            transaction
          )
          return { customer }
        } catch (error) {
          errorHandlers.customer.handle(error, {
            operation: 'get',
            id: input.id,
          })
          throw error
        }
      }
    )
  )

export const getCustomer = protectedProcedure
  .meta(openApiMetas.GET)
  .input(
    z.object({
      externalId: z
        .string()
        .describe(
          'The ID of the customer, as defined in your application'
        ),
    })
  )
  .output(z.object({ customer: customerClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    const organizationId = ctx.organizationId
    if (!organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'organizationId is required',
      })
    }

    const customers = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectCustomers(
          { externalId: input.externalId, organizationId },
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )

    if (!customers.length) {
      if ('id' in input) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Customer with id ${input.id} not found`,
        })
      } else {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Customer with externalId ${input.externalId} not found`,
        })
      }
    }

    return { customer: customers[0] }
  })

export const getCustomerBilling = protectedProcedure
  .meta(
    createGetOpenApiMeta({
      resource: 'customers',
      routeSuffix: 'billing',
      summary: 'Get Billing Details',
      tags: ['Customer', 'Customer Billing'],
      idParamOverride: 'externalId',
    })
  )
  .input(externalIdInputSchema)
  .output(
    z.object({
      customer: customerClientSelectSchema,
      subscriptions: richSubscriptionClientSelectSchema.array(),
      invoices: invoiceWithLineItemsClientSchema.array(),
      paymentMethods: paymentMethodClientSelectSchema.array(),
      purchases: purchaseClientSelectSchema.array(),
      currentSubscriptions: richSubscriptionClientSelectSchema
        .array()
        .optional()
        .describe(
          'The current subscriptions for the customer. By default, customers can only have one active subscription at a time. This will only return multiple subscriptions if you have enabled multiple subscriptions per customer.'
        ),
      catalog: pricingModelWithProductsAndUsageMetersSchema,
      pricingModel: pricingModelWithProductsAndUsageMetersSchema,
      billingPortalUrl: z
        .url()
        .describe('The billing portal URL for the customer'),
    })
  )
  .query(async ({ input, ctx }) => {
    const organizationId = ctx.organizationId
    if (!organizationId) {
      throw new Error('organizationId is required')
    }
    const {
      customer,
      pricingModel,
      invoices,
      paymentMethods,
      currentSubscriptions,
      purchases,
      subscriptions,
    } = await authenticatedTransaction(
      async ({ transaction }) => {
        return customerBillingTransaction(
          {
            externalId: input.externalId,
            organizationId,
          },
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return {
      customer,
      invoices,
      paymentMethods,
      currentSubscriptions: currentSubscriptions.map((item) =>
        richSubscriptionClientSelectSchema.parse(item)
      ),
      purchases,
      subscriptions,
      catalog: pricingModel,
      pricingModel,
      billingPortalUrl: organizationBillingPortalURL({
        organizationId,
      }),
      experimental: {},
    }
  })

const listCustomersProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(customersPaginatedSelectSchema)
  .output(customersPaginatedListSchema)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        return selectCustomersPaginated(input, transaction)
      }
    )
  )

const getTableRowsProcedure = protectedProcedure
  .input(customersPaginatedTableRowInputSchema)
  .output(customersPaginatedTableRowOutputSchema)
  .query(
    authenticatedProcedureTransaction(
      selectCustomersCursorPaginatedWithTableRowData
    )
  )

const exportCsvProcedure = protectedProcedure
  .input(
    z.object({
      filters: z
        .object({
          archived: z.boolean().optional(),
          pricingModelId: z.string().optional(),
        })
        .optional(),
      searchQuery: z.string().optional(),
    })
  )
  .output(
    z.object({
      csv: z.string().optional(),
      filename: z.string().optional(),
      totalCustomers: z.number(),
      asyncExportStarted: z.boolean().optional(),
    })
  )
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction, userId, organizationId }) => {
        const { filters, searchQuery } = input
        // Maximum number of customers that can be exported via CSV without async export
        const CUSTOMER_LIMIT = 1000
        const PAGE_SIZE = 100
        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'User ID is required',
          })
        }

        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Organization ID is required',
          })
        }

        // Get first page to check total count with minimal data transfer
        const countCheckResponse =
          await selectCustomersCursorPaginatedWithTableRowData({
            input: {
              pageSize: 1, // Minimal page size for count check
              filters,
              searchQuery,
            },
            transaction,
          })

        const totalCustomers = countCheckResponse.total || 0

        // Early return if over limit - no additional DB operations
        if (totalCustomers > CUSTOMER_LIMIT) {
          await generateCsvExportTask.trigger(
            {
              userId,
              organizationId,
              filters,
              searchQuery,
            },
            {
              idempotencyKey: await createTriggerIdempotencyKey(
                `generate-csv-export-${organizationId}-${userId}-${Date.now()}`
              ),
            }
          )

          return {
            totalCustomers,
            asyncExportStarted: true,
          }
        }
        const focusedMembership =
          await selectFocusedMembershipAndOrganization(
            userId,
            transaction
          )

        if (!focusedMembership) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No focused membership found',
          })
        }

        // Start with the first page we already fetched
        const rows = [...countCheckResponse.items]

        let pageAfter = countCheckResponse.endCursor

        // Continue fetching remaining pages if there are more
        while (countCheckResponse.hasNextPage && pageAfter) {
          const response =
            await selectCustomersCursorPaginatedWithTableRowData({
              input: {
                pageAfter,
                pageSize: PAGE_SIZE,
                filters,
                searchQuery,
              },
              transaction,
            })

          rows.push(...response.items)

          if (!response.hasNextPage || !response.endCursor) {
            break
          }

          pageAfter = response.endCursor
        }

        const { csv, filename } = createCustomersCsv(
          rows,
          focusedMembership.organization.defaultCurrency
        )

        return {
          csv,
          filename,
          totalCustomers,
          asyncExportStarted: false,
        }
      }
    )
  )

export const customersRouter = router({
  create: createCustomerProcedure,
  /**
   * Forward/backward compatibility with the old update endpoint
   */
  update: updateCustomer,
  getBilling: getCustomerBilling,
  get: getCustomer,
  internal__getById: getCustomerById,
  list: listCustomersProcedure,
  getTableRows: getTableRowsProcedure,
  exportCsv: exportCsvProcedure,
})
