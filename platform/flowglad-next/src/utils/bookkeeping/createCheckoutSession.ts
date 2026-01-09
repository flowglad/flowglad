import type {
  CheckoutSession,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionObject,
} from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import {
  insertCheckoutSession,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectCustomerByExternalIdAndOrganizationId } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  selectPriceBySlugAndCustomerId,
  selectPriceBySlugForDefaultPricingModel,
  selectPriceProductAndOrganizationByPriceWhere,
} from '@/db/tableMethods/priceMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import type { DbTransaction } from '@/db/types'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PriceType,
} from '@/types'
import core from '@/utils/core'
import {
  createPaymentIntentForCheckoutSession,
  createSetupIntentForCheckoutSession,
} from '@/utils/stripe'

export const checkoutSessionInsertFromInput = ({
  checkoutSessionInput,
  customer,
  organizationId,
  livemode,
  activateSubscriptionPriceId,
  resolvedPriceId,
}: {
  checkoutSessionInput: CreateCheckoutSessionObject
  customer: Customer.Record | null
  organizationId: string
  livemode: boolean
  activateSubscriptionPriceId?: string | null
  resolvedPriceId?: string
}): CheckoutSession.Insert => {
  const coreFields: Pick<
    CheckoutSession.Insert,
    | 'organizationId'
    | 'status'
    | 'livemode'
    | 'successUrl'
    | 'cancelUrl'
    | 'outputMetadata'
    | 'outputName'
    | 'automaticallyUpdateSubscriptions'
  > = {
    organizationId,
    status: CheckoutSessionStatus.Open,
    livemode,
    successUrl: checkoutSessionInput.successUrl,
    cancelUrl: checkoutSessionInput.cancelUrl,
    outputMetadata: checkoutSessionInput.outputMetadata ?? undefined,
    outputName: checkoutSessionInput.outputName,
    automaticallyUpdateSubscriptions: null,
  } as const

  const isAnonymous =
    'anonymous' in checkoutSessionInput &&
    checkoutSessionInput.anonymous === true

  if (checkoutSessionInput.type === CheckoutSessionType.Product) {
    if (!isAnonymous && !customer) {
      throw new Error(
        `Required customer not found for Product checkout (anonymous=false). externalId='${checkoutSessionInput.customerExternalId}', organization='${organizationId}'.`
      )
    }
    return {
      ...coreFields,
      automaticallyUpdateSubscriptions: null,
      type: CheckoutSessionType.Product,
      invoiceId: null,
      priceId: resolvedPriceId ?? checkoutSessionInput.priceId!,
      targetSubscriptionId: null,
      customerId: isAnonymous ? null : customer!.id,
      customerEmail: isAnonymous ? null : customer!.email,
      customerName: isAnonymous ? null : customer!.name,
      preserveBillingCycleAnchor:
        checkoutSessionInput.preserveBillingCycleAnchor ?? false,
    }
  } else if (
    checkoutSessionInput.type === CheckoutSessionType.AddPaymentMethod
  ) {
    if (!customer) {
      throw new Error(
        'Customer is required for add payment method checkout sessions'
      )
    }
    return {
      ...coreFields,
      customerId: customer.id,
      customerEmail: customer.email,
      customerName: customer.name,
      automaticallyUpdateSubscriptions: false,
      type: CheckoutSessionType.AddPaymentMethod,
      targetSubscriptionId:
        checkoutSessionInput.targetSubscriptionId ?? null,
    }
  } else if (
    checkoutSessionInput.type ===
    CheckoutSessionType.ActivateSubscription
  ) {
    if (!customer) {
      throw new Error(
        'Customer is required for activate subscription checkout sessions'
      )
    }
    if (!activateSubscriptionPriceId) {
      throw new Error(
        'Activate subscription checkout sessions require a price derived from the target subscription'
      )
    }
    return {
      ...coreFields,
      priceId: activateSubscriptionPriceId,
      type: CheckoutSessionType.ActivateSubscription,
      targetSubscriptionId: checkoutSessionInput.targetSubscriptionId,
      purchaseId: null,
      invoiceId: null,
      customerId: customer.id,
      customerEmail: customer.email,
      customerName: customer.name,
      preserveBillingCycleAnchor:
        checkoutSessionInput.preserveBillingCycleAnchor ?? false,
    }
  }
  throw new Error(
    `Invalid checkout session, type: ${
      // @ts-expect-error - this is a type error because it should never be hit
      checkoutSessionInput.type
    }`
  )
}

