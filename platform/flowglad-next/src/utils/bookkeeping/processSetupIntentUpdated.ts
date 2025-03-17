import { Organization } from '@/db/schema/organizations'
import { updateCustomerProfile } from '@/db/tableMethods/customerProfileMethods'
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
import { CustomerProfile } from '@/db/schema/customerProfiles'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import { selectVariantProductAndOrganizationByVariantWhere } from '@/db/tableMethods/variantMethods'
import { Variant } from '@/db/schema/variants'
import { createSubscriptionWorkflow } from '@/subscriptions/createSubscription'
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

  const [{ variant, product, organization }] =
    await selectVariantProductAndOrganizationByVariantWhere(
      { id: checkoutSession.variantId },
      transaction
    )

  const {
    purchase,
    customerProfile,
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
    variant,
    organization,
    product,
    customerProfile,
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
  let variant: Variant.Record | null = null
  let purchase: Purchase.Record | null = null
  let customerProfile: CustomerProfile.Record | null = null
  const result = await processCheckoutSessionSetupIntent(
    setupIntent,
    transaction
  )
  const { product, checkoutSession } = result
  organization = result.organization
  variant = result.variant
  purchase = result.purchase
  customerProfile = result.customerProfile
  const stripeCustomerId = setupIntent.customer
    ? stripeIdFromObjectOrId(setupIntent.customer)
    : null
  if (stripeCustomerId !== customerProfile.stripeCustomerId) {
    customerProfile = await updateCustomerProfile(
      {
        id: customerProfile.id,
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
      customerProfileId: customerProfile.id,
    },
    transaction
  )
  if (!variant.intervalUnit) {
    throw new Error('Variant interval unit is required')
  }
  if (!variant.intervalCount) {
    throw new Error('Variant interval count is required')
  }
  await createSubscriptionWorkflow(
    {
      stripeSetupIntentId: setupIntent.id,
      defaultPaymentMethod: paymentMethod,
      organization,
      variant,
      customerProfile,
      interval: variant.intervalUnit,
      intervalCount: variant.intervalCount,
      /**
       * If the variant has a trial period, set the trial end date to the
       * end of the period.
       */
      trialEnd: variant.trialPeriodDays
        ? new Date(
            new Date().getTime() +
              variant.trialPeriodDays * 24 * 60 * 60 * 1000
          )
        : undefined,
      startDate: new Date(),
      quantity: checkoutSession.quantity,
      product,
      livemode: purchase.livemode,
    },
    transaction
  )

  const updatedPurchase = await updatePurchase(
    {
      id: purchase.id,
      status: PurchaseStatus.Paid,
      purchaseDate: new Date(),
    },
    transaction
  )

  return { purchase: updatedPurchase, checkoutSession }
}
