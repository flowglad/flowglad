import { Customer } from '@/db/schema/customers'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Subscription } from '@/db/schema/subscriptions'
import { Price } from '@/db/schema/prices'
import {
  insertSubscription,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import { IntervalUnit, SubscriptionStatus } from '@/types'
import { DbTransaction } from '@/db/types'
import { generateNextBillingPeriod } from './billingIntervalHelpers'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import {
  bulkInsertSubscriptionItems,
  selectRichSubscriptions,
  selectSubscriptionAndItems,
  selectSubscriptionItemsAndSubscriptionBysubscriptionId,
} from '@/db/tableMethods/subscriptionItemMethods'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { createBillingPeriodAndItems } from './billingPeriodHelpers'
import { createBillingRun } from './billingRunHelpers'
import { attemptBillingRunTask } from '@/trigger/attempt-billing-run'
import { isNil } from '@/utils/core'
import {
  selectBillingPeriodAndItemsByBillingPeriodWhere,
  selectBillingPeriodAndItemsForDate,
} from '@/db/tableMethods/billingPeriodItemMethods'
import { selectBillingRuns } from '@/db/tableMethods/billingRunMethods'
import { CheckoutSession } from '@/db/schema/checkoutSessions'

export interface CreateSubscriptionParams {
  organization: Organization.Record
  customer: Customer.Record
  product: Product.Record
  price: Price.Record
  quantity: number
  livemode: boolean
  startDate: Date
  interval: IntervalUnit
  intervalCount: number
  trialEnd?: Date
  stripeSetupIntentId: string
  metadata?: CheckoutSession.OutputMetadata
  name?: string
  defaultPaymentMethod: PaymentMethod.Record
  backupPaymentMethod?: PaymentMethod.Record
}

export const insertSubscriptionAndItems = async (
  {
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
  }: CreateSubscriptionParams,
  transaction: DbTransaction
) => {
  const currentBillingPeriod = generateNextBillingPeriod({
    billingCycleAnchorDate: startDate,
    interval,
    intervalCount,
    lastBillingPeriodEndDate: null,
    trialEnd,
  })

  const subscriptionInsert: Subscription.Insert = {
    organizationId: organization.id,
    customerId: customer.id,
    priceId: price.id,
    livemode,
    status: SubscriptionStatus.Incomplete,
    defaultPaymentMethodId: defaultPaymentMethod.id,
    backupPaymentMethodId: backupPaymentMethod?.id ?? null,
    cancelScheduledAt: null,
    canceledAt: null,
    metadata: metadata ?? null,
    trialEnd: trialEnd ?? null,
    name:
      subscriptionName ??
      `${product.name}${price.name ? ` - ${price.name}` : ''}`,
    currentBillingPeriodStart: currentBillingPeriod.startDate,
    currentBillingPeriodEnd: currentBillingPeriod.endDate,
    billingCycleAnchorDate: startDate,
    interval,
    intervalCount,
    stripeSetupIntentId,
  }

  const subscription = await insertSubscription(
    subscriptionInsert,
    transaction
  )

  const subscriptionItemInsert: SubscriptionItem.Insert = {
    name: `${price.name} x ${quantity}`,
    subscriptionId: subscription.id,
    priceId: price.id,
    addedDate: startDate,
    quantity,
    livemode,
    unitPrice: price.unitPrice,
    metadata: null,
  }

  const subscriptionItems = await bulkInsertSubscriptionItems(
    [subscriptionItemInsert],
    transaction
  )

  return { subscription, subscriptionItems }
}

const subscriptionForSetupIntent = async (
  stripeSetupIntentId: string,
  transaction: DbTransaction
) => {
  const [existingSubscriptionAndItemsForSetupIntent] =
    await selectRichSubscriptions(
      {
        stripeSetupIntentId,
      },
      transaction
    )
  if (existingSubscriptionAndItemsForSetupIntent) {
    return {
      subscription: existingSubscriptionAndItemsForSetupIntent,
      subscriptionItems:
        existingSubscriptionAndItemsForSetupIntent.subscriptionItems,
    }
  }
  return null
}

const safelyProcessCreationForExistingSubscription = async (
  params: CreateSubscriptionParams,
  subscription: Subscription.Record,
  subscriptionItems: SubscriptionItem.Record[],
  transaction: DbTransaction
) => {
  const billingPeriodAndItems =
    await selectBillingPeriodAndItemsByBillingPeriodWhere(
      {
        subscriptionId: subscription.id,
      },
      transaction
    )
  if (!billingPeriodAndItems) {
    throw new Error('Billing period and items not found')
  }
  const { billingPeriod } = billingPeriodAndItems
  const [existingBillingRun] = await selectBillingRuns(
    {
      billingPeriodId: billingPeriod.id,
    },
    transaction
  )
  const billingRun =
    existingBillingRun ??
    (await createBillingRun(
      {
        billingPeriod,
        paymentMethodId: params.defaultPaymentMethod.id,
        scheduledFor: subscription.currentBillingPeriodStart,
      },
      transaction
    ))
  await attemptBillingRunTask.trigger({
    billingRun,
  })
  return {
    subscription,
    subscriptionItems,
    billingPeriod: billingPeriodAndItems.billingPeriod,
    billingPeriodItems: billingPeriodAndItems.billingPeriodItems,
    billingRun,
  }
}

export const createSubscriptionWorkflow = async (
  params: CreateSubscriptionParams,
  transaction: DbTransaction
) => {
  const { customer, defaultPaymentMethod, backupPaymentMethod } =
    params
  const activeSubscriptionsForCustomer = await selectSubscriptions(
    {
      customerId: customer.id,
      status: SubscriptionStatus.Active,
    },
    transaction
  )
  if (activeSubscriptionsForCustomer.length > 0) {
    throw new Error('Customer already has an active subscription')
  }
  if (customer.id !== defaultPaymentMethod.customerId) {
    throw new Error(
      `Customer ${customer.id} does not match default payment method ${defaultPaymentMethod.customerId}`
    )
  }
  if (
    backupPaymentMethod &&
    customer.id !== backupPaymentMethod.customerId
  ) {
    throw new Error(
      `Customer ${customer.id} does not match backup payment method ${backupPaymentMethod.customerId}`
    )
  }

  const existingSubscription = await selectSubscriptionAndItems(
    {
      stripeSetupIntentId: params.stripeSetupIntentId,
    },
    transaction
  )

  if (existingSubscription) {
    return safelyProcessCreationForExistingSubscription(
      params,
      existingSubscription.subscription,
      existingSubscription.subscriptionItems,
      transaction
    )
  }

  const { subscription, subscriptionItems } =
    await insertSubscriptionAndItems(params, transaction)
  const { billingPeriod, billingPeriodItems } =
    await createBillingPeriodAndItems(
      {
        subscription,
        subscriptionItems,
        trialPeriod: !!subscription.trialEnd,
        isInitialBillingPeriod: true,
      },
      transaction
    )
  /**
   * create a billing run, set to to execute
   */
  const billingRun = await createBillingRun(
    {
      billingPeriod,
      paymentMethodId: params.defaultPaymentMethod.id,
      scheduledFor: subscription.currentBillingPeriodStart,
    },
    transaction
  )

  await attemptBillingRunTask.trigger({
    billingRun,
  })

  return {
    subscription,
    subscriptionItems,
    billingPeriod,
    billingPeriodItems,
    billingRun,
  }
}
