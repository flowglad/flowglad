import { z } from 'zod'
import { protectedProcedure, router } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import {
  insertCheckoutSession,
  selectCheckoutSessionById,
  selectCheckoutSessions,
  selectCheckoutSessionsPaginated,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { CheckoutSessionStatus, CheckoutSessionType } from '@/types'
import { PriceType } from '@/types'
import { TRPCError } from '@trpc/server'
import {
  editCheckoutSessionInputSchema,
  CheckoutSession,
  checkoutSessionClientSelectSchema,
  checkoutSessionsPaginatedListSchema,
  checkoutSessionsPaginatedSelectSchema,
} from '@/db/schema/checkoutSessions'
import { generateOpenApiMetas } from '@/utils/openapi'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import {
  createPaymentIntentForCheckoutSession,
  createSetupIntentForCheckoutSession,
} from '@/utils/stripe'
import { Customer } from '@/db/schema/customers'
import { Organization } from '@/db/schema/organizations'
import { Price } from '@/db/schema/prices'
import { Product } from '@/db/schema/products'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'checkoutSession',
  pluralResource: 'checkoutSessions',
  tags: ['Checkout Sessions', 'Purchases'],
})

export const checkoutSessionsRouteConfigs = routeConfigs

const coreCheckoutSessionSchema = z.object({
  customerExternalId: z
    .string()
    .describe(
      'The id of the Customer for this purchase session, as defined in your system'
    ),
  successUrl: z
    .string()
    .describe(
      'The URL to redirect to after the purchase is successful'
    ),
  cancelUrl: z
    .string()
    .describe(
      'The URL to redirect to after the purchase is cancelled or fails'
    ),
  outputMetadata: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      'Metadata that will get added to the purchase or subscription created when this checkout session succeeds. Ignored if the checkout session is of type `invoice`.'
    ),
  outputName: z
    .string()
    .optional()
    .describe(
      'The name of the purchase or subscription created when this checkout session succeeds. Ignored if the checkout session is of type `invoice`.'
    ),
})

const productCheckoutSessionSchema = coreCheckoutSessionSchema.extend(
  {
    type: z.literal(CheckoutSessionType.Product),
    priceId: z
      .string()
      .describe('The ID of the price the customer shall purchase'),
    quantity: z
      .number()
      .optional()
      .describe(
        'The quantity of the purchase or subscription created when this checkout session succeeds. Ignored if the checkout session is of type `invoice`.'
      ),
  }
)

const addPaymentMethodCheckoutSessionSchema =
  coreCheckoutSessionSchema.extend({
    type: z.literal(CheckoutSessionType.AddPaymentMethod),
    targetSubscriptionId: z
      .string()
      .describe(
        'The id of the subscription that the payment method will be added to as the default payment method.'
      ),
  })

const createCheckoutSessionObject = z.discriminatedUnion('type', [
  productCheckoutSessionSchema,
  addPaymentMethodCheckoutSessionSchema,
])

const singleCheckoutSessionOutputSchema = z.object({
  checkoutSession: checkoutSessionClientSelectSchema,
  url: z
    .string()
    .describe('The URL to redirect to complete the purchase'),
})

const createCheckoutSessionSchema = z
  .object({
    checkoutSession: createCheckoutSessionObject,
  })
  .describe('Use this schema for new checkout sessions.')

type CreateCheckoutSessionInput = z.infer<
  typeof createCheckoutSessionSchema
>

const checkoutSessionInsertFromInput = ({
  checkoutSessionInput,
  customer,
  organizationId,
  livemode,
}: {
  checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession']
  customer: Customer.Record
  organizationId: string
  livemode: boolean
}): CheckoutSession.Insert => {
  const coreFields = {
    customerId: customer.id,
    organizationId,
    customerEmail: customer.email,
    customerName: customer.name,
    status: CheckoutSessionStatus.Open,
    livemode,
    successUrl: checkoutSessionInput.successUrl,
    cancelUrl: checkoutSessionInput.cancelUrl,
    outputMetadata: checkoutSessionInput.outputMetadata,
    outputName: checkoutSessionInput.outputName,
  }
  if (checkoutSessionInput.type === CheckoutSessionType.Product) {
    return {
      ...coreFields,
      type: CheckoutSessionType.Product,
      invoiceId: null,
      priceId: checkoutSessionInput.priceId,
      targetSubscriptionId: null,
    }
  } else if (
    checkoutSessionInput.type === CheckoutSessionType.AddPaymentMethod
  ) {
    return {
      ...coreFields,
      type: CheckoutSessionType.AddPaymentMethod,
      targetSubscriptionId: checkoutSessionInput.targetSubscriptionId,
    }
  }
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `Invalid checkout session`,
  })
}

