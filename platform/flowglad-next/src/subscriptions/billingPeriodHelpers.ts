import type { StandardBillingPeriodTransitionPayload } from '@/db/ledgerManager/ledgerManagerTypes'
import type { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { BillingRun } from '@/db/schema/billingRuns'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  bulkInsertBillingPeriodItems,
  selectBillingPeriodItems,
  selectBillingPeriodItemsBillingPeriodSubscriptionAndOrganizationByBillingPeriodId,
} from '@/db/tableMethods/billingPeriodItemMethods'
import {
  insertBillingPeriod,
  isBillingPeriodInTerminalState,
  safelyUpdateBillingPeriodStatus,
  selectBillingPeriods,
} from '@/db/tableMethods/billingPeriodMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectCurrentlyActiveSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  isSubscriptionInTerminalState,
  safelyUpdateSubscriptionStatus,
  selectSubscriptionById,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import type { TransactionOutput } from '@/db/transactionEnhacementTypes'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import { attemptBillingRunTask } from '@/trigger/attempt-billing-run'
import {
  BillingPeriodStatus,
  FeatureType,
  LedgerTransactionType,
  SubscriptionStatus,
} from '@/types'
import { CacheDependency } from '@/utils/cache'
import { core } from '@/utils/core'
import { sumNetTotalSettledPaymentsForBillingPeriod } from '@/utils/paymentHelpers'
import { tracedTrigger } from '@/utils/triggerTracing'
import { syncSubscriptionWithActiveItems } from './adjustSubscription'
import { generateNextBillingPeriod } from './billingIntervalHelpers'
import { createBillingRun } from './billingRunHelpers'
import { isSubscriptionItemActiveAndNonManual } from './subscriptionItemHelpers'

interface CreateBillingPeriodParams {
  subscription: Subscription.StandardRecord
  subscriptionItems: SubscriptionItem.Record[]
  trialPeriod: boolean
  isInitialBillingPeriod: boolean
}

interface BillingPeriodAndItemsInserts {
  billingPeriodInsert: BillingPeriod.Insert
  billingPeriodItemInserts: Omit<
    BillingPeriodItem.Insert,
    'billingPeriodId'
  >[]
}

export const billingPeriodAndItemsInsertsFromSubscription = (
  params: CreateBillingPeriodParams
): BillingPeriodAndItemsInserts => {
  const { isInitialBillingPeriod, trialPeriod, subscription } = params
  let startDate: number
  let endDate: number
  if (trialPeriod && subscription.trialEnd) {
    startDate = subscription.currentBillingPeriodStart!
    endDate = subscription.trialEnd
  } else {
    const lastBillingPeriodEndDate = isInitialBillingPeriod
      ? subscription.currentBillingPeriodStart
      : subscription.currentBillingPeriodEnd
    const nextBillingPeriodRange = generateNextBillingPeriod({
      interval: subscription.interval,
      intervalCount: subscription.intervalCount,
      billingCycleAnchorDate: subscription.billingCycleAnchorDate!,
      lastBillingPeriodEndDate,
    })
    startDate = nextBillingPeriodRange.startDate
    endDate = nextBillingPeriodRange.endDate
  }

  let status = BillingPeriodStatus.Upcoming
  if (startDate <= Date.now()) {
    status = BillingPeriodStatus.Active
  } else if (endDate < Date.now()) {
    status = BillingPeriodStatus.Completed
  }
  const billingPeriodInsert: BillingPeriod.Insert = {
    subscriptionId: params.subscription.id,
    startDate,
    endDate,
    status,
    livemode: params.subscription.livemode,
    trialPeriod: params.trialPeriod ?? false,
  }
  let billingPeriodItemInserts: Omit<
    BillingPeriodItem.Insert,
    'billingPeriodId'
  >[] = []
  if (!params.trialPeriod) {
    const subscriptionItemsToPutTowardsBillingItems =
      // Filter out expired items and manuallyCreated items
      params.subscriptionItems.filter(
        isSubscriptionItemActiveAndNonManual
      )

    billingPeriodItemInserts =
      subscriptionItemsToPutTowardsBillingItems.map((item) => {
        const billingPeriodItemInsert: Omit<
          BillingPeriodItem.Insert,
          'billingPeriodId'
        > = {
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          name: item.name || 'Subscription Item',
          discountRedemptionId: null, // This would need to be handled separately
          description: '',
          livemode: params.subscription.livemode,
          type: item.type,
        }
        return billingPeriodItemInsert
      })
  }

  return {
    billingPeriodInsert,
    billingPeriodItemInserts,
  }
}

