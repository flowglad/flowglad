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
import { selectCustomers } from '@/db/tableMethods/customerMethods'
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
    automaticallyUpdateSubscriptions: null,
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
      automaticallyUpdateSubscriptions: false,
      type: CheckoutSessionType.AddPaymentMethod,
      targetSubscriptionId:
        checkoutSessionInput.targetSubscriptionId ?? null,
    }
  } else if (
    checkoutSessionInput.type ===
    CheckoutSessionType.ActivateSubscription
  ) {
    return {
      ...coreFields,
      priceId: checkoutSessionInput.priceId,
      type: CheckoutSessionType.ActivateSubscription,
      targetSubscriptionId: checkoutSessionInput.targetSubscriptionId,
      purchaseId: null,
      invoiceId: null,
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
  const [customer] = await selectCustomers(
    {
      externalId: checkoutSessionInput.customerExternalId,
    },
    transaction
  )
  if (!customer) {
    throw new Error(
      `Customer not found for externalId: ${checkoutSessionInput.customerExternalId}`
    )
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
    checkoutSession.type === CheckoutSessionType.AddPaymentMethod ||
    checkoutSession.type === CheckoutSessionType.ActivateSubscription
  ) {
    const stripeSetupIntent =
      await createSetupIntentForCheckoutSession({
        organization,
        checkoutSession,
        customer,
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
    checkoutSession.type === CheckoutSessionType.AddPaymentMethod
      ? `${process.env.NEXT_PUBLIC_APP_URL}/add-payment-method/${checkoutSession.id}`
      : `${process.env.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`
  return {
    checkoutSession: updatedCheckoutSession,
    url,
  }
}