export const createCheckoutSession = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createCheckoutSessionSchema)
  .output(singleCheckoutSessionOutputSchema)
  .mutation(async ({ input, ctx }) => {
    const { checkoutSession: checkoutSessionInput } = input
    const checkoutSessionType = checkoutSessionInput.type
    if (
      checkoutSessionType !== CheckoutSessionType.Product &&
      checkoutSessionType !== CheckoutSessionType.AddPaymentMethod
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Invalid checkout session type: ${checkoutSessionType}. Currently only ${CheckoutSessionType.Product} and ${CheckoutSessionType.AddPaymentMethod} are supported.`,
      })
    }
    return authenticatedTransaction(
      async ({ transaction, livemode }) => {
        const organizationId = ctx.organizationId
        if (!organizationId) {
          throw new Error('organizationId is required')
        }
        const [customer] = await selectCustomers(
          {
            externalId: checkoutSessionInput.customerExternalId,
          },
          transaction
        )
        if (!customer) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Customer not found for externalId: ${checkoutSessionInput.customerExternalId}`,
          })
        }
        // NOTE: invoice and purchase checkout sessions
        // are not supported by API yet.
        const checkoutSession = await insertCheckoutSession(
          checkoutSessionInsertFromInput({
            checkoutSessionInput,
            customer,
            organizationId,
            livemode,
          }),
          transaction
        )
        let price: Price.Record | null = null
        let product: Product.Record | null = null
        let organization: Organization.Record | null = null
        if (checkoutSession.type === CheckoutSessionType.Product) {
          const [result] =
            await selectPriceProductAndOrganizationByPriceWhere(
              { id: checkoutSession.priceId },
              transaction
            )
          price = result.price
          product = result.product
          organization = result.organization
        } else {
          organization = await selectOrganizationById(
            checkoutSession.organizationId,
            transaction
          )
        }

        let stripeSetupIntentId: string | null = null
        let stripePaymentIntentId: string | null = null
        if (
          price?.type === PriceType.Subscription ||
          price?.type === PriceType.Usage ||
          checkoutSession.type ===
            CheckoutSessionType.AddPaymentMethod
        ) {
          const stripeSetupIntent =
            await createSetupIntentForCheckoutSession({
              organization,
              checkoutSession,
              customer,
            })
          stripeSetupIntentId = stripeSetupIntent.id
        } else if (
          price?.type === PriceType.SinglePayment &&
          product
        ) {
          const stripePaymentIntent =
            await createPaymentIntentForCheckoutSession({
              price,
              product,
              organization,
              checkoutSession,
            })
          stripePaymentIntentId = stripePaymentIntent.id
        }
        const updatedCheckoutSession = await updateCheckoutSession(
          {
            ...checkoutSession,
            stripeSetupIntentId,
            stripePaymentIntentId,
          },
          transaction
        )
        const url =
          checkoutSession.type ===
          CheckoutSessionType.AddPaymentMethod
            ? `${process.env.NEXT_PUBLIC_APP_URL}/add-payment-method/${checkoutSession.id}`
            : `${process.env.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`
        return {
          checkoutSession: updatedCheckoutSession,
          url,
        }
      },
      { apiKey: ctx.apiKey }
    )
  })

export const editCheckoutSession = protectedProcedure
  //   .meta(openApiMetas.PUT)
  .input(editCheckoutSessionInputSchema)
  .output(singleCheckoutSessionOutputSchema)
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const organizationId = ctx.organizationId
        if (!organizationId) {
          throw new Error('organizationId is required')
        }
        const [checkoutSession] = await selectCheckoutSessions(
          {
            id: input.checkoutSession.id,
          },
          transaction
        )
        if (!checkoutSession) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Purchase session not found for id: ${input.checkoutSession.id}`,
          })
        }

        if (checkoutSession.status !== CheckoutSessionStatus.Open) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Purchase session ${input.checkoutSession.id} is in status ${checkoutSession.status}. Purchase sessions can only be edited while in status ${CheckoutSessionStatus.Open}.`,
          })
        }

        const updatedCheckoutSession = await updateCheckoutSession(
          {
            ...checkoutSession,
            ...input.checkoutSession,
          } as CheckoutSession.Update,
          transaction
        )
        if (!updatedCheckoutSession) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to update purchase session for id: ${input.checkoutSession.id}`,
          })
        }
        return {
          checkoutSession: updatedCheckoutSession,
          url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/${updatedCheckoutSession.id}`,
        }
      },
      { apiKey: ctx.apiKey }
    )
  })

const getCheckoutSessionProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(z.object({ id: z.string() }))
  .output(singleCheckoutSessionOutputSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const checkoutSession = await selectCheckoutSessionById(
          input.id,
          transaction
        )
        return {
          checkoutSession,
          url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const listCheckoutSessionsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(checkoutSessionsPaginatedSelectSchema)
  .output(checkoutSessionsPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectCheckoutSessionsPaginated(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const checkoutSessionsRouter = router({
  create: createCheckoutSession,
  edit: editCheckoutSession,
  get: getCheckoutSessionProcedure,
  list: listCheckoutSessionsProcedure,
})
