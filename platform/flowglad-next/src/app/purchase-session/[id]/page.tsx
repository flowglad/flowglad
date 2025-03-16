import CheckoutPage from '@/components/CheckoutPage'
import { adminTransaction } from '@/db/databaseMethods'
import { selectCustomerProfileById } from '@/db/tableMethods/customerProfileMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import {
  BillingInfoCore,
  billingInfoSchema,
} from '@/db/tableMethods/purchaseMethods'
import { selectPurchaseSessionById } from '@/db/tableMethods/purchaseSessionMethods'
import { selectVariantProductAndOrganizationByVariantWhere } from '@/db/tableMethods/variantMethods'
import { PurchaseSessionStatus } from '@/types'
import core from '@/utils/core'
import { getPaymentIntent, getSetupIntent } from '@/utils/stripe'
import { notFound, redirect } from 'next/navigation'

const PurchaseSessionPage = async ({
  params,
}: {
  params: Promise<{ id: string }>
}) => {
  const { id } = await params
  const {
    purchaseSession,
    product,
    variant,
    sellerOrganization,
    feeCalculation,
    maybeCustomerProfile,
  } = await adminTransaction(async ({ transaction }) => {
    const purchaseSession = await selectPurchaseSessionById(
      id,
      transaction
    )
    /**
     * Currently, only variant / product checkout flows
     * are supported on this page.
     * For invoice or purchase flows, those should go through their respective
     * pages.
     */
    if (!purchaseSession.variantId) {
      throw new Error(
        `No variant id found for purchase session ${purchaseSession.id}. Currently, only variant / product checkout flows are supported on this page.`
      )
    }
    const [{ product, variant, organization }] =
      await selectVariantProductAndOrganizationByVariantWhere(
        { id: purchaseSession.variantId },
        transaction
      )
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
      purchaseSession,
      product,
      variant,
      sellerOrganization: organization,
      feeCalculation,
      maybeCustomerProfile,
    }
  })

  if (!purchaseSession) {
    notFound()
  }

  if (purchaseSession.status !== PurchaseSessionStatus.Open) {
    if (purchaseSession.stripePaymentIntentId) {
      redirect(
        `/purchase/post-payment?payment_intent=${purchaseSession.stripePaymentIntentId}`
      )
    } else if (purchaseSession.stripeSetupIntentId) {
      redirect(
        `/purchase/post-payment?setup_intent=${purchaseSession.stripeSetupIntentId}`
      )
    } else {
      redirect(
        `/purchase/post-payment?purchase_session=${purchaseSession.id}`
      )
    }
  }
  let clientSecret: string | null = null
  if (purchaseSession.stripePaymentIntentId) {
    const paymentIntent = await getPaymentIntent(
      purchaseSession.stripePaymentIntentId
    )
    clientSecret = paymentIntent.client_secret
  } else if (purchaseSession.stripeSetupIntentId) {
    const setupIntent = await getSetupIntent(
      purchaseSession.stripeSetupIntentId
    )
    clientSecret = setupIntent.client_secret
  } else {
    throw new Error('No client secret found')
  }

  const billingInfo: BillingInfoCore = billingInfoSchema.parse({
    purchaseSession,
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
  })

  return <CheckoutPage billingInfo={billingInfo} />
}

export default PurchaseSessionPage