export const createBillingPeriodAndItems = async (
  params: CreateBillingPeriodParams,
  transaction: DbTransaction
) => {
  const { billingPeriodInsert, billingPeriodItemInserts } =
    billingPeriodAndItemsInsertsFromSubscription(params)

  const billingPeriod = await insertBillingPeriod(
    billingPeriodInsert,
    transaction
  )
  let billingPeriodItems: BillingPeriodItem.Record[] = []
  if (billingPeriodItemInserts.length > 0) {
    billingPeriodItems = await bulkInsertBillingPeriodItems(
      billingPeriodItemInserts.map((item) => ({
        ...item,
        billingPeriodId: billingPeriod.id,
      })) as BillingPeriodItem.Insert[],
      transaction
    )
  }

  return { billingPeriod, billingPeriodItems }
}

export const attemptBillingPeriodClose = async (
  billingPeriod: BillingPeriod.Record,
  transaction: DbTransaction
) => {
  if (isBillingPeriodInTerminalState(billingPeriod)) {
    return billingPeriod
  }
  let updatedBillingPeriod = billingPeriod
  if (billingPeriod.endDate > Date.now()) {
    throw Error(
      `Cannot close billing period ${
        billingPeriod.id
      }, at time ${new Date().toISOString()}, when its endDate is ${new Date(billingPeriod.endDate).toISOString()}`
    )
  }
  const { billingPeriodItems } =
    await selectBillingPeriodItemsBillingPeriodSubscriptionAndOrganizationByBillingPeriodId(
      billingPeriod.id,
      transaction
    )
  const totalBillingPeriodItemsValue = billingPeriodItems.reduce(
    (acc, item) => acc + item.unitPrice * item.quantity,
    0
  )
  const { total: totalPaid, payments } =
    await sumNetTotalSettledPaymentsForBillingPeriod(
      billingPeriod.id,
      transaction
    )
  const totalDueAmount = totalBillingPeriodItemsValue - totalPaid
  if (totalDueAmount <= 0) {
    updatedBillingPeriod = await safelyUpdateBillingPeriodStatus(
      billingPeriod,
      BillingPeriodStatus.Completed,
      transaction
    )
  } else {
    updatedBillingPeriod = await safelyUpdateBillingPeriodStatus(
      billingPeriod,
      BillingPeriodStatus.PastDue,
      transaction
    )
  }
  return updatedBillingPeriod
}

export const attemptToTransitionSubscriptionBillingPeriod = async (
  currentBillingPeriod: BillingPeriod.Record,
  ctx: TransactionEffectsContext
): Promise<
  TransactionOutput<{
    subscription: Subscription.StandardRecord
    billingRun: BillingRun.Record | null
    updatedBillingPeriod: BillingPeriod.Record
  }>
