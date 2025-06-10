import { Customer } from '@/db/schema/customers'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Subscription } from '@/db/schema/subscriptions'
import { Price } from '@/db/schema/prices'
import {
  currentSubscriptionStatuses,
  insertSubscription,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import {
  FlowgladEventType,
  EventNoun,
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
  SubscriptionItemType,
  LedgerTransactionType,
  FeatureType,
} from '@/types'
import { DbTransaction } from '@/db/types'
import { generateNextBillingPeriod } from './billingIntervalHelpers'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import {
  bulkInsertSubscriptionItems,
  selectSubscriptionAndItems,
} from '@/db/tableMethods/subscriptionItemMethods'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { createBillingPeriodAndItems } from './billingPeriodHelpers'
import { createBillingRun } from './billingRunHelpers'
import { attemptBillingRunTask } from '@/trigger/attempt-billing-run'
import core, { isNil } from '@/utils/core'
import { selectBillingPeriodAndItemsByBillingPeriodWhere } from '@/db/tableMethods/billingPeriodItemMethods'
import { selectBillingRuns } from '@/db/tableMethods/billingRunMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { isPriceTypeSubscription } from '@/db/tableMethods/priceMethods'
import { BillingRun } from '@/db/schema/billingRuns'
import { selectPaymentMethods } from '@/db/tableMethods/paymentMethodMethods'
import { idempotentSendOrganizationSubscriptionCreatedNotification } from '@/trigger/notifications/send-organization-subscription-created-notification'
import { Event } from '@/db/schema/events'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { constructSubscriptionCreatedEventHash } from '@/utils/eventHelpers'
import { bulkInsertLedgerAccountsBySubscriptionIdAndUsageMeterId } from '@/db/tableMethods/ledgerAccountMethods'
import { createSubscriptionFeatureItems } from './subscriptionItemFeatureHelpers'
import { TransactionOutput } from '@/db/transactionEnhacementTypes'
import {
  BillingPeriodTransitionLedgerCommand,
  BillingPeriodTransitionPayload,
} from '@/db/ledgerManager/ledgerManagerTypes'
import { selectFeaturesByProductFeatureWhere } from '@/db/tableMethods/productFeatureMethods'
import { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'

export interface CreateSubscriptionParams {
  organization: Organization.Record
  customer: Pick<
    Customer.Record,
    'id' | 'stripeCustomerId' | 'livemode' | 'organizationId'
  >
  product: Product.Record
  price: Price.Record
  quantity: number
  livemode: boolean
  startDate: Date
  interval: IntervalUnit
  intervalCount: number
  trialEnd?: Date
  stripeSetupIntentId?: string
  metadata?: Subscription.ClientRecord['metadata']
  name?: string
  defaultPaymentMethod?: PaymentMethod.Record
  backupPaymentMethod?: PaymentMethod.Record
  autoStart?: boolean
}

const deriveSubscriptionStatus = ({
  autoStart,
  trialEnd,
  defaultPaymentMethodId,
}: {
  autoStart: boolean
  trialEnd?: Date
  defaultPaymentMethodId?: string
}):
  | SubscriptionStatus.Trialing
  | SubscriptionStatus.Active
  | SubscriptionStatus.Incomplete => {
  if (trialEnd) {
    return SubscriptionStatus.Trialing
  }
  if (autoStart && defaultPaymentMethodId) {
    return SubscriptionStatus.Active
  }
  return SubscriptionStatus.Incomplete
}

const createStandardSubscriptionAndItems = async (
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
  } = params
  const subscriptionInsert: Subscription.StandardInsert = {
    organizationId: organization.id,
    customerId: customer.id,
    priceId: price.id,
    livemode,
    status: deriveSubscriptionStatus({
      autoStart,
      trialEnd,
      defaultPaymentMethodId: defaultPaymentMethod?.id,
    }),
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
    billingCycleAnchorDate: startDate,
    interval,
    intervalCount,
    stripeSetupIntentId: stripeSetupIntentId ?? null,
    externalId: null,
    startDate,
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

const createCreditTrialSubscriptionAndItems = async (
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
    interval,
    intervalCount,
    defaultPaymentMethod,
    backupPaymentMethod,
    trialEnd,
    name: subscriptionName,
    stripeSetupIntentId,
    metadata,
    autoStart = false,
  } = params
  if (price.type !== PriceType.Usage) {
    throw new Error(
      `Price ${price.id} is not a usage price. Credit trial subscriptions must have a usage price. Received: ${JSON.stringify(price)}`
    )
  }
  const subscriptionInsert: Subscription.CreditTrialInsert = {
    organizationId: organization.id,
    customerId: customer.id,
    priceId: price.id,
    livemode,
    status: SubscriptionStatus.CreditTrial,
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
  }

  const subscription = await insertSubscription(
    subscriptionInsert,
    transaction
  )
  const subscriptionItemInsert: SubscriptionItem.UsageInsert = {
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
    type: SubscriptionItemType.Usage,
    usageMeterId: price.usageMeterId!,
    usageEventsPerUnit: 1,
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
    organization,
    customer,
    price,
    product,
    quantity,
    livemode,
    startDate,
    interval,
    intervalCount,
    trialEnd,
  } = params

  const currentBillingPeriod = generateNextBillingPeriod({
    billingCycleAnchorDate: startDate,
    interval,
    intervalCount,
    lastBillingPeriodEndDate: null,
    trialEnd,
  })

  if (!isPriceTypeSubscription(price.type)) {
    throw new Error('Price is not a subscription')
  }
  const featuresForProduct =
    await selectFeaturesByProductFeatureWhere(
      {
        productId: product.id,
      },
      transaction
    )
  // TODO: add back in when we have a way to create credit trial subscriptions
  // const featuresForProductIncludeOneTimeCreditGrant =
  //   featuresForProduct.some(
  //     (feature) =>
  //       feature.feature.type === FeatureType.UsageCreditGrant
  //   )

  return await createStandardSubscriptionAndItems(
    params,
    currentBillingPeriod,
    transaction
  )
}

const safelyProcessCreationForExistingSubscription = async (
  params: CreateSubscriptionParams,
  subscription: Subscription.Record,
  subscriptionItems: SubscriptionItem.Record[],
  transaction: DbTransaction
): Promise<
  TransactionOutput<
    | StandardCreateSubscriptionResult
    | CreditTrialCreateSubscriptionResult
  >
> => {
  if (subscription.status === SubscriptionStatus.CreditTrial) {
    return {
      result: {
        type: 'credit_trial',
        subscription,
        subscriptionItems,
        billingPeriod: null,
        billingPeriodItems: null,
        billingRun: null,
      },
    }
  }

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
  /**
   * If the subscription is set to run billing at period start,
   * we schedule the billing run for the start of the billing period.
   * Otherwise, we schedule the billing run for the end of the billing period.
   */
  const scheduledFor = subscription.runBillingAtPeriodStart
    ? subscription.currentBillingPeriodStart
    : subscription.currentBillingPeriodEnd

  const billingRun: BillingRun.Record | undefined =
    existingBillingRun ??
    (params.defaultPaymentMethod
      ? await createBillingRun(
          {
            billingPeriod,
            paymentMethod: params.defaultPaymentMethod,
            scheduledFor,
          },
          transaction
        )
      : undefined)
  /**
   * Billing timing depends on the price type:
   * - For subscription prices: billing runs at period start
   * - For usage-based prices: billing runs at period end
   */
  if (subscription.runBillingAtPeriodStart && !core.IS_TEST) {
    await attemptBillingRunTask.trigger({
      billingRun,
    })
  }
  return {
    result: {
      type: 'standard',
      subscription,
      subscriptionItems,
      billingPeriod: billingPeriodAndItems.billingPeriod,
      billingPeriodItems: billingPeriodAndItems.billingPeriodItems,
      billingRun,
    },
    eventsToLog: [],
  }
}

const verifyCanCreateSubscription = async (
  params: CreateSubscriptionParams,
  transaction: DbTransaction
) => {
  const { customer, defaultPaymentMethod, backupPaymentMethod } =
    params
  const currentSubscriptionsForCustomer = await selectSubscriptions(
    {
      customerId: customer.id,
      status: currentSubscriptionStatuses,
    },
    transaction
  )
  // if (
  //   stripeSetupIntentId &&
  //   currentSubscriptionsForCustomer.some(
  //     (subscription) => subscription.setupIntent === stripeSetupIntentId
  //   )
  // ) {
  //   return false
  // }
  if (currentSubscriptionsForCustomer.length > 0) {
    const organization = await selectOrganizationById(
      customer.organizationId,
      transaction
    )
    if (!organization.allowMultipleSubscriptionsPerCustomer) {
      throw new Error(
        `Customer ${customer.id} already has an active subscription. Please cancel the existing subscription before creating a new one.`
      )
    }
  }
  if (
    defaultPaymentMethod &&
    customer.id !== defaultPaymentMethod.customerId
  ) {
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
}

const maybeDefaultPaymentMethodForSubscription = async (
  params: {
    customerId: string
    defaultPaymentMethod?: PaymentMethod.Record | null
  },
  transaction: DbTransaction
) => {
  if (params.defaultPaymentMethod) {
    return params.defaultPaymentMethod
  }
  const paymentMethods = await selectPaymentMethods(
    {
      customerId: params.customerId,
    },
    transaction
  )
  if (paymentMethods.length === 0) {
    return null
  }
  const defaultPaymentMethod = paymentMethods.find(
    (paymentMethod) => paymentMethod.default
  )
  return defaultPaymentMethod
    ? defaultPaymentMethod
    : paymentMethods[0]
}

interface StandardCreateSubscriptionResult {
  type: 'standard'
  subscription: Subscription.Record
  subscriptionItems: SubscriptionItem.Record[]
  billingPeriod: BillingPeriod.Record | null
  billingPeriodItems: BillingPeriodItem.Record[] | null
  billingRun: BillingRun.Record | null
}

interface CreditTrialCreateSubscriptionResult {
  type: 'credit_trial'
  subscription: Subscription.Record
  subscriptionItems: SubscriptionItem.Record[]
  billingPeriod: null
  billingPeriodItems: null
  billingRun: null
}

const setupLedgerAccounts = async (
  params: {
    subscription: Subscription.Record
    subscriptionItems: SubscriptionItem.Record[]
    price: Price.Record
  },
  transaction: DbTransaction
) => {
  const { subscription, price } = params
  await bulkInsertLedgerAccountsBySubscriptionIdAndUsageMeterId(
    [
      {
        subscriptionId: subscription.id,
        usageMeterId: price.usageMeterId,
        livemode: subscription.livemode,
        organizationId: subscription.organizationId,
      },
    ],
    transaction
  )
}

const maybeCreateBillingPeriodAndRun = async (
  params: {
    subscription: Subscription.Record
    subscriptionItems: SubscriptionItem.Record[]
    defaultPaymentMethod: PaymentMethod.Record | null
    autoStart: boolean
  },
  transaction: DbTransaction
) => {
  const {
    subscription,
    subscriptionItems,
    defaultPaymentMethod,
    autoStart,
  } = params
  if (subscription.status === SubscriptionStatus.CreditTrial) {
    return {
      billingPeriod: null,
      billingPeriodItems: null,
      billingRun: null,
    }
  }
  const scheduledFor = subscription.runBillingAtPeriodStart
    ? subscription.currentBillingPeriodStart
    : subscription.currentBillingPeriodEnd
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
  const shouldCreateBillingRun =
    defaultPaymentMethod &&
    subscription.runBillingAtPeriodStart &&
    params.autoStart &&
    scheduledFor

  /**
   * create a billing run, set to to execute
   */
  const billingRun = shouldCreateBillingRun
    ? await createBillingRun(
        {
          billingPeriod,
          paymentMethod: defaultPaymentMethod,
          scheduledFor,
        },
        transaction
      )
    : null
  return { billingPeriod, billingPeriodItems, billingRun }
}

const ledgerCommandPayload = (params: {
  subscription: Subscription.Record
  subscriptionItemFeatures: SubscriptionItemFeature.Record[]
  billingPeriod: BillingPeriod.Record | null
  billingPeriodItems: BillingPeriodItem.Record[] | null
  billingRun: BillingRun.Record | null
}): BillingPeriodTransitionPayload => {
  const {
    subscription,
    subscriptionItemFeatures,
    billingPeriod,
    billingPeriodItems,
    billingRun,
  } = params
  if (subscription.status === SubscriptionStatus.CreditTrial) {
    return {
      type: 'credit_trial',
      subscription,
      subscriptionFeatureItems: subscriptionItemFeatures.filter(
        (item) => item.type === FeatureType.UsageCreditGrant
      ),
    }
  }
  if (!billingPeriod) {
    throw new Error('Billing period not found')
  }
  return {
    type: 'standard',
    subscription,
    previousBillingPeriod: null,
    newBillingPeriod: billingPeriod,
    subscriptionFeatureItems: subscriptionItemFeatures.filter(
      (item) => item.type === FeatureType.UsageCreditGrant
    ),
  } as const
}
/**
 * NOTE: as a matter of safety, we do not create a billing run if autoStart is not provided.
 * This is because the subscription will not be active until the organization has started it,
 * and we do not want to create a billing run if the organization has not explicitly opted to start the subscription.
 * @param params
 * @param transaction
 * @returns
 */
export const createSubscriptionWorkflow = async (
  params: CreateSubscriptionParams,
  transaction: DbTransaction
): Promise<
  TransactionOutput<
    | StandardCreateSubscriptionResult
    | CreditTrialCreateSubscriptionResult
  >
> => {
  if (params.stripeSetupIntentId) {
    const existingSubscription = await selectSubscriptionAndItems(
      {
        stripeSetupIntentId: params.stripeSetupIntentId,
      },
      transaction
    )

    if (existingSubscription) {
      return await safelyProcessCreationForExistingSubscription(
        params,
        existingSubscription.subscription,
        existingSubscription.subscriptionItems,
        transaction
      )
    }
  }
  await verifyCanCreateSubscription(params, transaction)
  const defaultPaymentMethod =
    await maybeDefaultPaymentMethodForSubscription(
      {
        customerId: params.customer.id,
        defaultPaymentMethod: params.defaultPaymentMethod,
      },
      transaction
    )
  const { subscription, subscriptionItems } =
    await insertSubscriptionAndItems(params, transaction)

  const { price } = params
  if (price.type === PriceType.Usage) {
    await setupLedgerAccounts(
      {
        subscription,
        subscriptionItems,
        price,
      },
      transaction
    )
  }

  const subscriptionItemFeatures =
    await createSubscriptionFeatureItems(
      subscriptionItems,
      transaction
    )

  const { billingPeriod, billingPeriodItems, billingRun } =
    await maybeCreateBillingPeriodAndRun(
      {
        subscription,
        subscriptionItems,
        defaultPaymentMethod,
        autoStart: params.autoStart ?? false,
      },
      transaction
    )
  await idempotentSendOrganizationSubscriptionCreatedNotification(
    subscription
  )
  const timestamp = new Date()
  const eventInserts: Event.Insert[] = [
    {
      type: FlowgladEventType.SubscriptionCreated,
      occurredAt: timestamp,
      organizationId: subscription.organizationId,
      livemode: subscription.livemode,
      payload: {
        object: EventNoun.Subscription,
        id: subscription.id,
      },
      submittedAt: timestamp,
      hash: constructSubscriptionCreatedEventHash(subscription),
      metadata: {},
      processedAt: null,
    },
  ]

  const ledgerCommand: BillingPeriodTransitionLedgerCommand = {
    organizationId: subscription.organizationId,
    subscriptionId: subscription.id,
    livemode: subscription.livemode,
    type: LedgerTransactionType.BillingPeriodTransition,
    payload: ledgerCommandPayload({
      subscription,
      subscriptionItemFeatures,
      billingPeriod,
      billingPeriodItems,
      billingRun,
    }),
  }

  return {
    result: {
      type: 'standard',
      subscription,
      subscriptionItems,
      billingPeriod,
      billingPeriodItems,
      billingRun,
    },
    ledgerCommand,
    eventsToLog: eventInserts,
  }
}
