import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { selectPurchases } from '@/db/tableMethods/purchaseMethods'
import { selectRichSubscriptionsAndActiveItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  safelyUpdatePaymentMethod,
  selectPaymentMethodById,
  selectPaymentMethods,
} from '@/db/tableMethods/paymentMethodMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import {
  isSubscriptionCurrent,
  safelyUpdateSubscriptionsForCustomerToNewPaymentMethod,
  subscriptionWithCurrent,
} from '@/db/tableMethods/subscriptionMethods'
import { selectPricingModelForCustomer } from '@/db/tableMethods/pricingModelMethods'
import { CheckoutSessionType, InvoiceStatus } from '@/types'
import { DbTransaction } from '@/db/types'
import { Customer } from '@/db/schema/customers'
import { TRPCError } from '@trpc/server'
import {
  activateSubscriptionCheckoutSessionSchema,
  CreateCheckoutSessionInput,
  productCheckoutSessionSchema,
} from '@/db/schema/checkoutSessions'
import { Price } from '@/db/schema/prices'
import { createCheckoutSessionTransaction } from './createCheckoutSession'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { adminTransaction } from '@/db/adminTransaction'
import { customerBillingPortalURL } from '@/utils/core'
import { z } from 'zod'

export const customerBillingTransaction = async (
  params: {
    externalId: string
    organizationId: string
  },
  transaction: DbTransaction
) => {
  const [customer] = await selectCustomers(params, transaction)
  const subscriptions = await selectRichSubscriptionsAndActiveItems(
    { customerId: customer.id },
    transaction
  )
  const pricingModel = await selectPricingModelForCustomer(
    customer,
    transaction
  )
  const customerFacingInvoiceStatuses: InvoiceStatus[] = [
    InvoiceStatus.AwaitingPaymentConfirmation,
    InvoiceStatus.Paid,
    InvoiceStatus.PartiallyRefunded,
    InvoiceStatus.Open,
    InvoiceStatus.FullyRefunded,
  ]
  const invoices =
    await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
      {
        customerId: customer.id,
        status: customerFacingInvoiceStatuses,
      },
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
    return isSubscriptionCurrent(item.status, item.cancellationReason)
  })
  return {
    customer,
    purchases,
    invoices,
    paymentMethods,
    pricingModel,
    subscriptions,
    currentSubscriptions,
  }
}

export const setDefaultPaymentMethodForCustomer = async (
  { paymentMethodId }: { paymentMethodId: string },
  transaction: DbTransaction
) => {
  // Verify the payment method belongs to the customer
  const paymentMethod = await selectPaymentMethodById(
    paymentMethodId,
    transaction
  )

  // Check if already default
  if (paymentMethod.default) {
    await safelyUpdateSubscriptionsForCustomerToNewPaymentMethod(
      paymentMethod,
      transaction
    )
    return {
      success: true,
      paymentMethod,
    }
  }

  try {
    // Update in database (safelyUpdatePaymentMethod handles setting others to non-default)
    const updatedPaymentMethod = await safelyUpdatePaymentMethod(
      {
        id: paymentMethodId,
        default: true,
      },
      transaction
    )
    await safelyUpdateSubscriptionsForCustomerToNewPaymentMethod(
      updatedPaymentMethod,
      transaction
    )
    return {
      success: true,
      paymentMethod: updatedPaymentMethod,
    }
  } catch (error) {
    console.error('Error setting default payment method:', error)
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to set default payment method',
    })
  }
}

// Build a no-URL core and variant-level schemas, since .omit is not available on discriminated unions
const coreCheckoutSessionNoUrls = z.object({
  customerExternalId: z.string().nullable().optional(),
  outputMetadata: z.record(z.string(), z.any()).optional(),
  outputName: z.string().optional(),
})

