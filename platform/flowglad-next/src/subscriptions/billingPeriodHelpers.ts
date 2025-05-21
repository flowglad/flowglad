import { BillingPeriod } from '@/db/schema/billingPeriods'
import { Subscription } from '@/db/schema/subscriptions'
import {
  insertBillingPeriod,
  isBillingPeriodInTerminalState,
  safelyUpdateBillingPeriodStatus,
  selectBillingPeriods,
} from '@/db/tableMethods/billingPeriodMethods'
import { BillingPeriodStatus, SubscriptionStatus } from '@/types'
import { DbTransaction } from '@/db/types'
import { generateNextBillingPeriod } from './billingIntervalHelpers'
import {
  bulkInsertBillingPeriodItems,
  selectBillingPeriodItems,
  selectBillingPeriodItemsBillingPeriodSubscriptionAndOrganizationByBillingPeriodId,
} from '@/db/tableMethods/billingPeriodItemMethods'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { sumNetTotalSettledPaymentsForBillingPeriod } from '@/utils/paymentHelpers'
import {
  isSubscriptionInTerminalState,
  safelyUpdateSubscriptionStatus,
  selectSubscriptionById,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import { selectCurrentlyActiveSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import { createBillingRun } from './billingRunHelpers'
import type { BillingRun } from '@/db/schema/billingRuns'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import { attemptBillingRunTask } from '@/trigger/attempt-billing-run'
import { core } from '@/utils/core'

interface CreateBillingPeriodParams {
  subscription: Subscription.Record
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
  let startDate: Date
  let endDate: Date
  if (trialPeriod && subscription.trialEnd) {
    startDate = subscription.currentBillingPeriodStart
    endDate = subscription.trialEnd
  } else {
    const lastBillingPeriodEndDate = isInitialBillingPeriod
      ? subscription.currentBillingPeriodStart
      : subscription.currentBillingPeriodEnd
    const nextBillingPeriodRange = generateNextBillingPeriod({
      interval: subscription.interval,
      intervalCount: subscription.intervalCount,
      billingCycleAnchorDate: subscription.billingCycleAnchorDate,
      lastBillingPeriodEndDate,
    })
    startDate = nextBillingPeriodRange.startDate
    endDate = nextBillingPeriodRange.endDate
  }

  let status = BillingPeriodStatus.Upcoming
  if (startDate <= new Date()) {
    status = BillingPeriodStatus.Active
  } else if (endDate < new Date()) {
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
      params.subscriptionItems.filter(
        (item) => !item.expiredAt || item.expiredAt > new Date()
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
      })),
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
  if (billingPeriod.endDate > new Date()) {
    throw Error(
      `Cannot close billing period ${
        billingPeriod.id
      }, at time ${new Date().toISOString()}, when its endDate is ${billingPeriod.endDate.toISOString()}`
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
  transaction: DbTransaction
) => {
  if (
    !currentBillingPeriod.endDate ||
    isNaN(currentBillingPeriod.endDate.getTime())
  ) {
    throw new Error(
      `Invalid endDate for billing period ${currentBillingPeriod.id}`
    )
  }

  let updatedBillingPeriod = await attemptBillingPeriodClose(
    currentBillingPeriod,
    transaction
  )
  let subscription = await selectSubscriptionById(
    currentBillingPeriod.subscriptionId,
    transaction
  )
  let billingRun: BillingRun.Record | null = null
  if (isSubscriptionInTerminalState(subscription.status)) {
    return { subscription, billingRun }
  }
  if (
    subscription.cancelScheduledAt &&
    subscription.cancelScheduledAt < new Date()
  ) {
    subscription = await safelyUpdateSubscriptionStatus(
      subscription,
      SubscriptionStatus.Canceled,
      transaction
    )
    subscription = await updateSubscription(
      {
        id: subscription.id,
        canceledAt: new Date(),
      },
      transaction
    )
    return { subscription, billingRun }
  }
  const allBillingPeriods = await selectBillingPeriods(
    { subscriptionId: subscription.id },
    transaction
  )
  const existingFutureBillingPeriod = allBillingPeriods.find(
    (bp) => bp.startDate > currentBillingPeriod.startDate
  )
  if (existingFutureBillingPeriod) {
    return { subscription, billingRun }
  }
  const result =
    await attemptToCreateFutureBillingPeriodForSubscription(
      subscription,
      transaction
    )
  if (result) {
    const newBillingPeriod = result.billingPeriod
    const paymentMethodId =
      subscription.defaultPaymentMethodId ??
      subscription.backupPaymentMethodId
    await safelyUpdateBillingPeriodStatus(
      newBillingPeriod,
      BillingPeriodStatus.Active,
      transaction
    )
    if (paymentMethodId) {
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
        await attemptBillingRunTask.trigger({
          billingRun,
        })
      }
    }
    subscription = await updateSubscription(
      {
        id: subscription.id,
        currentBillingPeriodEnd: newBillingPeriod.endDate,
        currentBillingPeriodStart: newBillingPeriod.startDate,
      },
      transaction
    )
  }
  if (!billingRun) {
    subscription = await safelyUpdateSubscriptionStatus(
      subscription,
      SubscriptionStatus.PastDue,
      transaction
    )
  }
  return { subscription, billingRun, updatedBillingPeriod }
}

export const createNextBillingPeriodBasedOnPreviousBillingPeriod =
  async (
    params: {
      subscription: Subscription.Record
      billingPeriod: BillingPeriod.Record
    },
    transaction: DbTransaction
  ) => {
    const { subscription, billingPeriod } = params
    const { startDate, endDate } = generateNextBillingPeriod({
      interval: subscription.interval,
      intervalCount: subscription.intervalCount,
      billingCycleAnchorDate: subscription.billingCycleAnchorDate,
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
    subscription: Subscription.Record,
    transaction: DbTransaction
  ) => {
    if (
      subscription.canceledAt &&
      subscription.canceledAt < new Date()
    ) {
      return null
    }
    if (
      subscription.cancelScheduledAt &&
      subscription.cancelScheduledAt < new Date()
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
        (a, b) => b.startDate.getTime() - a.startDate.getTime()
      )[0]
    if (
      subscription.cancelScheduledAt &&
      subscription.cancelScheduledAt >=
        mostRecentBillingPeriod.endDate
    ) {
      return null
    }

    return createNextBillingPeriodBasedOnPreviousBillingPeriod(
      {
        subscription,
        billingPeriod: mostRecentBillingPeriod,
      },
      transaction
    )
  }