> => {
  const { transaction, invalidateCache } = ctx
  if (
    !currentBillingPeriod.endDate ||
    isNaN(currentBillingPeriod.endDate)
  ) {
    throw new Error(
      `Invalid endDate for billing period ${currentBillingPeriod.id}`
    )
  }

  const updatedBillingPeriod = await attemptBillingPeriodClose(
    currentBillingPeriod,
    transaction
  )
  let subscription = await selectSubscriptionById(
    currentBillingPeriod.subscriptionId,
    transaction
  )
  if (subscription.status === SubscriptionStatus.CreditTrial) {
    throw new Error(
      `Cannot transition subscription ${subscription.id} in credit trial status`
    )
  }
  if (!subscription.renews) {
    throw new Error(
      `Subscription ${subscription.id} is a non-renewing subscription. Non-renewing subscriptions cannot have billing periods.`
    )
  }
  let billingRun: BillingRun.Record | null = null
  if (isSubscriptionInTerminalState(subscription.status)) {
    return {
      result: { subscription, billingRun, updatedBillingPeriod },
      eventsToInsert: [],
    }
  }
  if (
    subscription.cancelScheduledAt &&
    subscription.cancelScheduledAt < Date.now()
  ) {
    subscription = await updateSubscription(
      {
        id: subscription.id,
        canceledAt: Date.now(),
        status: SubscriptionStatus.Canceled,
        renews: subscription.renews,
      },
      transaction
    )
    subscription = await safelyUpdateSubscriptionStatus(
      subscription,
      SubscriptionStatus.Canceled,
      transaction
    )
    if (!subscription.renews) {
      throw new Error(
        `Subscription ${subscription.id} is a non-renewing subscription. Non-renewing subscriptions cannot have billing periods (should never hit this)`
      )
    }
    const cacheKey = CacheDependency.customerSubscriptions(
      subscription.customerId
    )
    invalidateCache(cacheKey)
    return {
      result: {
        subscription,
        billingRun,
        updatedBillingPeriod,
      },
      eventsToInsert: [],
      cacheInvalidations: [cacheKey],
    }
  }

  const allBillingPeriods = await selectBillingPeriods(
    { subscriptionId: subscription.id },
    transaction
  )
  const existingFutureBillingPeriod = allBillingPeriods.find(
    (bp) => bp.startDate > currentBillingPeriod.startDate
  )
  if (existingFutureBillingPeriod) {
    return {
      result: { subscription, billingRun, updatedBillingPeriod },
      eventsToInsert: [],
    }
  }
  const result =
    await attemptToCreateFutureBillingPeriodForSubscription(
      subscription,
      transaction
    )
  if (!result) {
    subscription = await safelyUpdateSubscriptionStatus(
      subscription,
      SubscriptionStatus.PastDue,
      transaction
    )
    if (!subscription.renews) {
      throw new Error(
        `Subscription ${subscription.id} is a non-renewing subscription. Non-renewing subscriptions cannot have billing periods (should never hit this)`
      )
    }
    const cacheKey = CacheDependency.customerSubscriptions(
      subscription.customerId
    )
    invalidateCache(cacheKey)
    return {
      result: {
        subscription,
        billingRun,
        updatedBillingPeriod,
      },
      eventsToInsert: [],
      cacheInvalidations: [cacheKey],
    }
  }
  const newBillingPeriod = result.billingPeriod
  const paymentMethodId =
    subscription.defaultPaymentMethodId ??
    subscription.backupPaymentMethodId
  await safelyUpdateBillingPeriodStatus(
    newBillingPeriod,
    BillingPeriodStatus.Active,
    transaction
  )
  // Only create billing run if payment method exists and doNotCharge is false.
  // Note: API validation should prevent doNotCharge=true with payment methods,
  // but we handle this defensively to ensure no billing runs are created.
  if (paymentMethodId && !subscription.doNotCharge) {
    const paymentMethod = await selectPaymentMethodById(
      paymentMethodId,
      transaction
    )
    const scheduledFor = subscription.runBillingAtPeriodStart
      ? newBillingPeriod.startDate
      : newBillingPeriod.endDate
    billingRun = await createBillingRun(
      {
        billingPeriod: newBillingPeriod,
        paymentMethod,
        scheduledFor,
      },
      transaction
    )
    if (subscription.runBillingAtPeriodStart && !core.IS_TEST) {
      // billingRun is guaranteed to be non-null here since it was just assigned above
      const currentBillingRun = billingRun
      await tracedTrigger(
        'attemptBillingRun',
        () =>
          attemptBillingRunTask.trigger({
            billingRun: currentBillingRun,
          }),
        {
          'trigger.billing_run_id': currentBillingRun.id,
          'trigger.livemode': currentBillingRun.livemode,
        }
      )
    }
  }
  subscription = await updateSubscription(
    {
      id: subscription.id,
      currentBillingPeriodEnd: newBillingPeriod.endDate,
      currentBillingPeriodStart: newBillingPeriod.startDate,
      status:
        paymentMethodId || subscription.doNotCharge
          ? SubscriptionStatus.Active
          : SubscriptionStatus.PastDue,
      renews: subscription.renews,
    },
    transaction
  )
  /**
   * See above, in practice this should never happen because above code updates status to past due if there is no payment method.
   */
  if (subscription.status === SubscriptionStatus.CreditTrial) {
    throw new Error(
      `Subscription ${subscription.id} was updated to credit trial status. Credit_trial status is a status that can only be created, not updated to.`
    )
  }
  if (!subscription.renews) {
    throw new Error(
      `Subscription ${subscription.id} is a non-renewing subscription. Non-renewing subscriptions cannot have billing periods.`
    )
  }

  // Sync subscription header with newly active items after billing period rollover
  subscription = await syncSubscriptionWithActiveItems(
    {
      subscriptionId: subscription.id,
      currentTime: newBillingPeriod.startDate,
    },
    transaction
  )

  const activeSubscriptionFeatureItems =
    await selectCurrentlyActiveSubscriptionItems(
      { subscriptionId: subscription.id },
      newBillingPeriod.startDate,
      transaction
    )
  const usageCreditGrantFeatures =
    await selectSubscriptionItemFeatures(
      {
        subscriptionItemId: activeSubscriptionFeatureItems.map(
          (item) => item.id
        ),
        type: FeatureType.UsageCreditGrant,
      },
      transaction
    )
  const ledgerCommandPayload: StandardBillingPeriodTransitionPayload =
    {
      type: 'standard',
      subscription: subscription,
      previousBillingPeriod: updatedBillingPeriod,
      newBillingPeriod: newBillingPeriod,
      subscriptionFeatureItems: usageCreditGrantFeatures.filter(
        (feature) => feature.type === FeatureType.UsageCreditGrant
      ),
    }
  const cacheKey = CacheDependency.customerSubscriptions(
    subscription.customerId
  )
  invalidateCache(cacheKey)
  return {
    result: { subscription, billingRun, updatedBillingPeriod },
    eventsToInsert: [],
    ledgerCommand: {
      type: LedgerTransactionType.BillingPeriodTransition,
      livemode: updatedBillingPeriod.livemode,
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
      payload: ledgerCommandPayload,
    },
    cacheInvalidations: [cacheKey],
  }
}

