import {
  customerClientSelectSchema,
  customersPaginatedListSchema,
  customersPaginatedSelectSchema,
  customersPaginatedTableRowInputSchema,
  customersPaginatedTableRowOutputSchema,
  editCustomerInputSchema,
  editCustomerOutputSchema,
} from '@db-core/schema/customers'

import { invoiceWithLineItemsClientSchema } from '@db-core/schema/invoiceLineItems'
import { paymentMethodClientSelectSchema } from '@db-core/schema/paymentMethods'
import { pricingModelWithProductsAndUsageMetersSchema } from '@db-core/schema/prices'
import {
  type CreateCustomerOutputSchema,
  createCustomerOutputSchema,
  purchaseClientSelectSchema,
} from '@db-core/schema/purchases'
import { subscriptionClientSelectSchema } from '@db-core/schema/subscriptions'
import { usageMeterBalanceClientSelectSchema } from '@db-core/schema/usageMeters'
import { externalIdInputSchema } from '@db-core/tableUtils'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  selectCustomerByExternalIdAndOrganizationId,
  selectCustomerById,
  selectCustomersCursorPaginatedWithTableRowData,
  selectCustomersPaginated,
  updateCustomer as updateCustomerDb,
} from '@/db/tableMethods/customerMethods'
import { selectUsageMeterBalancesForSubscriptions } from '@/db/tableMethods/ledgerEntryMethods'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'
import {
  selectPricingModelById,
  selectPricingModelForCustomer,
} from '@/db/tableMethods/pricingModelMethods'
import { createCustomerInputSchema } from '@/db/tableMethods/purchaseMethods'
import {
  isSubscriptionCurrent,
  selectActiveSubscriptionsForCustomer,
  selectSubscriptionById,
  selectSubscriptionsByCustomerId,
  subscriptionWithCurrent,
} from '@/db/tableMethods/subscriptionMethods'
import { protectedProcedure } from '@/server/trpc'
import { cancelSubscriptionImmediately } from '@/subscriptions/cancelSubscription'
import { migrateCustomerPricingModelProcedureTransaction } from '@/subscriptions/migratePricingModel'
import { richSubscriptionClientSelectSchema } from '@/subscriptions/schemas'
import { generateCsvExportTask } from '@/trigger/exports/generate-csv-export'
import { createTriggerIdempotencyKey } from '@/utils/backendCore'
import { createCustomerBookkeeping } from '@/utils/bookkeeping'
import { customerBillingTransaction } from '@/utils/bookkeeping/customerBilling'
import { CacheDependency } from '@/utils/cache'
import { organizationBillingPortalURL } from '@/utils/core'
import { createCustomersCsv } from '@/utils/csv-export'
import {
  createGetOpenApiMeta,
  createPostOpenApiMetaWithIdParam,
  generateOpenApiMetas,
  type RouteConfig,
  trpcToRest,
} from '@/utils/openapi'
import { unwrapOrThrow } from '@/utils/resultHelpers'
import { tracedTrigger } from '@/utils/triggerTracing'
import { router } from '../trpc'
import { errorHandlers } from '../trpcErrorHandler'

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
      pattern: /^customers\/([^\\/]+)\/billing$/,
      mapParams: (matches) => {
        return {
          externalId: matches[0],
        }
      },
    },
  }

export const customerUsageBalancesRouteConfig: Record<
  string,
  RouteConfig
> = {
  'GET /customers/:externalId/usage-balances': {
    procedure: 'customers.getUsageBalances',
    pattern: /^customers\/([^\\/]+)\/usage-balances$/,
    mapParams: (matches) => {
      return {
        externalId: matches[0],
      }
    },
  },
}

