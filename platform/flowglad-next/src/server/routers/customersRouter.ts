import { router } from '../trpc'
import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { z } from 'zod'
import {
  selectCustomerById,
  selectCustomers,
  selectCustomersPaginated,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import {
  customerClientSelectSchema,
  editCustomerOutputSchema,
  editCustomerInputSchema,
  customersPaginatedSelectSchema,
  customersPaginatedListSchema,
} from '@/db/schema/customers'
import { TRPCError } from '@trpc/server'
import * as R from 'ramda'
import { createOrUpdateCustomer as createCustomerBookkeeping } from '@/utils/bookkeeping'
import { revalidatePath } from 'next/cache'
import {
  createCustomerInputSchema,
  selectPurchases,
} from '@/db/tableMethods/purchaseMethods'
import {
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
import { catalogWithProductsAndUsageMetersSchema } from '@/db/schema/prices'
import { richSubscriptionClientSelectSchema } from '@/subscriptions/schemas'
import { selectRichSubscriptions } from '@/db/tableMethods/subscriptionItemMethods'
import { paymentMethodClientSelectSchema } from '@/db/schema/paymentMethods'
import { selectPaymentMethods } from '@/db/tableMethods/paymentMethodMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import {
  isSubscriptionCurrent,
  subscriptionWithCurrent,
} from '@/db/tableMethods/subscriptionMethods'
import { invoiceWithLineItemsClientSchema } from '@/db/schema/invoiceLineItems'
import { selectCatalogForCustomer } from '@/db/tableMethods/catalogMethods'

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
  .mutation(async ({ input, ctx }) => {
    const organizationId = ctx.organizationId
    if (!organizationId) {
      throw new Error('organizationId is required')
    }
    return authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        const { customer } = input
        /**
         * We have to parse the customer record here because of the billingAddress json
         */
        const createdCustomer = await createCustomerBookkeeping(
          {
            customer: {
              ...customer,
              organizationId,
              livemode: ctx.livemode,
            },
          },
          { transaction, userId, livemode }
        )

        if (ctx.path) {
          await revalidatePath(ctx.path)
        }

        return {
          data: {
            customer: createdCustomer.customer,
          },
        }
      },
      {
        apiKey: R.propOr(undefined, 'apiKey', ctx),
      }
    )
  })

export const editCustomer = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editCustomerInputSchema)
  .output(editCustomerOutputSchema)
  .mutation(async ({ input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      const { customer } = input

      const updatedCustomer = await updateCustomer(
        customer,
        transaction
      )
      return {
        customer: updatedCustomer,
      }
    })
  })

export const getCustomerById = protectedProcedure
  .input(z.object({ id: z.string() }))
  .output(z.object({ customer: customerClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      const customer = await selectCustomerById(input.id, transaction)
      return { customer }
    })
  })

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
      catalog: catalogWithProductsAndUsageMetersSchema,
    })
  )
  .query(async ({ input, ctx }) => {
    const organizationId = ctx.organizationId
    if (!organizationId) {
      throw new Error('organizationId is required')
    }
    const {
      customer,
      catalog,
      invoices,
      paymentMethods,
      currentSubscriptions,
      purchases,
      subscriptions,
    } = await authenticatedTransaction(
      async ({ transaction }) => {
        const [customer] = await selectCustomers(
          { ...input, organizationId },
          transaction
        )
        const subscriptions = await selectRichSubscriptions(
          { customerId: customer.id },
          transaction
        )
        const catalog = await selectCatalogForCustomer(
          customer,
          transaction
        )
        const invoices =
          await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
            { customerId: customer.id },
            transaction
          )
        const paymentMethods = await selectPaymentMethods(
          { customerId: customer.id },
          transaction
        )
        const purchases = await selectPurchases(
          { customerId: customer.id },
          transaction
        )
        const currentSubscriptions = subscriptions.filter((item) => {
          return isSubscriptionCurrent(item.status)
        })
        return {
          customer,
          purchases,
          invoices,
          paymentMethods,
          catalog,
          subscriptions: subscriptions.map(subscriptionWithCurrent),
          currentSubscriptions: currentSubscriptions.map(
            subscriptionWithCurrent
          ),
        }
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
      catalog,
    }
  })

const listCustomersProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(customersPaginatedSelectSchema)
  .output(customersPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      return selectCustomersPaginated(input, transaction)
    })
  })

export const customersRouter = router({
  create: createCustomerProcedure,
  edit: editCustomer,
  getBilling: getCustomerBilling,
  get: getCustomer,
  internal__getById: getCustomerById,
  list: listCustomersProcedure,
})
