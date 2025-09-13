import {
  insertSubscription,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import {
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
  SubscriptionItemType,
} from '@/types'
import { DbTransaction } from '@/db/types'
import { generateNextBillingPeriod } from '../billingIntervalHelpers'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { bulkInsertSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import { isPriceTypeSubscription } from '@/db/tableMethods/priceMethods'
import { CreateSubscriptionParams } from './types'
import { deriveSubscriptionStatus } from './helpers'
import { Subscription } from '@/db/schema/subscriptions'

export const createStandardSubscriptionAndItems = async (
  params: CreateSubscriptionParams,
  currentBillingPeriod: {
    startDate: Date
    endDate: Date
  },
  transaction: DbTransaction
) => {
  const {
    organization,
    customer,
    price,
    product,
    quantity,
    livemode,
    startDate,
    interval,
    intervalCount,
    defaultPaymentMethod,
    backupPaymentMethod,
    trialEnd,
    name: subscriptionName,
    stripeSetupIntentId,
    metadata,
    autoStart = false,
    billingCycleAnchorDate,
  } = params
  const derivedInterval = interval ?? price.intervalUnit
  const derivedIntervalCount = intervalCount ?? price.intervalCount
  if (!derivedInterval) {
    throw new Error('Interval is required for standard subscriptions')
  }
  if (!derivedIntervalCount) {
    throw new Error(
      'Interval count is required for standard subscriptions'
    )
  }
  const subscriptionInsert: Subscription.StandardInsert = {
    organizationId: organization.id,
    customerId: customer.id,
    priceId: price.id,
    livemode,
    status: deriveSubscriptionStatus({
      autoStart,
      trialEnd,
      defaultPaymentMethodId: defaultPaymentMethod?.id,
      isDefaultPlan: product.default,
    }),
    isFreePlan: price.unitPrice === 0,
    cancellationReason: null,
    replacedBySubscriptionId: null,
    defaultPaymentMethodId: defaultPaymentMethod?.id ?? null,
    backupPaymentMethodId: backupPaymentMethod?.id ?? null,
    cancelScheduledAt: null,
    canceledAt: null,
    metadata: metadata ?? null,
    trialEnd: trialEnd ?? null,
    /**
     * For subscription prices, billing runs at the start of each period
     * For usage-based prices, billing runs at the end of each period after usage is collected
     */
    runBillingAtPeriodStart:
      price.type === PriceType.Subscription ? true : false,
    name:
      subscriptionName ??
      `${product.name}${price.name ? ` - ${price.name}` : ''}`,
    currentBillingPeriodStart: currentBillingPeriod.startDate,
    currentBillingPeriodEnd: currentBillingPeriod.endDate,
    billingCycleAnchorDate: billingCycleAnchorDate || startDate,
    interval: derivedInterval,
    intervalCount: derivedIntervalCount,
    stripeSetupIntentId: stripeSetupIntentId ?? null,
    externalId: null,
    startDate,
    renews: true,
  }

  const subscription = await insertSubscription(
    subscriptionInsert,
    transaction
  )
  const subscriptionItemInsert: SubscriptionItem.Insert = {
    name: `${price.name}${quantity > 1 ? ` x ${quantity}` : ''}`,
    subscriptionId: subscription.id,
    priceId: price.id,
    addedDate: startDate,
    quantity,
    livemode,
    unitPrice: price.unitPrice,
    metadata: null,
    externalId: null,
    expiredAt: null,
    type: SubscriptionItemType.Static,
    usageMeterId: null,
    usageEventsPerUnit: null,
  }

  const subscriptionItems = await bulkInsertSubscriptionItems(
    [subscriptionItemInsert],
    transaction
  )

  return { subscription, subscriptionItems }
}

export const createNonRenewingSubscriptionAndItems = async (
  params: CreateSubscriptionParams,
  transaction: DbTransaction
) => {
  const {
    organization,
    customer,
    price,
    product,
    quantity,
    livemode,
    startDate,
    name: subscriptionName,
    stripeSetupIntentId,
    metadata,
  } = params
  if (!product.default && price.type !== PriceType.Subscription) {
    throw new Error(
      `Price ${price.id} is not a subscription price. Non-renewing subscriptions must have a subscription price. Received price type: ${price.type}`
    )
  }
  const subscriptionInsert: Subscription.NonRenewingInsert = {
    organizationId: organization.id,
    customerId: customer.id,
    priceId: price.id,
    livemode,
    isFreePlan: price.unitPrice === 0,
    cancellationReason: null,
    replacedBySubscriptionId: null,
    status: SubscriptionStatus.Active,
    defaultPaymentMethodId: null,
    backupPaymentMethodId: null,
    cancelScheduledAt: null,
    canceledAt: null,
    metadata: metadata ?? null,
    trialEnd: null,
    /**
     * Credit trial subscriptions do not "run billing"
     */
    runBillingAtPeriodStart: false,
    name:
      subscriptionName ??
      `${product.name}${price.name ? ` - ${price.name}` : ''}`,
    currentBillingPeriodStart: null,
    currentBillingPeriodEnd: null,
    billingCycleAnchorDate: null,
    interval: null,
    intervalCount: null,
    stripeSetupIntentId: stripeSetupIntentId ?? null,
    externalId: null,
    startDate,
    renews: false,
  }

  const subscription = await insertSubscription(
    subscriptionInsert,
    transaction
  )

  const subscriptionItemInsert: SubscriptionItem.StaticInsert = {
    name: `${price.name}${quantity > 1 ? ` x ${quantity}` : ''}`,
    subscriptionId: subscription.id,
    priceId: price.id,
    addedDate: startDate,
    quantity,
    livemode,
    unitPrice: price.unitPrice,
    metadata: null,
    externalId: null,
    expiredAt: null,
    type: SubscriptionItemType.Static,
    usageMeterId: null,
    usageEventsPerUnit: null,
  }

  const subscriptionItems = await bulkInsertSubscriptionItems(
    [subscriptionItemInsert],
    transaction
  )

  return { subscription, subscriptionItems }
}

export const insertSubscriptionAndItems = async (
  params: CreateSubscriptionParams,
  transaction: DbTransaction
) => {
  const {
    price,
    startDate,
    interval,
    intervalCount,
    trialEnd,
    billingCycleAnchorDate,
    preservedBillingPeriodEnd,
    preservedBillingPeriodStart,
    product,
  } = params
  if (price.productId !== product.id) {
    throw new Error(
      `insertSubscriptionAndItems: Price ${price.id} is not associated with product ${product.id}`
    )
  }

  if (!isPriceTypeSubscription(price.type) && !product.default) {
    throw new Error('Price is not a subscription')
  }
  if (product.default && !isPriceTypeSubscription(price.type)) {
    return await createNonRenewingSubscriptionAndItems(
      params,
      transaction
    )
  }
  if (price.startsWithCreditTrial) {
    return await createNonRenewingSubscriptionAndItems(
      params,
      transaction
    )
  }

  const derivedInterval = interval ?? price.intervalUnit
  const derivedIntervalCount = intervalCount ?? price.intervalCount
  if (!derivedInterval) {
    throw new Error('Interval is required for standard subscriptions')
  }
  if (!derivedIntervalCount) {
    throw new Error(
      'Interval count is required for standard subscriptions'
    )
  }
  // Use provided anchor date or default to start date
  const actualBillingCycleAnchor = billingCycleAnchorDate || startDate

  let currentBillingPeriod = generateNextBillingPeriod({
    billingCycleAnchorDate: actualBillingCycleAnchor,
    subscriptionStartDate: startDate,
    interval: derivedInterval,
    intervalCount: derivedIntervalCount,
    lastBillingPeriodEndDate: null,
    trialEnd,
  })

  // Override the dates if preserving billing cycle
  if (preservedBillingPeriodEnd || preservedBillingPeriodStart) {
    currentBillingPeriod = {
      startDate:
        preservedBillingPeriodStart || currentBillingPeriod.startDate,
      endDate:
        preservedBillingPeriodEnd || currentBillingPeriod.endDate,
    }
  }
  return await createStandardSubscriptionAndItems(
    params,
    currentBillingPeriod,
    transaction
  )
}
