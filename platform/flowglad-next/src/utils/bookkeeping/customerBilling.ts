import { TRPCError } from '@trpc/server'
import type { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { customerBillingCreatePricedCheckoutSessionInputSchema } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { selectCustomerFacingInvoicesWithLineItems } from '@/db/tableMethods/invoiceLineItemMethods'
import {
  safelyUpdatePaymentMethod,
  selectPaymentMethodById,
  selectPaymentMethodsByCustomerId,
} from '@/db/tableMethods/paymentMethodMethods'
import {
  selectPriceById,
  selectPriceBySlugAndCustomerId,
} from '@/db/tableMethods/priceMethods'
import { selectPricingModelForCustomer } from '@/db/tableMethods/pricingModelMethods'
import { selectPurchasesByCustomerId } from '@/db/tableMethods/purchaseMethods'
import { selectRichSubscriptionsAndActiveItems } from '@/db/tableMethods/subscriptionItemMethods.server'
import {
  isSubscriptionCurrent,
  safelyUpdateSubscriptionsForCustomerToNewPaymentMethod,
} from '@/db/tableMethods/subscriptionMethods'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import type { RichSubscription } from '@/subscriptions/schemas'
import { CheckoutSessionType } from '@/types'
import {
  CacheDependency,
  type CacheRecomputationContext,
} from '@/utils/cache'
import { customerBillingPortalURL } from '@/utils/core'
import { createCheckoutSessionTransaction } from './createCheckoutSession'

export const customerBillingTransaction = async (
  params: {
    externalId: string
    organizationId: string
  },
  transaction: DbTransaction,
  cacheRecomputationContext: CacheRecomputationContext
) => {
  const [customer] = await selectCustomers(params, transaction)
  // All queries below depend only on customer, so they can run in parallel
  const [
    subscriptions,
    pricingModel,
    invoices,
    paymentMethods,
    purchases,
  ] = await Promise.all([
    selectRichSubscriptionsAndActiveItems(
      { customerId: customer.id },
      transaction,
      cacheRecomputationContext
    ),
    selectPricingModelForCustomer(customer, transaction),
    selectCustomerFacingInvoicesWithLineItems(
      customer.id,
      transaction,
      customer.livemode
    ),
    selectPaymentMethodsByCustomerId(
      customer.id,
      transaction,
      customer.livemode
    ),
    selectPurchasesByCustomerId(
      customer.id,
      transaction,
      customer.livemode
    ),
  ])
  const currentSubscriptions = subscriptions.filter((item) => {
    return isSubscriptionCurrent(item.status, item.cancellationReason)
  })

  // Sort currentSubscriptions by createdAt descending (most recent first)
  // If createdAt ties, use updatedAt as tiebreaker
  // If updatedAt also ties, use id as final tiebreaker
  const sortedCurrentSubscriptions = [...currentSubscriptions].sort(
    (a, b) => {
      const createdAtDiff = b.createdAt - a.createdAt
      if (createdAtDiff !== 0) return createdAtDiff

      const updatedAtDiff = b.updatedAt - a.updatedAt
      if (updatedAtDiff !== 0) return updatedAtDiff

      return a.id < b.id ? -1 : 1
    }
  )

  // Extract the most recently created subscription
  const currentSubscription: RichSubscription | undefined =
    sortedCurrentSubscriptions[0]

  // FIXME: Uncomment once we migrate all non-subscribed customers to subscriptions
  // if (!currentSubscription) {
  //   throw new TRPCError({
  //     code: 'PRECONDITION_FAILED',
  //     message: 'Customer has no current subscriptions',
  //   })
  // }

  return {
    customer,
    purchases,
    invoices,
    paymentMethods,
    pricingModel,
    subscriptions,
    currentSubscriptions,
    currentSubscription,
  }
}

export const setDefaultPaymentMethodForCustomer = async (
  { paymentMethodId }: { paymentMethodId: string },
  ctx: TransactionEffectsContext
) => {
  const { transaction, invalidateCache } = ctx
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
      ctx
    )
    await safelyUpdateSubscriptionsForCustomerToNewPaymentMethod(
      updatedPaymentMethod,
      transaction
    )
    // Invalidate payment methods cache after updating default payment method
    invalidateCache(
      CacheDependency.customerPaymentMethods(
        updatedPaymentMethod.customerId
      )
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

export const customerBillingCreatePricedCheckoutSession = async ({
  checkoutSessionInput: rawCheckoutSessionInput,
  customer,
}: {
  checkoutSessionInput: z.infer<
    typeof customerBillingCreatePricedCheckoutSessionInputSchema
  >
  customer: Customer.Record
}) => {
  const checkoutSessionInputResult =
    customerBillingCreatePricedCheckoutSessionInputSchema.safeParse(
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

  if (checkoutSessionInput.type === CheckoutSessionType.Product) {
    // Resolve price ID from either priceId or priceSlug
    let resolvedPriceId: string

    if (checkoutSessionInput.priceId) {
      resolvedPriceId = checkoutSessionInput.priceId
    } else if (checkoutSessionInput.priceSlug) {
      const priceFromSlug = await authenticatedTransaction(
        async ({ transaction }) => {
          return await selectPriceBySlugAndCustomerId(
            {
              slug: checkoutSessionInput.priceSlug!,
              customerId: customer.id,
            },
            transaction
          )
        }
      )
      if (!priceFromSlug) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Price with slug "${checkoutSessionInput.priceSlug}" not found for customer's pricing model`,
        })
      }
      resolvedPriceId = priceFromSlug.id
    } else {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Either priceId or priceSlug must be provided',
      })
    }

    const price = await authenticatedTransaction(
      async ({ transaction }) => {
        return await selectPriceById(resolvedPriceId, transaction)
      }
    )
    if (!price) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message:
          'Price ' +
          resolvedPriceId +
          ' not found. Either it does not exist or you do not have access to it.',
      })
    }
  }

  const redirectUrl = customerBillingPortalURL({
    organizationId: customer.organizationId,
    customerId: customer.id,
  })

  return await adminTransaction(async ({ transaction }) => {
    const result = await createCheckoutSessionTransaction(
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
    if (result.status === 'error') {
      throw result.error
    }
    return result.value
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
    const result = await createCheckoutSessionTransaction(
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
    if (result.status === 'error') {
      throw result.error
    }
    return result.value
  })
}