export const createCheckoutSessionTransaction = async (
  {
    checkoutSessionInput,
    organizationId,
    livemode,
  }: {
    checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession']
    organizationId: string
    livemode: boolean
  },
  transaction: DbTransaction
) => {
  // Only query for customer if customerExternalId is provided
  let customer: Customer.Record | null = null
  if (checkoutSessionInput.customerExternalId) {
    customer = await selectCustomerByExternalIdAndOrganizationId(
      {
        externalId: checkoutSessionInput.customerExternalId,
        organizationId,
      },
      transaction
    )
  }
  // Anonymous sessions can omit customerExternalId; in that case customer will be null
  // NOTE: invoice and purchase checkout sessions are not supported by API yet.
  let price: Price.Record | null = null
  let product: Product.Record | null = null
  let organization: Organization.Record | null = null
  let activateSubscriptionPriceId: string | null = null
  let resolvedPriceId: string | undefined

  if (checkoutSessionInput.type === CheckoutSessionType.Product) {
    // Resolve price ID from either priceId or priceSlug
    if (
      'priceSlug' in checkoutSessionInput &&
      checkoutSessionInput.priceSlug
    ) {
      const isAnonymous =
        'anonymous' in checkoutSessionInput &&
        checkoutSessionInput.anonymous === true

      if (isAnonymous) {
        // Anonymous checkout: use organization's default pricing model
        const priceFromSlug =
          await selectPriceBySlugForDefaultPricingModel(
            {
              slug: checkoutSessionInput.priceSlug,
              organizationId,
              livemode,
            },
            transaction
          )
        if (!priceFromSlug) {
          throw new Error(
            `Price with slug "${checkoutSessionInput.priceSlug}" not found in organization's default pricing model`
          )
        }
        resolvedPriceId = priceFromSlug.id
      } else {
        // Identified customer: use customer's pricing model
        if (!customer) {
          throw new Error(
            'Customer is required to resolve price slug for identified checkout sessions'
          )
        }
        const priceFromSlug = await selectPriceBySlugAndCustomerId(
          {
            slug: checkoutSessionInput.priceSlug,
            customerId: customer.id,
          },
          transaction
        )
        if (!priceFromSlug) {
          throw new Error(
            `Price with slug "${checkoutSessionInput.priceSlug}" not found for customer's pricing model`
          )
        }
        resolvedPriceId = priceFromSlug.id
      }
    } else if (checkoutSessionInput.priceId) {
      resolvedPriceId = checkoutSessionInput.priceId
    }

    const [result] =
      await selectPriceProductAndOrganizationByPriceWhere(
        { id: resolvedPriceId! },
        transaction
      )
    price = result.price
    product = result.product
    organization = result.organization

    // Product checkout requires a product - usage prices (with null product) are not supported here
    if (!product) {
      throw new Error(
        'Checkout sessions are only supported for product prices (subscription/single payment), not usage prices'
      )
    }

    if (product.default) {
      throw new Error(
        'Checkout sessions cannot be created for default products. Default products are automatically assigned to customers and do not require manual checkout.'
      )
    }
    // FIXME: Re-enable this once usage prices are deprecated
    // if (price.type === PriceType.Usage) {
    //   throw new Error(
    //     `Price id: ${price.id} has usage price. Usage prices are not supported for checkout sessions.`
    //   )
    // }
  } else {
    organization = await selectOrganizationById(
      organizationId,
      transaction
    )
    if (
      checkoutSessionInput.type ===
      CheckoutSessionType.ActivateSubscription
    ) {
      const targetSubscription = await selectSubscriptionById(
        checkoutSessionInput.targetSubscriptionId,
        transaction
      ).catch((error) => {
        throw new Error(
          `Target subscription ${checkoutSessionInput.targetSubscriptionId} not found`,
          { cause: error }
        )
      })
      if (!customer) {
        throw new Error(
          'Customer is required for activate subscription checkout sessions'
        )
      }
      if (targetSubscription.organizationId !== organizationId) {
        throw new Error(
          `Target subscription ${targetSubscription.id} does not belong to organization ${organizationId}`
        )
      }
      if (targetSubscription.customerId !== customer.id) {
        throw new Error(
          `Target subscription ${targetSubscription.id} does not belong to customer ${customer.id}`
        )
      }
      if (!targetSubscription.priceId) {
        throw new Error(
          `Target subscription ${targetSubscription.id} does not have an associated price`
        )
      }
      activateSubscriptionPriceId = targetSubscription.priceId
    }
  }

  const checkoutSession = await insertCheckoutSession(
    checkoutSessionInsertFromInput({
      checkoutSessionInput,
      customer,
      organizationId,
      livemode,
      activateSubscriptionPriceId,
      resolvedPriceId,
    }),
    transaction
  )

  let stripeSetupIntentId: string | null = null
  let stripePaymentIntentId: string | null = null
  if (
    // FIXME: Remove this once usage prices are deprecated
    price?.type === PriceType.Usage ||
    price?.type === PriceType.Subscription ||
    checkoutSession.type === CheckoutSessionType.AddPaymentMethod ||
    checkoutSession.type === CheckoutSessionType.ActivateSubscription
  ) {
    const stripeSetupIntent =
      await createSetupIntentForCheckoutSession({
        organization,
        checkoutSession,
        ...(customer ? { customer } : {}),
      })
    stripeSetupIntentId = stripeSetupIntent.id
  } else if (price?.type === PriceType.SinglePayment && product) {
    const stripePaymentIntent =
      await createPaymentIntentForCheckoutSession({
        price,
        product,
        organization,
        checkoutSession,
        ...(customer ? { customer } : {}),
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
    updatedCheckoutSession.type ===
    CheckoutSessionType.AddPaymentMethod
      ? `${core.NEXT_PUBLIC_APP_URL}/add-payment-method/${checkoutSession.id}`
      : `${core.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`
  return {
    checkoutSession: updatedCheckoutSession,
    url,
  }
}
