import { Price } from '@/db/schema/prices'
import { CheckoutFlowType } from '@/types'
import { PriceType } from '@/types'
import { getPaymentIntent } from './stripe'
import { getSetupIntent } from './stripe'
import { findOrCreateCheckoutSession } from './checkoutSessionState'
import { CheckoutSessionType } from '@/types'
import { selectDiscountById } from '@/db/tableMethods/discountMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { adminTransaction } from '@/db/adminTransaction'
import {
  CheckoutInfoCore,
  checkoutInfoSchema,
  SinglePaymentCheckoutInfoCore,
} from '@/db/tableMethods/purchaseMethods'
import core from './core'
import { Organization } from '@/db/schema/organizations'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import { DbTransaction } from '@/db/types'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { Product } from '@/db/schema/products'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import {
  currentSubscriptionStatuses,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { Customer } from '@/db/schema/customers'

interface CheckoutInfoSuccess {
  checkoutInfo: CheckoutInfoCore
  organization: Organization.Record
  success: true
}

interface CheckoutInfoError {
  checkoutInfo: null
  organization: Organization.Record
  success: false
  error: string
}

type CheckoutInfoResult = CheckoutInfoSuccess | CheckoutInfoError
export async function checkoutInfoForPriceWhere(
  priceWhere: Price.Where
): Promise<CheckoutInfoResult> {
  const result = await adminTransaction(async ({ transaction }) => {
    const [{ product, price, organization }] =
      await selectPriceProductAndOrganizationByPriceWhere(
        priceWhere,
        transaction
      )
    if (!product.active || !price.active) {
      // TODO: ERROR PAGE UI
      return {
        product,
        price,
        organization,
      }
    }
    /**
     * Attempt to get the saved purchase session (from cookies).
     * If not found, or the price id does not match, create a new purchase session
     * and save it to cookies.
     */
    const checkoutSession = await findOrCreateCheckoutSession(
      {
        productId: product.id,
        organizationId: organization.id,
        price,
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
      price,
      organization,
      checkoutSession,
      discount,
      feeCalculation: feeCalculation ?? null,
      maybeCustomer,
    }
  })
  const { checkoutSession, organization } = result
  if (!checkoutSession) {
    // TODO: ERROR PAGE UI
    return {
      checkoutInfo: null,
      success: false,
      organization,
      error: `This checkout link is no longer valid. Please contact the ${organization.name} team for assistance.`,
    }
  }

  let clientSecret: string | null = null
  const { product, price, maybeCustomer, discount, feeCalculation } =
    result
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
  if (price.type === PriceType.SinglePayment) {
    const rawCheckoutInfo: SinglePaymentCheckoutInfoCore = {
      product,
      price,
      sellerOrganization: organization,
      flowType: CheckoutFlowType.SinglePayment,
      redirectUrl: core.safeUrl(
        `/purchase/post-payment`,
        core.envVariable('NEXT_PUBLIC_APP_URL')
      ),
      clientSecret,
      checkoutSession,
      feeCalculation,
    }
    return {
      checkoutInfo: checkoutInfoSchema.parse(rawCheckoutInfo),
      organization,
      success: true,
    }
  }
  if (
    price.type === PriceType.Subscription ||
    price.type === PriceType.Usage
  ) {
    const rawCheckoutInfo: CheckoutInfoCore = {
      checkoutSession,
      product,
      price,
      sellerOrganization: organization,
      flowType: CheckoutFlowType.Subscription,
      redirectUrl: core.safeUrl(
        `/purchase/post-payment`,
        core.envVariable('NEXT_PUBLIC_APP_URL')
      ),
      clientSecret,
      readonlyCustomerEmail: maybeCustomer?.email,
      discount,
      feeCalculation,
    }
    return {
      checkoutInfo: checkoutInfoSchema.parse(rawCheckoutInfo),
      organization,
      success: true,
    }
  }
  throw new Error('Could not derive ')
}

export async function checkoutInfoForCheckoutSession(
  checkoutSessionId: string,
  transaction: DbTransaction
): Promise<{
  checkoutSession: CheckoutSession.Record
  product: Product.Record
  price: Price.Record
  sellerOrganization: Organization.Record
  feeCalculation: FeeCalculation.Record | null
  maybeCustomer: Customer.Record | null
  maybeCurrentSubscriptions: Subscription.Record[] | null
}> {
  const checkoutSession = await selectCheckoutSessionById(
    checkoutSessionId,
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
  const maybeCustomer = checkoutSession.customerId
    ? await selectCustomerById(
        checkoutSession.customerId,
        transaction
      )
    : null
  const maybeCurrentSubscriptions =
    maybeCustomer &&
    !organization.allowMultipleSubscriptionsPerCustomer
      ? await selectSubscriptions(
          {
            customerId: maybeCustomer.id,
            status: currentSubscriptionStatuses,
          },
          transaction
        )
      : null
  return {
    checkoutSession,
    product,
    price,
    sellerOrganization: organization,
    feeCalculation,
    maybeCustomer,
    maybeCurrentSubscriptions,
  }
}
