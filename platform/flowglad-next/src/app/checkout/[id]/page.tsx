import { CheckoutSessionStatus, PriceType } from '@db-core/enums'
import { Result } from 'better-result'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { shouldBlockCheckout } from '@/app/checkout/guard'
import CheckoutPage from '@/components/CheckoutPage'
import { adminTransaction } from '@/db/adminTransaction'
import {
  type CheckoutInfoCore,
  checkoutInfoSchema,
} from '@/db/tableMethods/purchaseMethods'
import {
  checkoutInfoForCheckoutSession,
  getClientSecretsForCheckoutSession,
} from '@/utils/checkoutHelpers'
import core from '@/utils/core'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  try {
    const { product, sellerOrganization } = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await checkoutInfoForCheckoutSession(id, transaction)
        )
      })
    ).unwrap()
    return {
      title: `${sellerOrganization.name} | ${product.name}`,
      description: `Purchase ${product.name} from ${sellerOrganization.name}`,
    }
  } catch {
    return {
      title: 'Checkout',
      description: 'Complete your purchase',
    }
  }
}

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
    discount,
    isEligibleForTrial,
  } = (
    await adminTransaction(async ({ transaction }) => {
      return Result.ok(
        await checkoutInfoForCheckoutSession(id, transaction)
      )
    })
  ).unwrap()

  if (!checkoutSession) {
    notFound()
  }
  /**
   * If the customer already has an active paid subscription, and the price is a subscription,
   * and the organization does not allow multiple subscriptions per customer,
   * redirect to the post-payment page.
   *
   * Note: This allows free/default → paid upgrades to proceed while still blocking
   * multiple active paid subscriptions at the page level. The backend enforces this as well.
   */
  if (
    shouldBlockCheckout({
      currentSubscriptions: (maybeCurrentSubscriptions ?? []).map(
        (s) => ({
          status: s.status,
          isFreePlan: s.isFreePlan,
        })
      ),
      priceType: price.type,
      allowMultipleSubscriptionsPerCustomer:
        sellerOrganization.allowMultipleSubscriptionsPerCustomer,
    })
  ) {
    if (checkoutSession.successUrl) {
      redirect(checkoutSession.successUrl)
    } else {
      return (
        <div className="flex flex-col items-center justify-center h-screen">
          <h1 className="text-2xl">
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
  const { clientSecret, customerSessionClientSecret } =
    await getClientSecretsForCheckoutSession(
      checkoutSession,
      maybeCustomer
    )
  if (!clientSecret) {
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
      core.NEXT_PUBLIC_APP_URL
    ),
    discount,
    readonlyCustomerEmail: maybeCustomer?.email,
    feeCalculation,
    clientSecret,
    customerSessionClientSecret,
    flowType:
      price.type === PriceType.Subscription ||
      price.type === PriceType.Usage
        ? 'subscription'
        : 'single_payment',
    isEligibleForTrial,
  })

  return <CheckoutPage checkoutInfo={checkoutInfo} />
}

export default CheckoutSessionPage
