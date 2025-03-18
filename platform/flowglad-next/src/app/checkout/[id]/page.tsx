import CheckoutPage from '@/components/CheckoutPage'
import { adminTransaction } from '@/db/databaseMethods'
import { selectCustomerProfileById } from '@/db/tableMethods/customerProfileMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import {
  BillingInfoCore,
  billingInfoSchema,
} from '@/db/tableMethods/purchaseMethods'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
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
    price,
    sellerOrganization,
    feeCalculation,
    maybeCustomerProfile,
  } = await adminTransaction(async ({ transaction }) => {
    const checkoutSession = await selectCheckoutSessionById(
      id,
      transaction
    )
    /**
     * Currently, only price / product checkout flows
     * are supported on this page.
     * For invoice or purchase flows, those should go through their respective
     * pages.
     */
    if (!checkoutSession.priceId) {
      throw new Error(
        `No price id found for purchase session ${checkoutSession.id}. Currently, only price / product checkout flows are supported on this page.`
      )
    }
    const [{ product, price, organization }] =
      await selectPriceProductAndOrganizationByPriceWhere(
        { id: checkoutSession.priceId },
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
      price,
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
    price,
    sellerOrganization,
    type: price.type,
    redirectUrl: core.safeUrl(
      `/purchase/post-payment`,
      core.envVariable('NEXT_PUBLIC_APP_URL')
    ),
    readonlyCustomerEmail: maybeCustomerProfile?.email,
    feeCalculation,
    clientSecret,
    flowType:
      price.type === PriceType.Subscription
        ? 'subscription'
        : 'single_payment',
  })

  return <CheckoutPage billingInfo={billingInfo} />
}

export default CheckoutSessionPage
