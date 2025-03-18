import { notFound, redirect } from 'next/navigation'
import { adminTransaction } from '@/db/databaseMethods'
import {
  billingInfoSchema,
  selectPurchaseCheckoutParametersById,
} from '@/db/tableMethods/purchaseMethods'
import PaymentStatusProcessing from '@/components/PaymentStatusProcessing'
import core from '@/utils/core'
import { findOrCreateCheckoutSession } from '@/utils/checkoutSessionState'
import CheckoutPage from '@/components/CheckoutPage'
import { selectDiscountById } from '@/db/tableMethods/discountMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { getPaymentIntent, getSetupIntent } from '@/utils/stripe'
import { selectCustomerProfileById } from '@/db/tableMethods/customerProfileMethods'
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
      const maybeCustomerProfile = checkoutSession.customerProfileId
        ? await selectCustomerProfileById(
            checkoutSession.customerProfileId,
            transaction
          )
        : null
      return {
        purchase,
        price,
        customerProfile: result.customerProfile,
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
        readonlyCustomerEmail: maybeCustomerProfile?.email,
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
   * TODO: more helpful error screen
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

  const billingInfo = billingInfoSchema.parse({
    ...rawContextValues,
    priceType: purchase.priceType,
    purchase,
    redirectUrl: core.safeUrl(
      `/purchase/post-payment`,
      core.envVariable('NEXT_PUBLIC_APP_URL')
    ),
    clientSecret: stripeIntent.client_secret,
  })

  return <CheckoutPage billingInfo={billingInfo} />
}

export default PayPurchasePage
