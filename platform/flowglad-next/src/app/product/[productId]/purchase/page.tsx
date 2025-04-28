import CheckoutPage from '@/components/CheckoutPage'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectDiscountById } from '@/db/tableMethods/discountMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { billingInfoSchema } from '@/db/tableMethods/purchaseMethods'
import { selectDefaultPriceAndProductByProductId } from '@/db/tableMethods/priceMethods'
import {
  CheckoutFlowType,
  PriceType,
  CheckoutSessionType,
} from '@/types'
import core from '@/utils/core'
import { findOrCreateCheckoutSession } from '@/utils/checkoutSessionState'
import { getPaymentIntent, getSetupIntent } from '@/utils/stripe'
import { Price } from '@/db/schema/prices'

interface PurchasePageProps {
  params: Promise<{
    productId: string
  }>
}

const PurchasePage = async ({ params }: PurchasePageProps) => {
  const { productId } = await params
  const {
    product,
    price,
    organization,
    checkoutSession,
    discount,
    feeCalculation,
    maybeCustomer,
  } = await adminTransaction(async ({ transaction }) => {
    const { product, defaultPrice } =
      await selectDefaultPriceAndProductByProductId(
        productId,
        transaction
      )
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
     * If not found, or the price id does not match, create a new purchase session
     * and save it to cookies.
     */
    const checkoutSession = await findOrCreateCheckoutSession(
      {
        productId: product.id,
        organizationId: organization.id,
        price: defaultPrice as Price.Record,
        type: CheckoutSessionType.Product,
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
      {
        checkoutSessionId: checkoutSession.id,
      },
      transaction
    )
    const maybeCustomer = checkoutSession.customerId
      ? await selectCustomerById(
          checkoutSession.customerId,
          transaction
        )
      : null
    return {
      product,
      price: defaultPrice,
      organization,
      checkoutSession,
      discount,
      feeCalculation: feeCalculation ?? null,
      maybeCustomer,
    }
  })

  if (!product.active) {
    // TODO: ERROR PAGE UI
    return <div>Product is not active</div>
  }

  if (!checkoutSession) {
    return <div>Purchase session not found</div>
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
  }
  const billingInfo = billingInfoSchema.parse({
    checkoutSession,
    product,
    price,
    sellerOrganization: organization,
    flowType:
      price.type === PriceType.SinglePayment
        ? CheckoutFlowType.SinglePayment
        : CheckoutFlowType.Subscription,
    redirectUrl: core.safeUrl(
      `/purchase/post-payment`,
      core.envVariable('NEXT_PUBLIC_APP_URL')
    ),
    clientSecret,
    billingAddress: checkoutSession.billingAddress,
    readonlyCustomerEmail: maybeCustomer?.email,
    discount,
    feeCalculation,
  })

  return <CheckoutPage billingInfo={billingInfo} />
}

export default PurchasePage
