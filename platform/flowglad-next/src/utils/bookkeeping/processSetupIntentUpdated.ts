import { Organization } from '@/db/schema/organizations'
import {
  selectCustomerById,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import { CheckoutSessionType, PurchaseStatus } from '@/types'
import { DbTransaction } from '@/db/types'
import {
  StripeIntentMetadata,
  stripeIntentMetadataSchema,
  stripeIdFromObjectOrId,
  IntentMetadataType,
} from '@/utils/stripe'
import { Purchase } from '@/db/schema/purchases'
import Stripe from 'stripe'
import { updatePurchase } from '@/db/tableMethods/purchaseMethods'
import { Customer } from '@/db/schema/customers'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { Price } from '@/db/schema/prices'
import { createSubscriptionWorkflow } from '@/subscriptions/createSubscription'
import { processPurchaseBookkeepingForCheckoutSession } from './checkoutSessions'
import { paymentMethodForStripePaymentMethodId } from '../paymentMethodHelpers'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'

const processCheckoutSessionSetupIntent = async (
  setupIntent: Stripe.SetupIntent,
  transaction: DbTransaction
) => {
  const metadata = stripeIntentMetadataSchema.parse(
    setupIntent.metadata
  )
  if (!metadata) {
    throw new Error('No metadata found')
  }
  if (metadata.type !== IntentMetadataType.CheckoutSession) {
    throw new Error(
      `Metadata type is not checkout_session for setup intent ${setupIntent.id}`
    )
  }
  const checkoutSessionId = metadata.checkoutSessionId
  const checkoutSession = await selectCheckoutSessionById(
    checkoutSessionId,
    transaction
  )
  if (!checkoutSession) {
    throw new Error('Purchase session not found')
  }
  if (checkoutSession.type === CheckoutSessionType.Invoice) {
    throw new Error(
      'Invoice checkout flow does not support setup intents'
    )
  }
  if (checkoutSession.type === CheckoutSessionType.AddPaymentMethod) {
    const organization = await selectOrganizationById(
      checkoutSession.organizationId,
      transaction
    )
    const customer = await selectCustomerById(
      checkoutSession.customerId,
      transaction
    )
    return {
      checkoutSession,
      organization,
      customer,
    }
  }
  const [{ price, product, organization }] =
    await selectPriceProductAndOrganizationByPriceWhere(
      { id: checkoutSession.priceId },
      transaction
    )

  const {
    purchase,
    customer,
    discount,
    feeCalculation,
    discountRedemption,
  } = await processPurchaseBookkeepingForCheckoutSession(
    {
      checkoutSession,
      stripeCustomerId: setupIntent.customer
        ? stripeIdFromObjectOrId(setupIntent.customer)
        : null,
    },
    transaction
  )
  return {
    purchase,
    checkoutSession,
    price,
    organization,
    product,
    customer,
    discount,
    feeCalculation,
    discountRedemption,
  }
}

const calculateTrialEnd = (params: {
  hasHadTrial: boolean
  trialPeriodDays: number
}) => {
  const { hasHadTrial, trialPeriodDays } = params
  return hasHadTrial
    ? undefined
    : new Date(
        new Date().getTime() + trialPeriodDays * 24 * 60 * 60 * 1000
      )
}

export const processSetupIntentUpdated = async (
  setupIntent: Stripe.SetupIntent,
  transaction: DbTransaction
) => {
  const metadata: StripeIntentMetadata =
    stripeIntentMetadataSchema.parse(setupIntent.metadata)
  if (!metadata) {
    throw new Error('No metadata found')
  }
  // TODO: handle non-success cases
  if (setupIntent.status !== 'succeeded') {
    throw new Error(
      `Setup intent ${setupIntent.id} is not succeeded, but ${setupIntent.status}.`
    )
  }
  if (metadata.type !== IntentMetadataType.CheckoutSession) {
    throw new Error(
      `Metadata type is not checkout_session for setup intent ${setupIntent.id}`
    )
  }
  let price: Price.Record | null = null
  let purchase: Purchase.Record | null = null
  const result = await processCheckoutSessionSetupIntent(
    setupIntent,
    transaction
  )
  const { product, checkoutSession } = result
  let organization = result.organization
  let customer = result.customer
  if (result.product) {
    price = result.price
    purchase = result.purchase
  }
  const stripeCustomerId = setupIntent.customer
    ? stripeIdFromObjectOrId(setupIntent.customer)
    : null
  if (stripeCustomerId !== customer.stripeCustomerId) {
    customer = await updateCustomer(
      {
        id: customer.id,
        stripeCustomerId,
      },
      transaction
    )
  }

  const stripePaymentMethodId = stripeIdFromObjectOrId(
    setupIntent.payment_method!
  )
  const paymentMethod = await paymentMethodForStripePaymentMethodId(
    {
      stripePaymentMethodId,
      livemode: checkoutSession.livemode,
      customerId: customer.id,
    },
    transaction
  )
  /**
   * If the price, product, or purchase are not found,
   * we don't need to create a subscription because that means
   * the checkout session was for adding a payment method
   */
  if (!price || !product || !purchase) {
    return {
      purchase,
      checkoutSession,
      price,
      organization,
      product,
      customer,
    }
  }
  if (!price.intervalUnit) {
    throw new Error('Price interval unit is required')
  }
  if (!price.intervalCount) {
    throw new Error('Price interval count is required')
  }

  const subscriptionsForCustomer = await selectSubscriptions(
    {
      customerId: customer.id,
    },
    transaction
  )
  const hasHadTrial = subscriptionsForCustomer.some(
    (subscription) => subscription.trialEnd
  )

  const { billingRun } = await createSubscriptionWorkflow(
    {
      stripeSetupIntentId: setupIntent.id,
      defaultPaymentMethod: paymentMethod,
      organization,
      price,
      customer,
      interval: price.intervalUnit,
      intervalCount: price.intervalCount,
      /**
       * If the price has a trial period, set the trial end date to the
       * end of the period
       */
      trialEnd: calculateTrialEnd({
        hasHadTrial,
        trialPeriodDays: price.trialPeriodDays ?? 0,
      }),
      startDate: new Date(),
      quantity: checkoutSession.quantity,
      metadata: checkoutSession.outputMetadata,
      name: checkoutSession.outputName ?? undefined,
      product,
      livemode: checkoutSession.livemode,
    },
    transaction
  )

  const updatedPurchase = await updatePurchase(
    {
      id: purchase.id,
      status: PurchaseStatus.Paid,
      priceType: price.type,
      purchaseDate: new Date(),
    },
    transaction
  )

  return { purchase: updatedPurchase, checkoutSession, billingRun }
}