const productCheckoutSessionSchemaNoUrls = z.discriminatedUnion('anonymous', [
  coreCheckoutSessionNoUrls.extend({
    type: z.literal(CheckoutSessionType.Product),
    priceId: z.string(),
    quantity: z.number().optional(),
    anonymous: z.literal(false).optional(),
    // Ensure a concrete customerExternalId when not anonymous
    customerExternalId: z.string(),
    preserveBillingCycleAnchor: z.boolean().optional(),
  }),
  coreCheckoutSessionNoUrls.extend({
    type: z.literal(CheckoutSessionType.Product),
    priceId: z.string(),
    quantity: z.number().optional(),
    anonymous: z.literal(true),
    // Anonymous sessions may omit or null customerExternalId
    customerExternalId: z.null().optional(),
    preserveBillingCycleAnchor: z.boolean().optional(),
  }),
])

const activateSubscriptionCheckoutSessionSchemaNoUrls =
  coreCheckoutSessionNoUrls.extend({
    type: z.literal(CheckoutSessionType.ActivateSubscription),
    priceId: z.string(),
    targetSubscriptionId: z.string(),
    preserveBillingCycleAnchor: z.boolean().optional(),
    // Require customerExternalId for activate flow
    customerExternalId: z.string(),
  })

export const createPricedCheckoutSessionSchema = z.discriminatedUnion(
  'type',
  [
    productCheckoutSessionSchemaNoUrls,
    activateSubscriptionCheckoutSessionSchemaNoUrls,
  ]
)

export const customerBillingCreatePricedCheckoutSession = async ({
  checkoutSessionInput: rawCheckoutSessionInput,
  customer,
}: {
  checkoutSessionInput: z.infer<
    typeof createPricedCheckoutSessionSchema
  >
  customer: Customer.Record
}) => {
  const checkoutSessionInputResult =
    createPricedCheckoutSessionSchema.safeParse(
      rawCheckoutSessionInput
    )
  if (!checkoutSessionInputResult.success) {
    if (
      checkoutSessionInputResult.error.issues[0].code ===
      'invalid_union'
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Invalid checkout session type. Only product and activate_subscription checkout sessions are supported. Received type: ' +
          rawCheckoutSessionInput.type,
      })
    }
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Invalid checkout session input provided: ' +
        JSON.stringify(checkoutSessionInputResult.error.issues),
    })
  }
  const checkoutSessionInput = checkoutSessionInputResult.data
  if (
    customer.externalId !== checkoutSessionInput.customerExternalId
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'You do not have permission to create a checkout session for this customer',
    })
  }
  if (
    checkoutSessionInput.type !== CheckoutSessionType.Product &&
    checkoutSessionInput.type !==
      CheckoutSessionType.ActivateSubscription
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Invalid checkout session type. Only product and activate_subscription checkout sessions are supported. Received type: ' +
        // @ts-expect-error - this is a type error because it should never be hit
        checkoutSessionInput.type,
    })
  }

  const price = await authenticatedTransaction(
    async ({ transaction }) => {
      return await selectPriceById(
        checkoutSessionInput.priceId,
        transaction
      )
    }
  )

  if (!price) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message:
        'Price ' +
        checkoutSessionInput.priceId +
        ' not found. Either it does not exist or you do not have access to it.',
    })
  }

  const redirectUrl = customerBillingPortalURL({
    organizationId: customer.organizationId,
    customerId: customer.id,
  })

  return await adminTransaction(async ({ transaction }) => {
    return await createCheckoutSessionTransaction(
      {
        checkoutSessionInput: {
          ...checkoutSessionInput,
          successUrl: redirectUrl,
          cancelUrl: redirectUrl,
        },
        organizationId: customer.organizationId,
        livemode: customer.livemode,
      },
      transaction
    )
  })
}

export const customerBillingCreateAddPaymentMethodSession = async (
  customer: Customer.Record
) => {
  if (!customer) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'You do not have permission to create a payment method setup session',
    })
  }

  if (!customer.stripeCustomerId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'You do not have permission to create a payment method setup session',
    })
  }

  const redirectUrl = customerBillingPortalURL({
    organizationId: customer.organizationId,
    customerId: customer.id,
  })

  return await adminTransaction(async ({ transaction }) => {
    return await createCheckoutSessionTransaction(
      {
        checkoutSessionInput: {
          customerExternalId: customer.externalId,
          successUrl: redirectUrl,
          cancelUrl: redirectUrl,
          type: CheckoutSessionType.AddPaymentMethod,
        },
        organizationId: customer.organizationId,
        livemode: customer.livemode,
      },
      transaction
    )
  })
}
