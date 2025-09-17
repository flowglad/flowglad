import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PriceType,
} from '@/types'
import { DbTransaction } from '@/db/types'
import {
  createPaymentIntentForCheckoutSession,
  createSetupIntentForCheckoutSession,
} from '@/utils/stripe'
import {
  CheckoutSession,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionObject,
} from '@/db/schema/checkoutSessions'
import {
  insertCheckoutSession,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { selectCustomerByExternalIdAndOrganizationId } from '@/db/tableMethods/customerMethods'
import { Customer } from '@/db/schema/customers'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'

const checkoutSessionInsertFromInput = ({
  checkoutSessionInput,
  customer,
  organizationId,
  livemode,
}: {
  checkoutSessionInput: CreateCheckoutSessionObject
  customer: Customer.Record | null
  organizationId: string
  livemode: boolean
}): CheckoutSession.Insert => {
  const coreFields = {
    organizationId,
    status: CheckoutSessionStatus.Open,
    livemode,
    successUrl: checkoutSessionInput.successUrl,
    cancelUrl: checkoutSessionInput.cancelUrl,
    outputMetadata: checkoutSessionInput.outputMetadata,
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
      type: CheckoutSessionType.Product,
      invoiceId: null,
      priceId: checkoutSessionInput.priceId,
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
    return {
      ...coreFields,
      priceId: checkoutSessionInput.priceId,
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
  if (checkoutSessionInput.type === CheckoutSessionType.Product) {
    const [result] =
      await selectPriceProductAndOrganizationByPriceWhere(
        { id: checkoutSessionInput.priceId },
        transaction
      )
    price = result.price
    product = result.product
    organization = result.organization

    if (product.default) {
      throw new Error(
        'Checkout sessions cannot be created for default products. Default products are automatically assigned to customers and do not require manual checkout.'
      )
    }
  } else {
    organization = await selectOrganizationById(
      organizationId,
      transaction
    )
  }

  const checkoutSession = await insertCheckoutSession(
    checkoutSessionInsertFromInput({
      checkoutSessionInput,
      customer,
      organizationId,
      livemode,
    }),
    transaction
  )

  let stripeSetupIntentId: string | null = null
  let stripePaymentIntentId: string | null = null
  if (
    price?.type === PriceType.Subscription ||
    price?.type === PriceType.Usage ||
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
      ? `${process.env.NEXT_PUBLIC_APP_URL}/add-payment-method/${checkoutSession.id}`
      : `${process.env.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`
  return {
    checkoutSession: updatedCheckoutSession,
    url,
  }
}
