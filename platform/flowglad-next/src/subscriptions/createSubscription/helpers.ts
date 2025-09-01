import { SubscriptionStatus, PriceType, IntervalUnit } from '@/types'
import { DbTransaction } from '@/db/types'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import {
  selectSubscriptions,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import { currentSubscriptionStatuses } from '@/db/tableMethods/subscriptionMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPaymentMethods } from '@/db/tableMethods/paymentMethodMethods'
import {
  CreateSubscriptionParams,
  NonRenewingCreateSubscriptionResult,
  StandardCreateSubscriptionResult,
} from './types'
import { Subscription } from '@/db/schema/subscriptions'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { TransactionOutput } from '@/db/transactionEnhacementTypes'
import { BillingRun } from '@/db/schema/billingRuns'
import { createBillingRun } from '../billingRunHelpers'
import { selectBillingPeriodAndItemsByBillingPeriodWhere } from '@/db/tableMethods/billingPeriodItemMethods'
import { selectBillingRuns } from '@/db/tableMethods/billingRunMethods'
import { attemptBillingRunTask } from '@/trigger/attempt-billing-run'
import core from '@/utils/core'
import { Price } from '@/db/schema/prices'
import { bulkInsertLedgerAccountsBySubscriptionIdAndUsageMeterId } from '@/db/tableMethods/ledgerAccountMethods'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import { createBillingPeriodAndItems } from '../billingPeriodHelpers'
import { BillingPeriodTransitionPayload } from '@/db/ledgerManager/ledgerManagerTypes'
import { FeatureType } from '@/types'
import { generateNextBillingPeriod } from '../billingIntervalHelpers'
import { selectPriceById } from '@/db/tableMethods/priceMethods'

export const deriveSubscriptionStatus = ({
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

export const safelyProcessCreationForExistingSubscription = async (
  params: CreateSubscriptionParams,
  subscription: Subscription.Record,
  subscriptionItems: SubscriptionItem.Record[],
  transaction: DbTransaction
): Promise<
  TransactionOutput<
    | StandardCreateSubscriptionResult
    | NonRenewingCreateSubscriptionResult
  >
> => {
  if (subscription.renews === false) {
    return {
      result: {
        type: 'non_renewing',
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

export const verifyCanCreateSubscription = async (
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

export const maybeDefaultPaymentMethodForSubscription = async (
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

export const setupLedgerAccounts = async (
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

export const activateSubscription = async (
  params: {
    subscription: Subscription.Record
    subscriptionItems: SubscriptionItem.Record[]
    defaultPaymentMethod: PaymentMethod.Record
    autoStart: boolean
  },
  transaction: DbTransaction
) => {
  const { subscription, subscriptionItems, defaultPaymentMethod } =
    params
  const { startDate, endDate } = generateNextBillingPeriod({
    interval: subscription.interval ?? IntervalUnit.Month,
    intervalCount: subscription.intervalCount ?? 1,
    billingCycleAnchorDate:
      subscription.billingCycleAnchorDate ??
      subscription.startDate ??
      new Date(),
    lastBillingPeriodEndDate: subscription.currentBillingPeriodEnd,
    subscriptionStartDate: subscription.startDate ?? undefined,
  })

  const price = await selectPriceById(
    subscription.priceId!,
    transaction
  )
  const renews = price.type === PriceType.Subscription ? true : false
  let subscriptionUpdate: Subscription.Update | null = null

  if (renews) {
    const renewingUpdate: Subscription.StandardUpdate = {
      id: subscription.id,
      status: SubscriptionStatus.Active,
      currentBillingPeriodStart: startDate,
      currentBillingPeriodEnd: endDate,
      billingCycleAnchorDate: startDate,
      defaultPaymentMethodId: defaultPaymentMethod.id,
      interval: subscription.interval ?? IntervalUnit.Month,
      intervalCount: subscription.intervalCount ?? 1,
      renews: true,
    }
    subscriptionUpdate = renewingUpdate
  } else {
    const nonRenewingUpdate: Subscription.NonRenewingUpdate = {
      id: subscription.id,
      status: SubscriptionStatus.Active,
      currentBillingPeriodEnd: null,
      currentBillingPeriodStart: null,
      billingCycleAnchorDate: null,
      interval: null,
      intervalCount: null,
      renews: false,
    }
    subscriptionUpdate = nonRenewingUpdate
  }
  const activatedSubscription = await updateSubscription(
    subscriptionUpdate,
    transaction
  )

  if (
    activatedSubscription.status === SubscriptionStatus.CreditTrial
  ) {
    throw Error(
      `Subscription ${activatedSubscription.id} is a credit trial subscription. Credit trial subscriptions cannot be activated (Should never hit this)`
    )
  }

  if (!activatedSubscription.renews) {
    return {
      subscription: activatedSubscription,
      billingPeriod: null,
      billingPeriodItems: null,
      billingRun: null,
    }
  }

  const { billingPeriod, billingPeriodItems } =
    await createBillingPeriodAndItems(
      {
        subscription: activatedSubscription,
        subscriptionItems,
        trialPeriod: !!subscription.trialEnd,
        isInitialBillingPeriod: true,
      },
      transaction
    )
  const scheduledFor = subscription.runBillingAtPeriodStart
    ? startDate
    : endDate

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
  return {
    subscription: activatedSubscription,
    billingPeriod,
    billingPeriodItems,
    billingRun,
  }
}

export const initiateSubscriptionTrialPeriod = async (
  params: {
    subscription: Subscription.Record
    subscriptionItems: SubscriptionItem.Record[]
    defaultPaymentMethod: PaymentMethod.Record | null
    autoStart: boolean
  },
  transaction: DbTransaction
) => {
  const { subscription, subscriptionItems, defaultPaymentMethod } =
    params
  const scheduledFor = subscription.runBillingAtPeriodStart
    ? subscription.currentBillingPeriodStart
    : subscription.currentBillingPeriodEnd

  if (subscription.status !== SubscriptionStatus.Trialing) {
    throw new Error(
      'initiateSubscriptionTrialPeriod: Subscription is not in trialing status, cannot initiate trial period'
    )
  }

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
  return {
    subscription,
    billingPeriod,
    billingPeriodItems,
    billingRun,
  }
}

export const maybeCreateInitialBillingPeriodAndRun = async (
  params: {
    subscription: Subscription.Record
    subscriptionItems: SubscriptionItem.Record[]
    defaultPaymentMethod: PaymentMethod.Record | null
    autoStart: boolean
  },
  transaction: DbTransaction
) => {
  const { subscription, defaultPaymentMethod, subscriptionItems } =
    params
  /**
   * If
   * and no default payment method is provided,
   * we do not create a billing period or run.
   *
   * This is because the subscription is not yet active,
   * and we do not want to create a billing period or run
   * for a subscription that is not yet active.
   */
  if (
    subscription.status === SubscriptionStatus.CreditTrial ||
    (subscription.status === SubscriptionStatus.Incomplete &&
      !defaultPaymentMethod) ||
    !subscription.renews
  ) {
    return {
      subscription,
      billingPeriod: null,
      billingPeriodItems: null,
      billingRun: null,
    }
  }
  /**
   * If the subscription is in trialing status and has a trial end date,
   * we initiate the trial period.
   */
  if (
    subscription.trialEnd &&
    subscription.status === SubscriptionStatus.Trialing
  ) {
    return await initiateSubscriptionTrialPeriod(params, transaction)
  }
  /**
   * Initial active subscription: create the first billing period based on subscription.currentBillingPeriodStart/end
   */
  if (
    subscription.startDate?.getTime() ===
      subscription.currentBillingPeriodStart?.getTime() &&
    params.autoStart &&
    defaultPaymentMethod &&
    subscription.runBillingAtPeriodStart
  ) {
    const { billingPeriod, billingPeriodItems } =
      await createBillingPeriodAndItems(
        {
          subscription,
          subscriptionItems,
          trialPeriod: false,
          isInitialBillingPeriod: true,
        },
        transaction
      )
    const scheduledFor = subscription.runBillingAtPeriodStart
      ? subscription.currentBillingPeriodStart
      : subscription.currentBillingPeriodEnd
    const billingRun = await createBillingRun(
      {
        billingPeriod,
        paymentMethod: defaultPaymentMethod,
        scheduledFor,
      },
      transaction
    )
    return {
      subscription,
      billingPeriod,
      billingPeriodItems,
      billingRun,
    }
  }
  /**
   * If the subscription is in incomplete status and no default payment method is provided,
   * we throw an error.
   *
   * In practice this should never be reached
   */
  if (!defaultPaymentMethod) {
    throw new Error(
      'Default payment method is required if trial period is not set'
    )
  }
  /**
   * If autoStart is false, do not activate yet. Leave subscription as incomplete.
   */
  if (!params.autoStart) {
    return {
      subscription,
      billingPeriod: null,
      billingPeriodItems: null,
      billingRun: null,
    }
  }
  /**
   * If we have a defaultPaymentMethod and no trial period,
   * we activate the subscription
   */
  return await activateSubscription(
    {
      ...params,
      defaultPaymentMethod,
    },
    transaction
  )
}

export const ledgerCommandPayload = (params: {
  subscription: Subscription.Record
  subscriptionItemFeatures: SubscriptionItemFeature.Record[]
  billingPeriod: BillingPeriod.Record | null
  billingPeriodItems: BillingPeriodItem.Record[] | null
  billingRun: BillingRun.Record | null
}): BillingPeriodTransitionPayload => {
  const { subscription, subscriptionItemFeatures, billingPeriod } =
    params
  if (subscription.renews === false) {
    return {
      type: 'non_renewing',
      subscription,
      subscriptionFeatureItems: subscriptionItemFeatures.filter(
        (item) => item.type === FeatureType.UsageCreditGrant
      ),
    }
  }
  if (!billingPeriod) {
    throw new Error(
      `ledgerCommandPayload: billingPeriod is null for a standard, renewing subscription. This should never happen. Subscription: ${subscription.id} ${JSON.stringify(subscription)}`
    )
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
