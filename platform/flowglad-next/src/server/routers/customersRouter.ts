import { router } from '../trpc'
import { protectedProcedure } from '@/server/trpc'
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
  updateCustomer,
  selectCustomersCursorPaginatedWithTableRowData,
} from '@/db/tableMethods/customerMethods'
import {
  customerClientSelectSchema,
  editCustomerOutputSchema,
  editCustomerInputSchema,
  customersPaginatedSelectSchema,
  customersPaginatedListSchema,
  customersPaginatedTableRowOutputSchema,
  customersPaginatedTableRowInputSchema,
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

const { openApiMetas } = generateOpenApiMetas({
  resource: 'customer',
  tags: ['Customer'],
  idParamOverride: 'externalId',
})

export const customersRouteConfigs: Record<string, RouteConfig> = {
  ...trpcToRest('customers.create', {
    routeParams: ['externalId'],
  }),
  ...trpcToRest('customers.edit', {
    routeParams: ['externalId'],
  }),
  ...trpcToRest('customers.get', {
    routeParams: ['externalId'],
  }),
  'GET /customers/:externalId/billing': {
    procedure: 'customers.getBilling',
    pattern: new RegExp(`^customers\/([^\\/]+)\/billing$`),
    mapParams: (matches) => ({
      externalId: matches[0],
    }),
  },
  ...trpcToRest('customers.list', {
    routeParams: [],
  }),
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
        if (!organizationId) {
          throw new Error('organizationId is required')
        }

        const { customer } = input
        /**
         * We have to parse the customer record here because of the billingAddress json
         */
        const createdCustomerOutput = await createCustomerBookkeeping(
          {
            customer: {
              ...customer,
              organizationId,
              livemode: ctx.livemode,
            },
          },
          { transaction, userId, livemode, organizationId }
        )

        if (ctx.path) {
          await revalidatePath(ctx.path)
        }
        const subscription = createdCustomerOutput.result.subscription ? subscriptionWithCurrent(createdCustomerOutput.result.subscription) : undefined
        return {
          result: {
            data: {
              customer: createdCustomerOutput.result.customer,
              subscription,
              subscriptionItems: createdCustomerOutput.result.subscriptionItems,
            }
          },
          eventsToLog: createdCustomerOutput.eventsToLog,
          ledgerCommand: createdCustomerOutput.ledgerCommand,
        }
      }
    )
  )

export const editCustomer = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editCustomerInputSchema)
  .output(editCustomerOutputSchema)
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const { customer } = input

        const updatedCustomer = await updateCustomer(
          customer,
          transaction
        )
        return {
          customer: updatedCustomer,
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
        const customer = await selectCustomerById(
          input.id,
          transaction
        )
        return { customer }
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

export const customersRouter = router({
  create: createCustomerProcedure,
  edit: editCustomer,
  getBilling: getCustomerBilling,
  get: getCustomer,
  internal__getById: getCustomerById,
  list: listCustomersProcedure,
  getTableRows: getTableRowsProcedure,
})
