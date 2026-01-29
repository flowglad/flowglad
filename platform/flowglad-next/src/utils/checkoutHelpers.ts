import { CheckoutSessionType, PriceType } from '@db-core/enums'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { Discount } from '@/db/schema/discounts'
import type { Feature } from '@/db/schema/features'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import type { Subscription } from '@/db/schema/subscriptions'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectDiscountById } from '@/db/tableMethods/discountMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { selectFeaturesByProductFeatureWhere } from '@/db/tableMethods/productFeatureMethods'
import {
  type CheckoutInfoCore,
  checkoutInfoSchema,
  type SinglePaymentCheckoutInfoCore,
} from '@/db/tableMethods/purchaseMethods'
import {
  currentSubscriptionStatuses,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import type { DbTransaction } from '@/db/types'
import { CheckoutFlowType } from '@/types'
import { findOrCreateCheckoutSession } from './checkoutSessionState'
import core from './core'
import {
  createCustomerSessionForCheckout,
  getPaymentIntent,
  getSetupIntent,
} from './stripe'

/**
 * Gets the client secret and customer session client secret for a checkout session.
 * Creates a CustomerSession if the customer exists and matches the intent's customer.
 *
 * @param checkoutSession - The checkout session
 * @param customer - The customer (can be null or undefined)
 * @returns Object with clientSecret and customerSessionClientSecret
 */
export async function getClientSecretsForCheckoutSession(
  checkoutSession: CheckoutSession.Record,
  customer: Customer.Record | null | undefined
): Promise<{
  clientSecret: string | null
  customerSessionClientSecret: string | null
}> {
  let clientSecret: string | null = null
  let customerSessionClientSecret: string | null = null

  // Skip CustomerSession for AddPaymentMethod - we don't want to show saved cards
  const shouldCreateCustomerSession =
    checkoutSession.type !== CheckoutSessionType.AddPaymentMethod

  if (checkoutSession.stripePaymentIntentId) {
    const paymentIntent = await getPaymentIntent(
      checkoutSession.stripePaymentIntentId
    )
    clientSecret = paymentIntent.client_secret
    // Only create CustomerSession if customer exists with stripeCustomerId
    // and the PaymentIntent already has the same customer set
    if (
      shouldCreateCustomerSession &&
      customer?.stripeCustomerId &&
      paymentIntent.customer === customer.stripeCustomerId
    ) {
      const customerSessionResult =
        await createCustomerSessionForCheckout(customer)
      if (Result.isOk(customerSessionResult)) {
        customerSessionClientSecret = customerSessionResult.value
      }
    }
  } else if (checkoutSession.stripeSetupIntentId) {
    const setupIntent = await getSetupIntent(
      checkoutSession.stripeSetupIntentId
    )
    clientSecret = setupIntent.client_secret
    // Only create CustomerSession if customer exists with stripeCustomerId
    // and the SetupIntent already has the same customer set
    if (
      shouldCreateCustomerSession &&
      customer?.stripeCustomerId &&
      setupIntent.customer === customer.stripeCustomerId
    ) {
      const customerSessionResult =
        await createCustomerSessionForCheckout(customer)
      if (Result.isOk(customerSessionResult)) {
        customerSessionClientSecret = customerSessionResult.value
      }
    }
  }

  return { clientSecret, customerSessionClientSecret }
}

/**
 * Checks if a customer has already used a trial period.
 * A customer has used a trial if any of their subscriptions (including cancelled ones) have a trialEnd date set.
 *
 * @param customerId - The customer ID to check
 * @param transaction - Database transaction
 * @returns true if customer has used a trial, false otherwise
 */
export const hasCustomerUsedTrial = async (
  customerId: string,
  transaction: DbTransaction
): Promise<boolean> => {
  const subscriptionsForCustomer = await selectSubscriptions(
    {
      customerId,
    },
    transaction
  )

  return subscriptionsForCustomer.some(
    (subscription) => subscription.trialEnd !== null
  )
}

/**
 * Calculates whether a customer is eligible for a trial period.
 * This only checks customer eligibility (whether they've used a trial before),
 * not whether the price has a trial period (that's handled separately).
 *
 * @param price - The price being purchased (used to determine if applicable)
 * @param maybeCustomer - The customer (if exists)
 * @param transaction - Database transaction
 * @returns true if customer is eligible, false if not eligible, undefined if not applicable
 */
export const calculateTrialEligibility = async (
  price: Price.Record,
  maybeCustomer: Customer.Record | null,
  transaction: DbTransaction
): Promise<boolean | undefined> => {
  // FIXME (FG-257): Remove PriceType.Usage handling once usage price checkouts are fully deprecated.
  // The validation in createCheckoutSession.ts (line 244-249) is currently commented out, allowing Usage prices to be checked out.
  // When that validation is re-enabled, remove PriceType.Usage from this check.
  if (
    price.type !== PriceType.Subscription &&
    price.type !== PriceType.Usage
  ) {
    return undefined
  }

  // Anonymous customers are eligible (they haven't used a trial yet)
  if (!maybeCustomer) {
    return true
  }

  // Check if customer has used a trial before
  const hasUsedTrial = await hasCustomerUsedTrial(
    maybeCustomer.id,
    transaction
  )

  // Customer is eligible if they haven't used a trial before
  return !hasUsedTrial
}

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
    // Product checkout requires a product - usage prices (with null product) are not supported here
    if (!product) {
      throw new Error(
        'Product checkout is only supported for product prices (subscription/single payment), not usage prices'
      )
    }
    if (!product.active || !price.active) {
      // FIXME: ERROR PAGE UI
      return {
        product,
        price,
        organization,
        features: [],
      }
    }
    /**
     * Attempt to get the saved purchase session (from cookies).
     * If not found, or the price id does not match, create a new purchase session
     * and save it to cookies.
     */
    const checkoutSessionResult = await findOrCreateCheckoutSession(
      {
        productId: product.id,
        organizationId: organization.id,
        price,
        type: CheckoutSessionType.Product,
      },
      transaction
    )
    if (checkoutSessionResult.status === 'error') {
      return {
        product,
        price,
        organization,
        features: [],
        checkoutSession: null,
        discount: null,
        feeCalculation: null,
        maybeCustomer: null,
        isEligibleForTrial: undefined,
        error: checkoutSessionResult.error,
      }
    }
    const checkoutSession = checkoutSessionResult.value
    const discount = checkoutSession.discountId
      ? (
          await selectDiscountById(
            checkoutSession.discountId,
            transaction
          )
        ).unwrap()
      : null
    const feeCalculation = await selectLatestFeeCalculation(
      {
        checkoutSessionId: checkoutSession.id,
      },
      transaction
    )
    const features = await selectFeaturesByProductFeatureWhere(
      { productId: product.id, expiredAt: null },
      transaction
    )
    const maybeCustomer = checkoutSession.customerId
      ? (
          await selectCustomerById(
            checkoutSession.customerId,
            transaction
          )
        ).unwrap()
      : null

    // Calculate trial eligibility
    const isEligibleForTrial = await calculateTrialEligibility(
      price,
      maybeCustomer,
      transaction
    )

    return {
      product,
      price,
      features: features.map((f) => f.feature),
      organization,
      checkoutSession,
      discount,
      feeCalculation: feeCalculation ?? null,
      maybeCustomer,
      isEligibleForTrial,
    }
  })
  const { checkoutSession, organization, features, error } = result
  if (!checkoutSession || error) {
    // FIXME: ERROR PAGE UI
    return {
      checkoutInfo: null,
      success: false,
      organization,
      error:
        error?.message ??
        `This checkout link is no longer valid. Please contact the ${organization.name} team for assistance.`,
    }
  }

  const {
    product,
    price,
    maybeCustomer,
    discount,
    feeCalculation,
    isEligibleForTrial,
  } = result
  const { clientSecret, customerSessionClientSecret } =
    await getClientSecretsForCheckoutSession(
      checkoutSession,
      maybeCustomer
    )
  if (price.type === PriceType.SinglePayment) {
    const rawCheckoutInfo: SinglePaymentCheckoutInfoCore = {
      product,
      price,
      sellerOrganization: organization,
      flowType: CheckoutFlowType.SinglePayment,
      redirectUrl: core.safeUrl(
        `/purchase/post-payment`,
        core.NEXT_PUBLIC_APP_URL
      ),
      clientSecret,
      customerSessionClientSecret,
      checkoutSession,
      feeCalculation,
      discount,
      features,
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
        core.NEXT_PUBLIC_APP_URL
      ),
      clientSecret,
      customerSessionClientSecret,
      readonlyCustomerEmail: maybeCustomer?.email,
      discount,
      feeCalculation,
      features,
      isEligibleForTrial,
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
  features: Feature.Record[] | null
  discount: Discount.Record | null
  isEligibleForTrial?: boolean
}> {
  const checkoutSession = (
    await selectCheckoutSessionById(checkoutSessionId, transaction)
  ).unwrap()
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
  // Product checkout requires a product - usage prices (with null product) are not supported here
  if (!product) {
    throw new Error(
      'Product checkout is only supported for product prices (subscription/single payment), not usage prices'
    )
  }
  const feeCalculation = await selectLatestFeeCalculation(
    { checkoutSessionId: checkoutSession.id },
    transaction
  )
  const featuresResult = await selectFeaturesByProductFeatureWhere(
    { productId: product.id, expiredAt: null },
    transaction
  )
  const discount = checkoutSession.discountId
    ? (
        await selectDiscountById(
          checkoutSession.discountId,
          transaction
        )
      ).unwrap()
    : null
  const maybeCustomer = checkoutSession.customerId
    ? (
        await selectCustomerById(
          checkoutSession.customerId,
          transaction
        )
      ).unwrap()
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

  // Calculate trial eligibility
  const isEligibleForTrial = await calculateTrialEligibility(
    price,
    maybeCustomer,
    transaction
  )

  return {
    checkoutSession,
    product,
    price,
    discount,
    sellerOrganization: organization,
    feeCalculation,
    maybeCustomer,
    maybeCurrentSubscriptions,
    features: featuresResult.map((f) => f.feature),
    isEligibleForTrial,
  }
}
