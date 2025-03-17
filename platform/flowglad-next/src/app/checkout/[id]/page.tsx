import CheckoutPage from '@/components/CheckoutPage'
import { adminTransaction } from '@/db/databaseMethods'
import { selectCustomerProfileById } from '@/db/tableMethods/customerProfileMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import {
  BillingInfoCore,
  billingInfoSchema,
} from '@/db/tableMethods/purchaseMethods'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import { selectVariantProductAndOrganizationByVariantWhere } from '@/db/tableMethods/variantMethods'
import { PriceType, CheckoutSessionStatus } from '@/types'
import core from '@/utils/core'
import { getPaymentIntent, getSetupIntent } from '@/utils/stripe'
import { notFound, redirect } from 'next/navigation'

const CheckoutSessionPage = async ({
  params,
}: {
  params: Promise<{ id: string }>
}) => {
  const { id } = await params
  const {
    checkoutSession,
    product,
    variant,
    sellerOrganization,
    feeCalculation,
    maybeCustomerProfile,
  } = await adminTransaction(async ({ transaction }) => {
    const checkoutSession = await selectCheckoutSessionById(
      id,
      transaction
    )
    /**
     * Currently, only variant / product checkout flows
     * are supported on this page.
     * For invoice or purchase flows, those should go through their respective
     * pages.
     */
    if (!checkoutSession.variantId) {
      throw new Error(
        `No variant id found for purchase session ${checkoutSession.id}. Currently, only variant / product checkout flows are supported on this page.`
      )
    }
    const [{ product, variant, organization }] =
      await selectVariantProductAndOrganizationByVariantWhere(
        { id: checkoutSession.variantId },
        transaction
      )
    const feeCalculation = await selectLatestFeeCalculation(
      { checkoutSessionId: checkoutSession.id },
      transaction
    )
    const maybeCustomerProfile = checkoutSession.customerProfileId
      ? await selectCustomerProfileById(
          checkoutSession.customerProfileId,
          transaction
        )
      : null
    return {
      checkoutSession,
      product,
      variant,
      sellerOrganization: organization,
      feeCalculation,
      maybeCustomerProfile,
    }
  })

  if (!checkoutSession) {
    notFound()
  }

  if (checkoutSession.status !== CheckoutSessionStatus.Open) {
    if (checkoutSession.stripePaymentIntentId) {
      redirect(
        `/purchase/post-payment?payment_intent=${checkoutSession.stripePaymentIntentId}`
      )
    } else if (checkoutSession.stripeSetupIntentId) {
      redirect(
        `/purchase/post-payment?setup_intent=${checkoutSession.stripeSetupIntentId}`
      )
    } else {
      redirect(
        `/purchase/post-payment?checkout_session=${checkoutSession.id}`
      )
    }
  }
  let clientSecret: string | null = null
  if (checkoutSession.stripePaymentIntentId) {
    const paymentIntent = await getPaymentIntent(
      checkoutSession.stripePaymentIntentId
    )
    clientSecret = paymentIntent.client_secret
  } else if (checkoutSession.stripeSetupIntentId) {
    const setupIntent = await getSetupIntent(
      checkoutSession.stripeSetupIntentId
    )
    clientSecret = setupIntent.client_secret
  } else {
    throw new Error('No client secret found')
  }

  const billingInfo: BillingInfoCore = billingInfoSchema.parse({
    checkoutSession,
    product,
    variant,
    sellerOrganization,
    priceType: variant.priceType,
    redirectUrl: core.safeUrl(
      `/purchase/post-payment`,
      core.envVariable('NEXT_PUBLIC_APP_URL')
    ),
    readonlyCustomerEmail: maybeCustomerProfile?.email,
    feeCalculation,
    clientSecret,
    flowType:
      variant.priceType === PriceType.Subscription
        ? 'subscription'
        : 'single_payment',
  })

  return <CheckoutPage billingInfo={billingInfo} />
}

export default CheckoutSessionPage
