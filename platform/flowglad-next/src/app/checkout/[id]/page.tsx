import CheckoutPage from '@/components/CheckoutPage'
import { adminTransaction } from '@/db/adminTransaction'
import {
  CheckoutInfoCore,
  checkoutInfoSchema,
} from '@/db/tableMethods/purchaseMethods'
import { PriceType, CheckoutSessionStatus } from '@/types'
import core from '@/utils/core'
import { getPaymentIntent, getSetupIntent } from '@/utils/stripe'
import { notFound, redirect } from 'next/navigation'
import { checkoutInfoForCheckoutSession } from '@/utils/checkoutHelpers'

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
    maybeCustomer,
    maybeCurrentSubscriptions,
  } = await adminTransaction(async ({ transaction }) => {
    return checkoutInfoForCheckoutSession(id, transaction)
  })

  if (!checkoutSession) {
    notFound()
  }
  /**
   * If the customer has an active subscription, and the price is a subscription,
   * and the organization does not allow multiple subscriptions per customer,
   * redirect to the post-payment page.
   */
  if (
    maybeCurrentSubscriptions &&
    maybeCurrentSubscriptions.length > 0 &&
    price.type === PriceType.Subscription &&
    !sellerOrganization.allowMultipleSubscriptionsPerCustomer
  ) {
    if (checkoutSession.successUrl) {
      redirect(checkoutSession.successUrl)
    } else {
      return (
        <div className="flex flex-col items-center justify-center h-screen">
          <h1 className="text-2xl font-bold">
            {`You already have an active subscription. Please reach out
            to us if you'd like to change your plan.`}
          </h1>
        </div>
      )
    }
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

  const checkoutInfo: CheckoutInfoCore = checkoutInfoSchema.parse({
    checkoutSession,
    product,
    price,
    sellerOrganization,
    type: price.type,
    redirectUrl: core.safeUrl(
      `/purchase/post-payment`,
      core.envVariable('NEXT_PUBLIC_APP_URL')
    ),
    readonlyCustomerEmail: maybeCustomer?.email,
    feeCalculation,
    clientSecret,
    flowType:
      price.type === PriceType.Subscription ||
      price.type === PriceType.Usage
        ? 'subscription'
        : 'single_payment',
  })

  return <CheckoutPage checkoutInfo={checkoutInfo} />
}

export default CheckoutSessionPage
