import { Catalog } from '@/db/schema/catalogs'
import { Customer } from '@/db/schema/customers'
import { Price } from '@/db/schema/prices'
import { Product } from '@/db/schema/products'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { Subscription } from '@/db/schema/subscriptions'
import {
  CurrencyCode,
  IntervalUnit,
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
      ? {
          city: stripeCustomer.address.city,
          country: stripeCustomer.address.country,
          line1: stripeCustomer.address.line1,
          line2: stripeCustomer.address.line2,
          postal_code: stripeCustomer.address.postal_code,
        }
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
    currency: stripePrice.currency as CurrencyCode,
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

export const stripeSubscriptionToSubscriptionInsert = (
  stripeSubscription: Stripe.Subscription,
  customer: Customer.Record,
  params: CoreMigrationParams
): Subscription.Insert => {
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
    name: stripeSubscription.items.data[0].plan.nickname ?? '',
    billingCycleAnchorDate: new Date(
      stripeSubscription.billing_cycle_anchor
    ),
    metadata: stripeSubscription.metadata,
    customerId: customer.id,
    defaultPaymentMethodId: stripeSubscription.default_payment_method
      ? stripeIdFromObjectOrId(
          stripeSubscription.default_payment_method
        )
      : null,
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
    cancelScheduledAt: null,
    runBillingAtPeriodStart: null,
    priceId: null,
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