export const createNextBillingPeriodBasedOnPreviousBillingPeriod =
  async (
    params: {
      subscription: Subscription.StandardRecord
      billingPeriod: BillingPeriod.Record
    },
    transaction: DbTransaction
  ) => {
    const { subscription, billingPeriod } = params
    const { startDate, endDate } = generateNextBillingPeriod({
      interval: subscription.interval,
      intervalCount: subscription.intervalCount,
      billingCycleAnchorDate: subscription.billingCycleAnchorDate!,
      lastBillingPeriodEndDate: billingPeriod.endDate,
    })
    const billingPeriodsForSubscription = await selectBillingPeriods(
      { subscriptionId: subscription.id },
      transaction
    )
    const existingFutureBillingPeriod =
      billingPeriodsForSubscription.find(
        (existingBillingPeriod) =>
          existingBillingPeriod.startDate >= startDate
      )

    if (existingFutureBillingPeriod) {
      const billingPeriodItems = await selectBillingPeriodItems(
        { billingPeriodId: existingFutureBillingPeriod.id },
        transaction
      )
      return {
        billingPeriod: existingFutureBillingPeriod,
        billingPeriodItems,
      }
    }

    const subscriptionItems =
      await selectCurrentlyActiveSubscriptionItems(
        { subscriptionId: subscription.id },
        new Date(),
        transaction
      )

    const { billingPeriod: newBillingPeriod, billingPeriodItems } =
      await createBillingPeriodAndItems(
        {
          subscription,
          subscriptionItems,
          trialPeriod: false,
          isInitialBillingPeriod: false,
        },
        transaction
      )
    return {
      billingPeriod: newBillingPeriod,
      billingPeriodItems,
    }
  }

export const attemptToCreateFutureBillingPeriodForSubscription =
  async (
    subscription: Subscription.StandardRecord,
    transaction: DbTransaction
  ) => {
    if (
      subscription.canceledAt &&
      subscription.canceledAt < Date.now()
    ) {
      return null
    }
    if (
      subscription.cancelScheduledAt &&
      subscription.cancelScheduledAt < Date.now()
    ) {
      return null
    }
    if (isSubscriptionInTerminalState(subscription.status)) {
      return null
    }
    const billingPeriodsForSubscription = await selectBillingPeriods(
      { subscriptionId: subscription.id },
      transaction
    )
    const mostRecentBillingPeriod =
      billingPeriodsForSubscription.sort(
        (a, b) => b.startDate - a.startDate
      )[0]
    if (
      subscription.cancelScheduledAt &&
      subscription.cancelScheduledAt >=
        mostRecentBillingPeriod.endDate
    ) {
      return null
    }

    const result =
      await createNextBillingPeriodBasedOnPreviousBillingPeriod(
        {
          subscription,
          billingPeriod: mostRecentBillingPeriod,
        },
        transaction
      )
    await updateSubscription(
      {
        id: subscription.id,
        currentBillingPeriodEnd: result.billingPeriod.endDate,
        currentBillingPeriodStart: result.billingPeriod.startDate,
        status: subscription.status,
        renews: subscription.renews,
      },
      transaction
    )
    return result
  }
