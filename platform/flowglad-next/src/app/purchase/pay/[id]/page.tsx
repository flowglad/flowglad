import { notFound, redirect } from 'next/navigation'
import { adminTransaction } from '@/db/adminTransaction'
import {
  checkoutInfoSchema,
  selectPurchaseCheckoutParametersById,
} from '@/db/tableMethods/purchaseMethods'
import PaymentStatusProcessing from '@/components/PaymentStatusProcessing'
import core from '@/utils/core'
import { findOrCreateCheckoutSession } from '@/utils/checkoutSessionState'
import CheckoutPage from '@/components/CheckoutPage'
import { selectDiscountById } from '@/db/tableMethods/discountMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { getPaymentIntent, getSetupIntent } from '@/utils/stripe'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { CheckoutSessionType } from '@/types'

const PayPurchasePage = async ({
  params,
}: {
  params: Promise<{ id: string }>
}) => {
  const { id } = await params
  const rawContextValues = await adminTransaction(
    async ({ transaction }) => {
      const result = await selectPurchaseCheckoutParametersById(
        id,
        transaction
      )
      const { price, organization, purchase, product } = result
      const checkoutSession = await findOrCreateCheckoutSession(
        {
          productId: product.id,
          organizationId: organization.id,
          price,
          purchase,
          type: CheckoutSessionType.Purchase,
        },
        transaction
      )

      const discount = checkoutSession.discountId
        ? await selectDiscountById(
            checkoutSession.discountId,
            transaction
          )
        : null
      const feeCalculation = await selectLatestFeeCalculation(
        { checkoutSessionId: checkoutSession.id },
        transaction
      )
      const maybeCustomer = checkoutSession.customerId
        ? await selectCustomerById(
            checkoutSession.customerId,
            transaction
          )
        : null
      return {
        purchase,
        price,
        customer: result.customer,
        sellerOrganization: organization,
        product: result.product,
        type: price.type,
        feeCalculation,
        billingAddress:
          checkoutSession.billingAddress ??
          result.customer.billingAddress ??
          result.purchase.billingAddress,
        checkoutSession,
        readonlyCustomerEmail: maybeCustomer?.email,
        discount,
      }
    }
  )

  let purchase = rawContextValues.purchase
  const checkoutSession = rawContextValues.checkoutSession
  if (
    !checkoutSession.stripePaymentIntentId &&
    !checkoutSession.stripeSetupIntentId
  ) {
    notFound()
  }
  const stripeIntent = checkoutSession.stripeSetupIntentId
    ? await getSetupIntent(checkoutSession.stripeSetupIntentId)
    : await getPaymentIntent(checkoutSession.stripePaymentIntentId!)
  /**
   * FIXME: more helpful error screen
   */
  if (!stripeIntent) {
    notFound()
  }

  if (!stripeIntent.client_secret) {
    notFound()
  }

  if (stripeIntent.status === 'succeeded') {
    return redirect(
      `/purchase/post-payment?${stripeIntent.object}=${stripeIntent.id}`
    )
  }

  if (stripeIntent.status === 'processing') {
    return <PaymentStatusProcessing />
  }

  const checkoutInfo = checkoutInfoSchema.parse({
    ...rawContextValues,
    priceType: purchase.priceType,
    purchase,
    redirectUrl: core.safeUrl(
      `/purchase/post-payment`,
      core.envVariable('NEXT_PUBLIC_APP_URL')
    ),
    clientSecret: stripeIntent.client_secret,
  })

  return <CheckoutPage checkoutInfo={checkoutInfo} />
}

export default PayPurchasePage
