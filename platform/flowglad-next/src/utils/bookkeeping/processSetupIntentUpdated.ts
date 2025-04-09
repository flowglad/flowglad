import { Organization } from '@/db/schema/organizations'
import { updateCustomer } from '@/db/tableMethods/customerMethods'
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
import { setupIntentSucceededCreateSubscriptionWorkflow } from '@/subscriptions/createSubscription'
import { processPurchaseBookkeepingForCheckoutSession } from './checkoutSessions'
import { paymentMethodForStripePaymentMethodId } from '../paymentMethodHelpers'

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
  let organization: Organization.Record | null = null
  let price: Price.Record | null = null
  let purchase: Purchase.Record | null = null
  let customer: Customer.Record | null = null
  const result = await processCheckoutSessionSetupIntent(
    setupIntent,
    transaction
  )
  const { product, checkoutSession } = result
  organization = result.organization
  price = result.price
  purchase = result.purchase
  customer = result.customer
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
      livemode: purchase.livemode,
      customerId: customer.id,
    },
    transaction
  )
  if (!price.intervalUnit) {
    throw new Error('Price interval unit is required')
  }
  if (!price.intervalCount) {
    throw new Error('Price interval count is required')
  }
  const { billingRun } =
    await setupIntentSucceededCreateSubscriptionWorkflow(
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
         * end of the period.
         */
        trialEnd: price.trialPeriodDays
          ? new Date(
              new Date().getTime() +
                price.trialPeriodDays * 24 * 60 * 60 * 1000
            )
          : undefined,
        startDate: new Date(),
        quantity: checkoutSession.quantity,
        metadata: checkoutSession.outputMetadata,
        name: checkoutSession.outputName ?? undefined,
        product,
        livemode: purchase.livemode,
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
