import CheckoutPage from '@/components/CheckoutPage'
import { adminTransaction } from '@/db/databaseMethods'
import { selectCustomerProfileById } from '@/db/tableMethods/customerProfileMethods'
import { selectDiscountById } from '@/db/tableMethods/discountMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  BillingInfoCore,
  billingInfoSchema,
} from '@/db/tableMethods/purchaseMethods'
import { selectDefaultVariantAndProductByProductId } from '@/db/tableMethods/variantMethods'
import {
  CheckoutFlowType,
  PriceType,
  PurchaseSessionType,
} from '@/types'
import core from '@/utils/core'
import { findOrCreatePurchaseSession } from '@/utils/purchaseSessionState'
import { getPaymentIntent, getSetupIntent } from '@/utils/stripe'

interface PurchasePageProps {
  params: Promise<{
    id: string
  }>
}

const PurchasePage = async ({ params }: PurchasePageProps) => {
  const { id } = await params
  const {
    product,
    variant,
    organization,
    purchaseSession,
    discount,
    feeCalculation,
    maybeCustomerProfile,
  } = await adminTransaction(async ({ transaction }) => {
    const { product, variant } =
      await selectDefaultVariantAndProductByProductId(id, transaction)
    if (!product.active) {
      // TODO: ERROR PAGE UI
      return {
        product,
      }
    }
    const organization = await selectOrganizationById(
      product.organizationId,
      transaction
    )

    /**
     * Attempt to get the saved purchase session (from cookies).
     * If not found, or the variant id does not match, create a new purchase session
     * and save it to cookies.
     */
    const purchaseSession = await findOrCreatePurchaseSession(
      {
        productId: product.id,
        organizationId: organization.id,
        variant,
        type: PurchaseSessionType.Product,
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
      {
        PurchaseSessionId: purchaseSession.id,
      },
      transaction
    )
    const maybeCustomerProfile = purchaseSession.customerProfileId
      ? await selectCustomerProfileById(
          purchaseSession.customerProfileId,
          transaction
        )
      : null
    return {
      product,
      variant,
      organization,
      purchaseSession,
      discount,
      feeCalculation: feeCalculation ?? null,
      maybeCustomerProfile,
    }
  })

  if (!product.active) {
    // TODO: ERROR PAGE UI
    return <div>Product is not active</div>
  }

  if (!purchaseSession) {
    return <div>Purchase session not found</div>
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
  }
  const billingInfo = billingInfoSchema.parse({
    purchaseSession,
    product,
    variant,
    sellerOrganization: organization,
    flowType:
      variant.priceType === PriceType.SinglePayment
        ? CheckoutFlowType.SinglePayment
        : CheckoutFlowType.Subscription,
    redirectUrl: core.safeUrl(
      `/purchase/post-payment`,
      core.envVariable('NEXT_PUBLIC_APP_URL')
    ),
    clientSecret,
    billingAddress: purchaseSession.billingAddress,
    readonlyCustomerEmail: maybeCustomerProfile?.email,
    discount,
    feeCalculation,
  })

  return <CheckoutPage billingInfo={billingInfo} />
}

export default PurchasePage
