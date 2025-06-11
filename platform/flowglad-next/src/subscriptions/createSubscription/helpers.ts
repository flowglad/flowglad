import { SubscriptionStatus, PriceType } from '@/types'
import { DbTransaction } from '@/db/types'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'
import { currentSubscriptionStatuses } from '@/db/tableMethods/subscriptionMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPaymentMethods } from '@/db/tableMethods/paymentMethodMethods'
import {
  CreateSubscriptionParams,
  CreditTrialCreateSubscriptionResult,
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

export const maybeCreateBillingPeriodAndRun = async (
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

export const ledgerCommandPayload = (params: {
  subscription: Subscription.Record
  subscriptionItemFeatures: SubscriptionItemFeature.Record[]
  billingPeriod: BillingPeriod.Record | null
  billingPeriodItems: BillingPeriodItem.Record[] | null
  billingRun: BillingRun.Record | null
}): BillingPeriodTransitionPayload => {
  const { subscription, subscriptionItemFeatures, billingPeriod } =
    params
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