export const customerArchiveRouteConfig: Record<string, RouteConfig> =
  {
    'POST /customers/:externalId/archive': {
      procedure: 'customers.archive',
      pattern: /^customers\/([^\\/]+)\/archive$/,
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
        ctx,
        transactionCtx,
      }): Promise<Result<CreateCustomerOutputSchema, Error>> => {
        const { transaction } = transactionCtx
        const { livemode, organizationId } = ctx
        try {
          if (!organizationId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'organizationId is required',
            })
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
              {
                transaction,
                cacheRecomputationContext:
                  transactionCtx.cacheRecomputationContext,
                livemode,
                organizationId,
                invalidateCache: transactionCtx.invalidateCache,
                emitEvent: transactionCtx.emitEvent,
                enqueueLedgerCommand:
                  transactionCtx.enqueueLedgerCommand,
              }
            )

          if (ctx.path) {
            await revalidatePath(ctx.path)
          }

          const {
            customer: createdCustomer,
            subscription,
            subscriptionItems,
          } = createdCustomerOutput
          return Result.ok({
            data: {
              customer: createdCustomer,
              subscription: subscription
                ? subscriptionWithCurrent(subscription)
                : undefined,
              subscriptionItems,
            },
          })
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
      async ({ input, ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        const { organizationId } = ctx
        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'organizationId is required',
          })
        }
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
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        try {
          const customer = (
            await selectCustomerById(input.id, transaction)
          ).unwrap()
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

export const getPricingModelForCustomer = protectedProcedure
  .input(z.object({ customerId: z.string() }))
  .output(
    z.object({
      pricingModel: pricingModelWithProductsAndUsageMetersSchema,
    })
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        try {
          const customer = (
            await selectCustomerById(input.customerId, transaction)
          ).unwrap()
          const pricingModel = await selectPricingModelForCustomer(
            customer,
            transaction
          )
          return { pricingModel }
        } catch (error) {
          errorHandlers.customer.handle(error, {
            operation: 'getPricingModel',
            id: input.customerId,
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

    const customerResult = await authenticatedTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectCustomerByExternalIdAndOrganizationId(
            { externalId: input.externalId, organizationId },
            transaction
          )
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )

    const customer = unwrapOrThrow(customerResult)

    if (!customer) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Customer with externalId ${input.externalId} not found`,
      })
    }

    return { customer }
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
      currentSubscription: richSubscriptionClientSelectSchema
        .optional()
        .describe(
          'The most recently created current subscription for the customer. If createdAt timestamps tie, the most recently updated subscription will be returned. If updatedAt also ties, subscription id is used as the final tiebreaker.'
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
      currentSubscription,
      purchases,
      subscriptions,
    } = unwrapOrThrow(
      await authenticatedTransaction(
        async ({ transaction, cacheRecomputationContext }) => {
          return Result.ok(
            await customerBillingTransaction(
              {
                externalId: input.externalId,
                organizationId,
              },
              transaction,
              cacheRecomputationContext
            )
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    )
    return {
      customer,
      invoices,
      paymentMethods,
      currentSubscriptions: currentSubscriptions.map((item) =>
        richSubscriptionClientSelectSchema.parse(item)
      ),
      currentSubscription: currentSubscription
        ? richSubscriptionClientSelectSchema.parse(
            currentSubscription
          )
        : undefined,
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

const getUsageBalancesInputSchema = z.object({
  externalId: z.string().describe('The external ID of the customer'),
  subscriptionId: z
    .string()
    .optional()
    .describe(
      'Optional subscription ID to filter balances. If provided, returns balances only for the specified subscription (regardless of its status). If not provided, returns balances for all current subscriptions (active, past_due, trialing, cancellation_scheduled, unpaid, or credit_trial), excluding canceled or upgraded subscriptions.'
    ),
})

/**
 * Get usage meter balances for a customer.
 * By default, returns balances for current subscriptions only.
 * Optionally filter by a specific subscriptionId.
 */
export const getCustomerUsageBalances = protectedProcedure
  .meta(
    createGetOpenApiMeta({
      resource: 'customers',
      routeSuffix: 'usage-balances',
      summary: 'Get Usage Balances',
      tags: ['Customer', 'Usage Meters'],
      idParamOverride: 'externalId',
    })
  )
  .input(getUsageBalancesInputSchema)
  .output(
    z.object({
      usageMeterBalances: usageMeterBalanceClientSelectSchema.array(),
    })
  )
  .query(async ({ input, ctx }) => {
    const organizationId = ctx.organizationId
    if (!organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'organizationId is required',
      })
    }

    return unwrapOrThrow(
      await authenticatedTransaction(
        async ({ transaction }) => {
          // Resolve customer by externalId and organizationId
          const customer =
            await selectCustomerByExternalIdAndOrganizationId(
              {
                externalId: input.externalId,
                organizationId,
              },
              transaction
            )

          if (!customer) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Customer with externalId ${input.externalId} not found`,
            })
          }

          // Get all subscriptions for this customer
          const subscriptions = await selectSubscriptionsByCustomerId(
            customer.id,
            customer.livemode,
            transaction
          )

          let subscriptionIds: string[]

          if (input.subscriptionId) {
            // Validate that the subscription belongs to this customer
            const subscription = subscriptions.find(
              (s) => s.id === input.subscriptionId
            )

            if (!subscription) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: `Subscription with id ${input.subscriptionId} not found for customer ${input.externalId}`,
              })
            }

            subscriptionIds = [input.subscriptionId]
          } else {
            // Filter to current subscriptions only (aligning with billing's currentSubscriptions)
            const currentSubscriptions = subscriptions.filter((s) =>
              isSubscriptionCurrent(s.status, s.cancellationReason)
            )

            subscriptionIds = currentSubscriptions.map((s) => s.id)
          }

          if (subscriptionIds.length === 0) {
            return Result.ok({ usageMeterBalances: [] })
          }

          // Fetch usage meter balances for the subscriptions
          const balances =
            await selectUsageMeterBalancesForSubscriptions(
              { subscriptionId: subscriptionIds },
              transaction
            )

          return Result.ok({
            usageMeterBalances: balances.map(
              (b) => b.usageMeterBalance
            ),
          })
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    )
  })

const listCustomersProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(customersPaginatedSelectSchema)
  .output(customersPaginatedListSchema)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectCustomersPaginated(input, transaction)
      }
    )
  )

