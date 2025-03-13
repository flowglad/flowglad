import { notFound, redirect } from 'next/navigation'
import { adminTransaction } from '@/db/databaseMethods'
import {
  billingInfoSchema,
  selectPurchaseCheckoutParametersById,
} from '@/db/tableMethods/purchaseMethods'
import PaymentStatusProcessing from '@/components/PaymentStatusProcessing'
import core from '@/utils/core'
import { findOrCreatePurchaseSession } from '@/utils/purchaseSessionState'
import CheckoutPage from '@/components/CheckoutPage'
import { selectDiscountById } from '@/db/tableMethods/discountMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { getPaymentIntent, getSetupIntent } from '@/utils/stripe'
import { selectCustomerProfileById } from '@/db/tableMethods/customerProfileMethods'
import { PurchaseSessionType } from '@/types'

const PayPurchasePage = async ({
  params,
}: {
  params: { id: string }
}) => {
  const rawContextValues = await adminTransaction(
    async ({ transaction }) => {
      const result = await selectPurchaseCheckoutParametersById(
        params.id,
        transaction
      )
      const { variant, organization, purchase, product } = result
      const purchaseSession = await findOrCreatePurchaseSession(
        {
          productId: product.id,
          organizationId: organization.id,
          variant,
          purchase,
          type: PurchaseSessionType.Purchase,
        },
        transaction
      )

      const discount = purchaseSession.discountId
        ? await selectDiscountById(
            purchaseSession.discountId,
            transaction
          )
        : null
      const feeCalculation = await selectLatestFeeCalculation(
        { PurchaseSessionId: purchaseSession.id },
        transaction
      )
      const maybeCustomerProfile = purchaseSession.customerProfileId
        ? await selectCustomerProfileById(
            purchaseSession.customerProfileId,
            transaction
          )
        : null
      return {
        purchase,
        variant,
        customerProfile: result.customerProfile,
        customer: result.customer,
        sellerOrganization: organization,
        product: result.product,
        priceType: variant.priceType,
        feeCalculation,
        billingAddress:
          purchaseSession.billingAddress ??
          result.customer.billingAddress ??
          result.purchase.billingAddress,
        purchaseSession,
        readonlyCustomerEmail: maybeCustomerProfile?.email,
        discount,
      }
    }
  )

  let purchase = rawContextValues.purchase
  const purchaseSession = rawContextValues.purchaseSession
  if (
    !purchaseSession.stripePaymentIntentId &&
    !purchaseSession.stripeSetupIntentId
  ) {
    notFound()
  }
  const stripeIntent = purchaseSession.stripeSetupIntentId
    ? await getSetupIntent(purchaseSession.stripeSetupIntentId)
    : await getPaymentIntent(purchaseSession.stripePaymentIntentId!)
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
