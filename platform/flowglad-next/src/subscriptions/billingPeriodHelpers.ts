import { Result } from 'better-result'
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
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import { NotFoundError } from '@/errors'
import {
  releaseAllResourceClaimsForSubscription,
  releaseExpiredResourceClaims,
} from '@/resources/resourceClaimHelpers'
import { attemptBillingRunTask } from '@/trigger/attempt-billing-run'
import { idempotentSendCustomerTrialExpiredNotification } from '@/trigger/notifications/send-customer-trial-expired-notification'
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
): Promise<
  Result<
    {
      billingPeriod: BillingPeriod.Record
      billingPeriodItems: BillingPeriodItem.Record[]
    },
    NotFoundError
  >
> => {
  const { billingPeriodInsert, billingPeriodItemInserts } =
    billingPeriodAndItemsInsertsFromSubscription(params)

  const billingPeriod = await insertBillingPeriod(
    billingPeriodInsert,
    transaction
  )
  let billingPeriodItems: BillingPeriodItem.Record[] = []
  if (billingPeriodItemInserts.length > 0) {
    const billingPeriodItemsResult =
      await bulkInsertBillingPeriodItems(
        billingPeriodItemInserts.map((item) => ({
          ...item,
          billingPeriodId: billingPeriod.id,
        })) as BillingPeriodItem.Insert[],
        transaction
      )
    if (Result.isError(billingPeriodItemsResult)) {
      return Result.err(billingPeriodItemsResult.error)
    }
    billingPeriodItems = billingPeriodItemsResult.value
  }

  return Result.ok({ billingPeriod, billingPeriodItems })
}

