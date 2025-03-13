import { Organization } from '@/db/schema/organizations'
import { updateCustomerProfile } from '@/db/tableMethods/customerProfileMethods'
import { PurchaseSessionType, PurchaseStatus } from '@/types'
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
import { selectPurchaseSessionById } from '@/db/tableMethods/purchaseSessionMethods'
import { selectVariantProductAndOrganizationByVariantWhere } from '@/db/tableMethods/variantMethods'
import { Variant } from '@/db/schema/variants'
import { createSubscriptionWorkflow } from '@/subscriptions/createSubscription'
import { processPurchaseBookkeepingForPurchaseSession } from './purchaseSessions'
import { paymentMethodForStripePaymentMethodId } from '../paymentMethodHelpers'

const processPurchaseSessionSetupIntent = async (
  setupIntent: Stripe.SetupIntent,
  transaction: DbTransaction
) => {
  const metadata = stripeIntentMetadataSchema.parse(
    setupIntent.metadata
  )
  if (!metadata) {
    throw new Error('No metadata found')
  }
  if (metadata.type !== IntentMetadataType.PurchaseSession) {
    throw new Error(
      `Metadata type is not purchase_session for setup intent ${setupIntent.id}`
    )
  }
  const purchaseSessionId = metadata.purchaseSessionId
  const purchaseSession = await selectPurchaseSessionById(
    purchaseSessionId,
    transaction
  )
  if (!purchaseSession) {
    throw new Error('Purchase session not found')
  }
  if (purchaseSession.type === PurchaseSessionType.Invoice) {
    throw new Error(
      'Invoice checkout flow does not support setup intents'
    )
  }

  const [{ variant, product, organization }] =
    await selectVariantProductAndOrganizationByVariantWhere(
      { id: purchaseSession.variantId },
      transaction
    )

  const {
    purchase,
    customerProfile,
    discount,
    feeCalculation,
    discountRedemption,
  } = await processPurchaseBookkeepingForPurchaseSession(
    {
      purchaseSession,
      stripeCustomerId: setupIntent.customer
        ? stripeIdFromObjectOrId(setupIntent.customer)
        : null,
    },
    transaction
  )
  return {
    purchase,
    purchaseSession,
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
  if (metadata.type !== IntentMetadataType.PurchaseSession) {
    throw new Error(
      `Metadata type is not purchase_session for setup intent ${setupIntent.id}`
    )
  }
  let organization: Organization.Record | null = null
  let variant: Variant.Record | null = null
  let purchase: Purchase.Record | null = null
  let customerProfile: CustomerProfile.Record | null = null
  const result = await processPurchaseSessionSetupIntent(
    setupIntent,
    transaction
  )
  const { product, purchaseSession } = result
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
      quantity: purchaseSession.quantity,
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

  return { purchase: updatedPurchase, purchaseSession }
}
