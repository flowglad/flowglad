import { Catalog } from '@/db/schema/catalogs'
import { Customer } from '@/db/schema/customers'
import { BillingAddress } from '@/db/schema/organizations'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Price } from '@/db/schema/prices'
import { Product } from '@/db/schema/products'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { Subscription } from '@/db/schema/subscriptions'
import { selectBillingPeriods } from '@/db/tableMethods/billingPeriodMethods'
import { selectSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import { isSubscriptionInTerminalState } from '@/db/tableMethods/subscriptionMethods'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'
import { createBillingPeriodAndItems } from '@/subscriptions/billingPeriodHelpers'
import type { DbTransaction } from '@/db/types'
import {
  CurrencyCode,
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import {
  stripeIdFromObjectOrId,
  dateFromStripeTimestamp,
} from '@/utils/stripe'
import Stripe from 'stripe'

interface CoreMigrationParams {
  organizationId: string
  livemode: boolean
}

export const stripeCustomerToCustomerInsert = (
  stripeCustomer: Stripe.Customer,
  params: CoreMigrationParams
): Customer.Insert => {
  return {
    stripeCustomerId: stripeCustomer.id,
    name: stripeCustomer.name ?? stripeCustomer.email ?? '',
    organizationId: params.organizationId,
    livemode: stripeCustomer.livemode,
    email: stripeCustomer.email!,
    externalId: stripeCustomer.id,
    billingAddress: stripeCustomer.address
      ? ({
          name: stripeCustomer.name ?? stripeCustomer.email ?? '',
          address: {
            city: stripeCustomer.address.city,
            country: stripeCustomer.address.country,
            line1: stripeCustomer.address.line1,
            line2: stripeCustomer.address.line2,
            postal_code: stripeCustomer.address.postal_code,
            state: stripeCustomer.address.state,
          },
        } as BillingAddress)
      : undefined,
  }
}

export const stripeProductToProductInsert = (
  stripeProduct: Stripe.Product,
  catalog: Catalog.Record,
  params: CoreMigrationParams
): Product.Insert => {
  return {
    name: stripeProduct.name,
    livemode: stripeProduct.livemode,
    description: stripeProduct.description ?? '',
    organizationId: params.organizationId,
    catalogId: catalog.id,
    externalId: stripeProduct.id,
    active: stripeProduct.active,
    imageURL: stripeProduct.images?.[0] ?? '',
    displayFeatures:
      stripeProduct.marketing_features?.map((feature) => ({
        enabled: true,
        label: feature.name ?? '',
        details: '',
      })) ?? [],
    singularQuantityLabel: stripeProduct.unit_label ?? '',
    pluralQuantityLabel: stripeProduct.unit_label
      ? `${stripeProduct.unit_label}s`
      : null,
  }
}

const stripePriceToFlowgladPriceType = (
  stripePrice: Stripe.Price
): PriceType => {
  if (stripePrice.type === 'one_time') {
    return PriceType.SinglePayment
  }
  const recurring = stripePrice.recurring
  if (!recurring) {
    throw new Error(
      `Received a price with type "recurring" but no "recurring" object. id: ${stripePrice.id}`
    )
  }
  const usageType = recurring.usage_type
  return usageType === 'metered'
    ? PriceType.Usage
    : PriceType.Subscription
}

export const stripePriceToPriceInsert = (
  stripePrice: Stripe.Price,
  stripeProduct: Stripe.Product,
  product: Product.Record,
  params: CoreMigrationParams
): Price.Insert => {
  const type = stripePriceToFlowgladPriceType(stripePrice)
  const coreParams = {
    productId: product.id,
    externalId: stripePrice.id,
    livemode: stripePrice.livemode,
    currency: stripePrice.currency.toUpperCase() as CurrencyCode,
    unitPrice: stripePrice.unit_amount ?? 0,
    active: stripePrice.active,
    name: stripePrice.nickname ?? '',
  } as const
  if (type === PriceType.SinglePayment) {
    const singlePaymentPrice: Price.SinglePaymentInsert = {
      ...coreParams,
      intervalUnit: null,
      intervalCount: null,
      active: stripePrice.active,
      name: stripePrice.nickname ?? '',
      type,
      trialPeriodDays: null,
      setupFeeAmount: null,
      isDefault: stripeProduct.default_price === stripePrice.id,
      usageMeterId: null,
    }
    return singlePaymentPrice
  }
  if (!stripePrice.recurring) {
    throw new Error(
      'Subscription price must have a recurring interval'
    )
  }
  if (type === PriceType.Subscription) {
    const subscriptionPrice: Price.SubscriptionInsert = {
      ...coreParams,
      intervalUnit: stripePrice.recurring.interval as IntervalUnit,
      intervalCount: stripePrice.recurring?.interval_count!,
      type,
      trialPeriodDays:
        stripePrice.recurring?.trial_period_days ?? null,
      setupFeeAmount: null,
      isDefault: stripeProduct.default_price === stripePrice.id,
      usageMeterId: null,
    }
    return subscriptionPrice
  }
  throw new Error('Invalid price type')
}

const stripeSubscriptionToSubscriptionStatus = (
  stripeSubscription: Stripe.Subscription
): SubscriptionStatus => {
  switch (stripeSubscription.status) {
    case 'active':
      return SubscriptionStatus.Active
    case 'canceled':
      return SubscriptionStatus.Canceled
    case 'incomplete':
      return SubscriptionStatus.Incomplete
    case 'incomplete_expired':
      return SubscriptionStatus.IncompleteExpired
    case 'past_due':
      return SubscriptionStatus.PastDue
    case 'paused':
      return SubscriptionStatus.Paused
    case 'trialing':
      return SubscriptionStatus.Trialing
    case 'unpaid':
      return SubscriptionStatus.Unpaid
    default:
      throw new Error(
        `Received a subscription with status "${stripeSubscription.status}". id: ${stripeSubscription.id}`
      )
  }
}

const paymentMethodRecordForStripeSubscription = async (
  stripe: Stripe,
  stripeSubscription: Stripe.Subscription,
  paymentMethodRecords: PaymentMethod.Record[]
): Promise<PaymentMethod.Record | null> => {
  if (!stripeSubscription.default_payment_method) {
    return null
  }
  if (paymentMethodRecords.length === 0) {
    return null
  }
  if (paymentMethodRecords.length === 1) {
    return paymentMethodRecords[0]
  }
  if (typeof stripeSubscription.default_payment_method === 'string') {
    const stripeSubscriptionPaymentMethod =
      await stripe.paymentMethods.retrieve(
        stripeSubscription.default_payment_method
      )
    const { externalIdPrefix } = getPaymentMethodDataAndExternalId(
      stripeSubscriptionPaymentMethod
    )
    return (
      paymentMethodRecords.find((paymentMethod) =>
        paymentMethod.externalId!.startsWith(externalIdPrefix)
      ) ?? null
    )
  }
  const stripeSubscriptionPaymentMethod =
    stripeSubscription.default_payment_method
  const { externalId } = getPaymentMethodDataAndExternalId(
    stripeSubscriptionPaymentMethod
  )
  return (
    paymentMethodRecords.find(
      (paymentMethod) => paymentMethod.externalId === externalId
    ) ?? null
  )
}

export const getPaymentMethodDataAndExternalId = (
  stripePaymentMethod: Stripe.PaymentMethod
): {
  /**
   * Used as a way to help identify the correct platform payment method
   * to correspond to the correct connected account payment method
   * for a given subscription.
   *
   * We need to do this because payment method ids are not copied across
   * source account -> destination account when copying payment data.
   */
  externalIdPrefix: string
  externalId: string
  paymentMethodData: {}
} => {
  if (
    stripePaymentMethod.type !== 'link' &&
    stripePaymentMethod.type !== 'card'
  ) {
    throw new Error(
      `Received non link non card stripe payment method. id: ${stripePaymentMethod.id}`
    )
  }
  if (stripePaymentMethod.type === 'link') {
    const externalIdPrefix = `${stripePaymentMethod.link?.email}__${stripeIdFromObjectOrId(stripePaymentMethod.customer!)}`
    return {
      externalIdPrefix,
      externalId: `${externalIdPrefix}__${stripeIdFromObjectOrId(stripePaymentMethod.id!)}`,
      paymentMethodData: stripePaymentMethod.link as {},
    }
  }
  const externalIdPrefix = `${stripePaymentMethod.card?.fingerprint}__${stripeIdFromObjectOrId(stripePaymentMethod.customer!)}`
  return {
    externalIdPrefix,
    externalId: `${externalIdPrefix}__${stripeIdFromObjectOrId(stripePaymentMethod.id!)}`,
    paymentMethodData: stripePaymentMethod.card as {},
  }
}
export const stripePaymentMethodToPaymentMethodInsert = (
  stripePaymentMethod: Stripe.PaymentMethod,
  customer: Customer.Record,
  params: CoreMigrationParams
): PaymentMethod.Insert => {
  if (
    stripePaymentMethod.type !== 'link' &&
    stripePaymentMethod.type !== 'card'
  ) {
    console.log(
      'card stripePaymentMethod without `card` prop:',
      stripePaymentMethod
    )
    throw new Error(
      `Received a payment method with no "card" object. id: ${stripePaymentMethod.id}`
    )
  }
  const { externalId, paymentMethodData } =
    getPaymentMethodDataAndExternalId(stripePaymentMethod)
  // Sometimes billing_details.address.country may not be defined (e.g. if they only have a postal code check)
  // but we need the country for determining card origin for fee calculations
  const billingDetails = {
    ...(stripePaymentMethod.billing_details as unknown as PaymentMethod.ClientInsert['billingDetails']),
    address: {
      ...(stripePaymentMethod.billing_details?.address || {}),
      country:
        stripePaymentMethod.billing_details?.address?.country ||
        (stripePaymentMethod.type === 'card'
          ? stripePaymentMethod.card?.country
          : null),
    },
  } as PaymentMethod.ClientInsert['billingDetails']
  return {
    livemode: stripePaymentMethod.livemode,
    type: stripePaymentMethod.type as PaymentMethodType,
    default: false,
    metadata: stripePaymentMethod.metadata,
    customerId: customer.id,
    paymentMethodData,
    billingDetails,
    stripePaymentMethodId: stripePaymentMethod.id,
    externalId,
  }
}

export const stripeSubscriptionToSubscriptionInsert = async (
  stripeSubscription: Stripe.Subscription,
  customer: Customer.Record,
  paymentMethodsForCustomer: PaymentMethod.Record[],
  price: Price.Record,
  params: CoreMigrationParams,
  stripe: Stripe
): Promise<Subscription.Insert> => {
  const defaultPaymentMethod =
    await paymentMethodRecordForStripeSubscription(
      stripe,
      stripeSubscription,
      paymentMethodsForCustomer
    )
  return {
    externalId: stripeSubscription.id,
    livemode: stripeSubscription.livemode,
    organizationId: params.organizationId,
    interval: stripeSubscription.items.data[0].plan
      .interval as IntervalUnit,
    intervalCount:
      stripeSubscription.items.data[0].plan.interval_count!,
    status: stripeSubscriptionToSubscriptionStatus(
      stripeSubscription
    ),
    startDate: dateFromStripeTimestamp(stripeSubscription.start_date),
    name: stripeSubscription.items.data[0].plan.nickname ?? '',
    billingCycleAnchorDate: new Date(
      stripeSubscription.billing_cycle_anchor
    ),
    metadata: stripeSubscription.metadata,
    customerId: customer.id,
    defaultPaymentMethodId: defaultPaymentMethod?.id ?? null,
    backupPaymentMethodId: null,
    trialEnd: stripeSubscription.trial_end
      ? dateFromStripeTimestamp(stripeSubscription.trial_end)
      : null,
    currentBillingPeriodStart: dateFromStripeTimestamp(
      stripeSubscription.current_period_start
    ),
    currentBillingPeriodEnd: dateFromStripeTimestamp(
      stripeSubscription.current_period_end
    ),
    canceledAt: stripeSubscription.canceled_at
      ? dateFromStripeTimestamp(stripeSubscription.canceled_at)
      : null,
    stripeSetupIntentId: null,
    cancelScheduledAt: stripeSubscription.cancel_at
      ? dateFromStripeTimestamp(stripeSubscription.cancel_at)
      : null,
    runBillingAtPeriodStart: null,
    priceId: price.id,
  }
}

export const stripeSubscriptionItemToSubscriptionItemInsert = (
  stripeSubscriptionItem: Stripe.SubscriptionItem,
  subscription: Subscription.Record,
  price: Price.Record,
  params: CoreMigrationParams
): SubscriptionItem.Insert => {
  return {
    livemode: params.livemode,
    subscriptionId: subscription.id,
    priceId: price.id,
    name: stripeSubscriptionItem.plan.nickname ?? '',
    metadata: stripeSubscriptionItem.metadata,
    unitPrice: stripeSubscriptionItem.plan.amount ?? 0,
    quantity: stripeSubscriptionItem.quantity ?? 0,
    addedDate: new Date(),
    externalId: stripeSubscriptionItem.id,
  }
}