export const attemptBillingPeriodClose = async (
  billingPeriod: BillingPeriod.Record,
  transaction: DbTransaction
): Promise<Result<BillingPeriod.Record, Error>> => {
  if (isBillingPeriodInTerminalState(billingPeriod)) {
    return Result.ok(billingPeriod)
  }
  let updatedBillingPeriod = billingPeriod
  if (billingPeriod.endDate > Date.now()) {
    return Result.err(
      new Error(
        `Cannot close billing period ${
          billingPeriod.id
        }, at time ${new Date().toISOString()}, when its endDate is ${new Date(billingPeriod.endDate).toISOString()}`
      )
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
  return Result.ok(updatedBillingPeriod)
}

export const attemptToTransitionSubscriptionBillingPeriod = async (
  currentBillingPeriod: BillingPeriod.Record,
  ctx: TransactionEffectsContext
): Promise<
  Result<
    {
      subscription: Subscription.StandardRecord
      billingRun: BillingRun.Record | null
      updatedBillingPeriod: BillingPeriod.Record
    },
    Error
  >
> => {
  const { transaction, invalidateCache, enqueueLedgerCommand } = ctx
  if (
    !currentBillingPeriod.endDate ||
    isNaN(currentBillingPeriod.endDate)
  ) {
    return Result.err(
      new Error(
        `Invalid endDate for billing period ${currentBillingPeriod.id}`
      )
    )
  }

  const billingPeriodCloseResult = await attemptBillingPeriodClose(
    currentBillingPeriod,
    transaction
  )
  if (Result.isError(billingPeriodCloseResult)) {
    return Result.err(billingPeriodCloseResult.error)
  }
  const updatedBillingPeriod = billingPeriodCloseResult.value
  let subscription = (
    await selectSubscriptionById(
      currentBillingPeriod.subscriptionId,
      transaction
    )
  ).unwrap()
  if (subscription.status === SubscriptionStatus.CreditTrial) {
    return Result.err(
      new Error(
        `Cannot transition subscription ${subscription.id} in credit trial status`
      )
    )
  }
  if (!subscription.renews) {
    return Result.err(
      new Error(
        `Subscription ${subscription.id} is a non-renewing subscription. Non-renewing subscriptions cannot have billing periods.`
      )
    )
  }
  let billingRun: BillingRun.Record | null = null
  if (isSubscriptionInTerminalState(subscription.status)) {
    return Result.ok({
      subscription,
      billingRun,
      updatedBillingPeriod,
    })
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
      return Result.err(
        new Error(
          `Subscription ${subscription.id} is a non-renewing subscription. Non-renewing subscriptions cannot have billing periods (should never hit this)`
        )
      )
    }

    // Release all resource claims when scheduled cancellation takes effect
    await releaseAllResourceClaimsForSubscription(
      subscription.id,
      'scheduled_cancellation',
      transaction
    )

    invalidateCache(
      CacheDependency.customerSubscriptions(subscription.customerId)
    )
    return Result.ok({
      subscription,
      billingRun,
      updatedBillingPeriod,
    })
  }

  const allBillingPeriods = await selectBillingPeriods(
    { subscriptionId: subscription.id },
    transaction
  )
  const existingFutureBillingPeriod = allBillingPeriods.find(
    (bp) => bp.startDate > currentBillingPeriod.startDate
  )
  if (existingFutureBillingPeriod) {
    return Result.ok({
      subscription,
      billingRun,
      updatedBillingPeriod,
    })
  }
  const futureBillingPeriodResult =
    await attemptToCreateFutureBillingPeriodForSubscription(
      subscription,
      transaction
    )
  if (Result.isError(futureBillingPeriodResult)) {
    return Result.err(futureBillingPeriodResult.error)
  }
  const futureBillingPeriodValue = futureBillingPeriodResult.value
  if (!futureBillingPeriodValue) {
    subscription = await safelyUpdateSubscriptionStatus(
      subscription,
      SubscriptionStatus.PastDue,
      transaction
    )
    if (!subscription.renews) {
      return Result.err(
        new Error(
          `Subscription ${subscription.id} is a non-renewing subscription. Non-renewing subscriptions cannot have billing periods (should never hit this)`
        )
      )
    }
    invalidateCache(
      CacheDependency.customerSubscriptions(subscription.customerId)
    )
    return Result.ok({
      subscription,
      billingRun,
      updatedBillingPeriod,
    })
  }
  const newBillingPeriod = futureBillingPeriodValue.billingPeriod
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
    const billingRunResult = await createBillingRun(
      {
        billingPeriod: newBillingPeriod,
        paymentMethod,
        scheduledFor,
      },
      transaction
    )
    if (billingRunResult.status === 'error') {
      return Result.err(billingRunResult.error)
    }
    billingRun = billingRunResult.value
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

  // If the trial billing period just ended and the subscription is now past_due
  // (meaning no payment method), send the trial expired notification
  if (
    currentBillingPeriod.trialPeriod &&
    subscription.status === SubscriptionStatus.PastDue
  ) {
    await idempotentSendCustomerTrialExpiredNotification({
      subscriptionId: subscription.id,
    })
  }

  /**
   * See above, in practice this should never happen because above code updates status to past due if there is no payment method.
   */
  if (subscription.status === SubscriptionStatus.CreditTrial) {
    return Result.err(
      new Error(
        `Subscription ${subscription.id} was updated to credit trial status. Credit_trial status is a status that can only be created, not updated to.`
      )
    )
  }
  if (!subscription.renews) {
    return Result.err(
      new Error(
        `Subscription ${subscription.id} is a non-renewing subscription. Non-renewing subscriptions cannot have billing periods.`
      )
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

  // Release any resource claims that have expired (e.g., claims made during an
  // interim period after a downgrade was scheduled but before it took effect).
  // These claims are already filtered from active queries, but explicitly releasing
  // them ensures data consistency and provides an audit trail via releaseReason.
  await releaseExpiredResourceClaims(subscription.id, transaction)

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
  invalidateCache(
    CacheDependency.customerSubscriptions(subscription.customerId)
  )
  enqueueLedgerCommand({
    type: LedgerTransactionType.BillingPeriodTransition,
    livemode: updatedBillingPeriod.livemode,
    organizationId: subscription.organizationId,
    subscriptionId: subscription.id,
    payload: ledgerCommandPayload,
  })
  return Result.ok({ subscription, billingRun, updatedBillingPeriod })
}

export const createNextBillingPeriodBasedOnPreviousBillingPeriod =
  async (
    params: {
      subscription: Subscription.StandardRecord
      billingPeriod: BillingPeriod.Record
    },
    transaction: DbTransaction
  ): Promise<
    Result<
      {
        billingPeriod: BillingPeriod.Record
        billingPeriodItems: BillingPeriodItem.Record[]
      },
      NotFoundError
    >
  > => {
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
      return Result.ok({
        billingPeriod: existingFutureBillingPeriod,
        billingPeriodItems,
      })
    }

    const subscriptionItems =
      await selectCurrentlyActiveSubscriptionItems(
        { subscriptionId: subscription.id },
        new Date(),
        transaction
      )

    const billingPeriodAndItemsResult =
      await createBillingPeriodAndItems(
        {
          subscription,
          subscriptionItems,
          trialPeriod: false,
          isInitialBillingPeriod: false,
        },
        transaction
      )
    if (Result.isError(billingPeriodAndItemsResult)) {
      return Result.err(billingPeriodAndItemsResult.error)
    }
    return Result.ok({
      billingPeriod: billingPeriodAndItemsResult.value.billingPeriod,
      billingPeriodItems:
        billingPeriodAndItemsResult.value.billingPeriodItems,
    })
  }

export const attemptToCreateFutureBillingPeriodForSubscription =
  async (
    subscription: Subscription.StandardRecord,
    transaction: DbTransaction
  ): Promise<
    Result<
      {
        billingPeriod: BillingPeriod.Record
        billingPeriodItems: BillingPeriodItem.Record[]
      } | null,
      NotFoundError
    >
  > => {
    if (
      subscription.canceledAt &&
      subscription.canceledAt < Date.now()
    ) {
      return Result.ok(null)
    }
    if (
      subscription.cancelScheduledAt &&
      subscription.cancelScheduledAt < Date.now()
    ) {
      return Result.ok(null)
    }
    if (isSubscriptionInTerminalState(subscription.status)) {
      return Result.ok(null)
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
      return Result.ok(null)
    }

    const result =
      await createNextBillingPeriodBasedOnPreviousBillingPeriod(
        {
          subscription,
          billingPeriod: mostRecentBillingPeriod,
        },
        transaction
      )
    if (Result.isError(result)) {
      return Result.err(result.error)
    }
    await updateSubscription(
      {
        id: subscription.id,
        currentBillingPeriodEnd: result.value.billingPeriod.endDate,
        currentBillingPeriodStart:
          result.value.billingPeriod.startDate,
        status: subscription.status,
        renews: subscription.renews,
      },
      transaction
    )
    return Result.ok(result.value)
  }