const getTableRowsProcedure = protectedProcedure
  .input(customersPaginatedTableRowInputSchema)
  .output(customersPaginatedTableRowOutputSchema)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectCustomersCursorPaginatedWithTableRowData({
          input,
          transaction,
        })
      }
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
      async ({ input, ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        const { livemode, organizationId } = ctx
        const userId = ctx.user?.id
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
          await tracedTrigger(
            'generateCsvExport',
            async () =>
              generateCsvExportTask.trigger(
                {
                  userId,
                  organizationId,
                  filters,
                  searchQuery,
                  livemode,
                },
                {
                  // biome-ignore lint/plugin: CSV exports are intentionally non-idempotent - each request generates a new export
                  idempotencyKey: await createTriggerIdempotencyKey(
                    `generate-csv-export-${organizationId}-${userId}-${Date.now()}`
                  ),
                }
              ),
            {
              'trigger.organization_id': organizationId,
              'trigger.livemode': livemode,
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

const migrateCustomerPricingModelProcedure = protectedProcedure
  .input(
    z.object({
      externalId: z.string(),
      newPricingModelId: z.string(),
    })
  )
  .output(
    z.object({
      customer: customerClientSelectSchema,
      canceledSubscriptions: z.array(subscriptionClientSelectSchema),
      newSubscription: subscriptionClientSelectSchema,
    })
  )
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      migrateCustomerPricingModelProcedureTransaction
    )
  )

const archiveCustomerInputSchema = z.object({
  externalId: z
    .string()
    .describe(
      'The external ID of the customer to archive, as defined in your application'
    ),
})

const archiveCustomerOutputSchema = z.object({
  customer: customerClientSelectSchema,
})

/**
 * Archives a customer by setting archived=true and canceling all active subscriptions.
 *
 * This is a dedicated endpoint for archiving customers because archiving is a significant
 * state change with cascade effects (subscription cancellation), not just a field update.
 *
 * Behavior:
 * - Fetches the customer (includes archived customers for idempotency)
 * - If customer is already archived, returns immediately (idempotent)
 * - Cancels all active subscriptions with reason 'customer_archived'
 * - Sets archived=true on the customer
 *
 * After archiving:
 * - The customer's externalId is freed for reuse by a new customer (via partial unique index)
 * - ExternalId lookups will not return this customer by default
 * - Operations that create records attached to this customer will be blocked
 */
const archiveCustomerProcedure = protectedProcedure
  .meta(
    createPostOpenApiMetaWithIdParam({
      resource: 'customers',
      routeSuffix: 'archive',
      summary: 'Archive Customer',
      tags: ['Customer'],
      idParamOverride: 'externalId',
      description:
        'Archives a customer, canceling all active subscriptions and freeing the externalId for reuse.',
    })
  )
  .input(archiveCustomerInputSchema)
  .output(archiveCustomerOutputSchema)
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const {
          transaction,
          invalidateCache,
          emitEvent,
          cacheRecomputationContext,
          enqueueLedgerCommand,
        } = transactionCtx
        const { organizationId } = ctx

        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'organizationId is required',
          })
        }

        // 1. Fetch customer (include archived for idempotency)
        const customer =
          await selectCustomerByExternalIdAndOrganizationId(
            {
              externalId: input.externalId,
              organizationId,
              includeArchived: true,
            },
            transaction
          )

        if (!customer) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Customer with externalId ${input.externalId} not found`,
          })
        }

        // 2. Idempotent - already archived
        if (customer.archived) {
          return Result.ok({ customer })
        }

        // 3. Cancel all active subscriptions
        const activeSubscriptions =
          await selectActiveSubscriptionsForCustomer(
            customer.id,
            transaction
          )

        for (const subscription of activeSubscriptions) {
          const cancelResult = await cancelSubscriptionImmediately(
            {
              subscription,
              customer,
              skipNotifications: true,
              skipReassignDefaultSubscription: true,
              cancellationReason: 'customer_archived',
            },
            {
              transaction,
              invalidateCache,
              emitEvent,
              cacheRecomputationContext,
              enqueueLedgerCommand,
            }
          )

          if (Result.isError(cancelResult)) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Failed to cancel subscription ${subscription.id}: ${cancelResult.error.message}`,
            })
          }
        }

        // 4. Set archived = true
        const archivedCustomer = await updateCustomerDb(
          { id: customer.id, archived: true },
          transaction
        )

        // 5. Invalidate customer subscriptions cache
        // This ensures cached billing data reflects the archived status.
        // While cancelSubscriptionImmediately also invalidates this cache for each
        // canceled subscription, this explicit call handles edge cases where
        // the customer has no active subscriptions.
        invalidateCache(
          CacheDependency.customerSubscriptions(customer.id)
        )

        return Result.ok({ customer: archivedCustomer })
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
  getUsageBalances: getCustomerUsageBalances,
  get: getCustomer,
  internal__getById: getCustomerById,
  getPricingModelForCustomer: getPricingModelForCustomer,
  list: listCustomersProcedure,
  getTableRows: getTableRowsProcedure,
  exportCsv: exportCsvProcedure,
  migratePricingModel: migrateCustomerPricingModelProcedure,
  archive: archiveCustomerProcedure,
})
