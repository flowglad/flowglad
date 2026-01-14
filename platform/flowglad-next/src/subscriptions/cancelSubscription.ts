import { TRPCError } from '@trpc/server'
import type { ComprehensiveAuthenticatedProcedureTransactionParams } from '@/db/authenticatedTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { Event } from '@/db/schema/events'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  safelyUpdateBillingPeriodStatus,
  selectBillingPeriods,
  selectCurrentBillingPeriodForSubscription,
  updateBillingPeriod,
} from '@/db/tableMethods/billingPeriodMethods'
import {
  selectBillingRuns,
  updateBillingRun,
} from '@/db/tableMethods/billingRunMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import { selectPricesAndProductsByProductWhere } from '@/db/tableMethods/priceMethods'
import {
  expireSubscriptionItems,
  selectSubscriptionItems,
} from '@/db/tableMethods/subscriptionItemMethods'
import {
  currentSubscriptionStatuses,
  isSubscriptionCurrent,
  isSubscriptionInTerminalState,
  safelyUpdateSubscriptionStatus,
  selectSubscriptionById,
  selectSubscriptions,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import type { TransactionOutput } from '@/db/transactionEnhacementTypes'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import { releaseAllResourceClaimsForSubscription } from '@/resources/resourceClaimHelpers'
import { createBillingRun } from '@/subscriptions/billingRunHelpers'
import { createSubscriptionWorkflow } from '@/subscriptions/createSubscription'
import {
  type ScheduleSubscriptionCancellationParams,
  scheduleSubscriptionCancellationSchema,
} from '@/subscriptions/schemas'
import { idempotentSendCustomerSubscriptionCanceledNotification } from '@/trigger/notifications/send-customer-subscription-canceled-notification'
import { idempotentSendCustomerSubscriptionCancellationScheduledNotification } from '@/trigger/notifications/send-customer-subscription-cancellation-scheduled-notification'
import { idempotentSendOrganizationSubscriptionCanceledNotification } from '@/trigger/notifications/send-organization-subscription-canceled-notification'
import { idempotentSendOrganizationSubscriptionCancellationScheduledNotification } from '@/trigger/notifications/send-organization-subscription-cancellation-scheduled-notification'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  EventNoun,
  FlowgladEventType,
  SubscriptionCancellationArrangement,
  SubscriptionStatus,
} from '@/types'
import { CacheDependency } from '@/utils/cache'
import { constructSubscriptionCanceledEventHash } from '@/utils/eventHelpers'

// Abort all scheduled billing runs for a subscription
export const abortScheduledBillingRuns = async (
  subscriptionId: string,
  ctx: TransactionEffectsContext
) => {
  const { transaction } = ctx
  const scheduledBillingRuns = await selectBillingRuns(
    {
      subscriptionId,
      status: BillingRunStatus.Scheduled,
    },
    transaction
  )
  for (const billingRun of scheduledBillingRuns) {
    await updateBillingRun(
      { id: billingRun.id, status: BillingRunStatus.Aborted },
      transaction
    )
  }
}

/**
 * Re-adds a default-plan subscription when a cancellation leaves the customer without one.
 *
 * @param canceledSubscription Subscription record that was just canceled.
 * @param ctx Transaction context with database transaction and effect callbacks.
 * @returns Resolves when the reassignment logic finishes.
 */
export const reassignDefaultSubscription = async (
  canceledSubscription: Subscription.Record,
  ctx: TransactionEffectsContext
) => {
  const { transaction } = ctx
  // don't need to re-add default subscription when upgrading to a paid plan
  if (canceledSubscription.isFreePlan) {
    return
  }

  try {
    const customer = await selectCustomerById(
      canceledSubscription.customerId,
      transaction
    )

    const organization = await selectOrganizationById(
      canceledSubscription.organizationId,
      transaction
    )

    const pricingModelId = customer.pricingModelId

    const [defaultProduct] =
      await selectPricesAndProductsByProductWhere(
        {
          pricingModelId,
          organizationId: organization.id,
          livemode: canceledSubscription.livemode,
          default: true,
          active: true,
        },
        transaction
      )

    if (!defaultProduct) {
      console.warn(
        `reassignDefaultSubscription: no default product found for pricing model ${pricingModelId}`
      )
      return
    }

    const defaultPrice = defaultProduct.defaultPrice

    if (!defaultPrice) {
      console.warn(
        `reassignDefaultSubscription: default product ${defaultProduct.id} missing default price`
      )
      return
    }

    const currentSubscriptions = await selectSubscriptions(
      {
        customerId: customer.id,
        status: currentSubscriptionStatuses,
      },
      transaction
    )

    if (
      currentSubscriptions.some(
        (subscription) => subscription.priceId === defaultPrice.id
      )
    ) {
      return
    }

    if (currentSubscriptions.length > 0) {
      return
    }

    const trialEnd = defaultPrice.trialPeriodDays
      ? new Date(
          Date.now() +
            defaultPrice.trialPeriodDays * 24 * 60 * 60 * 1000
        )
      : undefined

    await createSubscriptionWorkflow(
      {
        organization,
        customer: {
          id: customer.id,
          stripeCustomerId: customer.stripeCustomerId,
          livemode: customer.livemode,
          organizationId: customer.organizationId,
        },
        product: defaultProduct,
        price: defaultPrice,
        quantity: 1,
        livemode: customer.livemode,
        startDate: new Date(),
        interval: defaultPrice.intervalUnit,
        intervalCount: defaultPrice.intervalCount,
        trialEnd,
        autoStart: true,
        name: `${defaultProduct.name} Subscription`,
      },
      ctx
    )
  } catch (error) {
    console.error(
      `reassignDefaultSubscription: failed to create default subscription for customer ${canceledSubscription.customerId}`,
      error
    )
  }
}

const constructSubscriptionCanceledEventInsert = (
  subscription: Subscription.Record,
  customer: Customer.Record
): Event.Insert => {
  return {
    type: FlowgladEventType.SubscriptionCanceled,
    occurredAt: new Date().getTime(),
    organizationId: subscription.organizationId,
    livemode: subscription.livemode,
    metadata: {},
    submittedAt: new Date().getTime(),
    processedAt: null,
    payload: {
      object: EventNoun.Subscription,
      id: subscription.id,
      customer: {
        id: subscription.customerId,
        externalId: customer.externalId,
      },
    },
    hash: constructSubscriptionCanceledEventHash(subscription),
  }
}
export interface CancelSubscriptionImmediatelyParams {
  /**
   * The subscription to cancel
   */
  subscription: Subscription.Record
  /**
   * Customer record to use (avoids re-fetching if already available)
   */
  customer?: Customer.Record
  /**
   * Skip sending notifications (useful for programmatic cancellations like migrations)
   */
  skipNotifications?: boolean
  /**
   * Skip reassigning default subscription (useful when migration will create new subscription)
   */
  skipReassignDefaultSubscription?: boolean
  /**
   * Custom cancellation reason to set on the subscription
   */
  cancellationReason?: string
}

// Cancel a subscription immediately
export const cancelSubscriptionImmediately = async (
  params: CancelSubscriptionImmediatelyParams,
  ctx: TransactionEffectsContext
): Promise<TransactionOutput<Subscription.Record>> => {
  const { transaction, invalidateCache, emitEvent } = ctx
  const {
    subscription,
    customer: providedCustomer,
    skipNotifications = false,
    skipReassignDefaultSubscription = false,
    cancellationReason,
  } = params
  const customer =
    providedCustomer ??
    (await selectCustomerById(subscription.customerId, transaction))

  // Cache invalidation for this customer's subscriptions
  invalidateCache(
    CacheDependency.customerSubscriptions(subscription.customerId)
  )

  if (isSubscriptionInTerminalState(subscription.status)) {
    emitEvent(
      constructSubscriptionCanceledEventInsert(subscription, customer)
    )
    return { result: subscription }
  }
  if (
    subscription.canceledAt &&
    subscription.status !== SubscriptionStatus.Canceled
  ) {
    const updatedSubscription = await safelyUpdateSubscriptionStatus(
      subscription,
      SubscriptionStatus.Canceled,
      transaction
    )
    emitEvent(
      constructSubscriptionCanceledEventInsert(
        updatedSubscription,
        customer
      )
    )
    return { result: updatedSubscription }
  }
  const endDate = Date.now()
  const status = SubscriptionStatus.Canceled

  const billingPeriodsForSubscription = await selectBillingPeriods(
    { subscriptionId: subscription.id },
    transaction
  )
  const earliestBillingPeriod = billingPeriodsForSubscription.sort(
    (a, b) => a.startDate - b.startDate
  )[0]
  if (
    earliestBillingPeriod &&
    endDate < earliestBillingPeriod.startDate
  ) {
    throw new Error(
      `Cannot end a subscription before its start date. Subscription start date: ${new Date(earliestBillingPeriod.startDate).toISOString()}, received end date: ${new Date(endDate).toISOString()}`
    )
  }

  let updatedSubscription = await updateSubscription(
    {
      id: subscription.id,
      canceledAt: endDate,
      cancelScheduledAt: endDate,
      status,
      ...(cancellationReason ? { cancellationReason } : {}),
      renews: subscription.renews,
    },
    transaction
  )

  const result = await safelyUpdateSubscriptionStatus(
    subscription,
    status,
    transaction
  )
  /**
   * Mark all billing periods that have not started yet as canceled
   */
  for (const billingPeriod of billingPeriodsForSubscription) {
    if (billingPeriod.startDate > endDate) {
      await safelyUpdateBillingPeriodStatus(
        billingPeriod,
        BillingPeriodStatus.Canceled,
        transaction
      )
    }
    /**
     * Mark the billing period with the cancellation date as completed
     */
    if (
      billingPeriod.startDate < endDate &&
      billingPeriod.endDate > endDate
    ) {
      await safelyUpdateBillingPeriodStatus(
        billingPeriod,
        BillingPeriodStatus.Completed,
        transaction
      )
      await updateBillingPeriod(
        { id: billingPeriod.id, endDate },
        transaction
      )
    }
    /**
     * Mark all prior billing periods with PastDue status as Canceled
     */
    if (billingPeriod.status === BillingPeriodStatus.PastDue) {
      await safelyUpdateBillingPeriodStatus(
        billingPeriod,
        BillingPeriodStatus.Canceled,
        transaction
      )
    }
  }

  /**
   * Abort all scheduled billing runs for the subscription
   */
  await abortScheduledBillingRuns(subscription.id, ctx)

  /**
   * Expire all subscription items and their features
   */
  // Fetch all subscription items for this subscription
  const subscriptionItems = await selectSubscriptionItems(
    { subscriptionId: subscription.id },
    transaction
  )
  // Filter to only items that haven't been expired yet
  const itemsToExpire = subscriptionItems.filter(
    (item) => !item.expiredAt
  )

  await expireSubscriptionItems(
    itemsToExpire.map((item) => item.id),
    endDate,
    transaction
  )

  // Add cache invalidation for each expired subscription item's features
  invalidateCache(
    ...itemsToExpire.map((item) =>
      CacheDependency.subscriptionItemFeatures(item.id)
    )
  )

  // Release all active resource claims for this subscription
  await releaseAllResourceClaimsForSubscription(
    subscription.id,
    'subscription_canceled',
    transaction
  )

  if (result) {
    updatedSubscription = result
  }

  if (!skipReassignDefaultSubscription) {
    await reassignDefaultSubscription(updatedSubscription, ctx)
  }

  if (!skipNotifications) {
    try {
      await idempotentSendCustomerSubscriptionCanceledNotification(
        updatedSubscription.id
      )
    } catch (error) {
      console.error(
        'Failed to send customer subscription canceled notification',
        {
          subscriptionId: updatedSubscription.id,
          error,
        }
      )
    }
    try {
      await idempotentSendOrganizationSubscriptionCanceledNotification(
        updatedSubscription
      )
    } catch (error) {
      console.error(
        'Failed to send organization subscription canceled notification',
        {
          subscriptionId: updatedSubscription.id,
          error,
        }
      )
    }
  }

  emitEvent(
    constructSubscriptionCanceledEventInsert(
      updatedSubscription,
      customer
    )
  )
  return { result: updatedSubscription }
}

// Schedule a subscription cancellation for the future
export const scheduleSubscriptionCancellation = async (
  params: ScheduleSubscriptionCancellationParams,
  ctx: TransactionEffectsContext
): Promise<Subscription.Record> => {
  const { transaction } = ctx
  const { id, cancellation } =
    scheduleSubscriptionCancellationSchema.parse(params)
  const { timing } = cancellation
  const subscription = await selectSubscriptionById(id, transaction)

  /**
   * Prevent cancellation of free plans through the API/UI.
   * See note in cancelSubscriptionProcedureTransaction for details.
   */
  if (subscription.isFreePlan) {
    throw new Error(
      'Cannot cancel the default free plan. Please upgrade to a paid plan instead.'
    )
  }

  if (isSubscriptionInTerminalState(subscription.status)) {
    return subscription
  }

  let endDate: number

  if (
    timing ===
    SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod
  ) {
    const currentBillingPeriod =
      await selectCurrentBillingPeriodForSubscription(
        subscription.id,
        transaction
      )
    if (!currentBillingPeriod) {
      throw new Error('No current billing period found')
    }
    endDate = currentBillingPeriod.endDate
  } else if (
    timing === SubscriptionCancellationArrangement.Immediately
  ) {
    endDate = Date.now()
  } else {
    throw new Error('Invalid cancellation arrangement')
  }

  const status = SubscriptionStatus.CancellationScheduled

  const billingPeriodsForSubscription = await selectBillingPeriods(
    { subscriptionId: subscription.id },
    transaction
  )
  const earliestBillingPeriod = billingPeriodsForSubscription.sort(
    (a, b) => a.startDate - b.startDate
  )[0]
  if (
    earliestBillingPeriod &&
    endDate < earliestBillingPeriod.startDate
  ) {
    throw new Error(
      `Cannot end a subscription before its start date. Subscription start date: ${new Date(earliestBillingPeriod.startDate).toISOString()}, received end date: ${new Date(endDate).toISOString()}`
    )
  }
  const cancelScheduledAt = endDate
  if (!subscription.renews) {
    throw new Error(
      `Subscription ${subscription.id} is a non-renewing subscription. Non-renewing subscriptions cannot be cancelled (Should never hit this)`
    )
  }
  let updatedSubscription = await updateSubscription(
    {
      id: subscription.id,
      cancelScheduledAt,
      status,
      renews: subscription.renews,
    },
    transaction
  )

  /**
   * Mark all billing periods that have not started yet as scheduled to cancel
   */
  for (const billingPeriod of billingPeriodsForSubscription) {
    if (billingPeriod.startDate > endDate) {
      await safelyUpdateBillingPeriodStatus(
        billingPeriod,
        BillingPeriodStatus.ScheduledToCancel,
        transaction
      )
    }
  }

  /**
   * Abort all scheduled billing runs for the subscription
   */
  await abortScheduledBillingRuns(subscription.id, ctx)

  const result = await safelyUpdateSubscriptionStatus(
    subscription,
    status,
    transaction
  )
  if (result) {
    updatedSubscription = result
  }
  try {
    await idempotentSendOrganizationSubscriptionCancellationScheduledNotification(
      updatedSubscription,
      endDate
    )
  } catch (error) {
    console.error(
      'Failed to send organization subscription cancellation scheduled notification',
      {
        subscriptionId: updatedSubscription.id,
        error,
      }
    )
  }
  try {
    await idempotentSendCustomerSubscriptionCancellationScheduledNotification(
      updatedSubscription.id,
      endDate
    )
  } catch (error) {
    console.error(
      'Failed to send customer subscription cancellation scheduled notification',
      {
        subscriptionId: updatedSubscription.id,
        error,
      }
    )
  }
  return updatedSubscription
}

type CancelSubscriptionProcedureParams =
  ComprehensiveAuthenticatedProcedureTransactionParams<
    ScheduleSubscriptionCancellationParams,
    { apiKey?: string }
  >

/**
 * Procedure transaction handler for canceling subscriptions.
 * Routes to either immediate or scheduled cancellation based on the input timing.
 *
 * For immediate cancellations:
 * - Calls `cancelSubscriptionImmediately` which emits a `SubscriptionCanceled` event
 * - Returns the canceled subscription with events to insert
 *
 * For scheduled cancellations (end of billing period):
 * - Calls `scheduleSubscriptionCancellation` which schedules the cancellation
 * - Returns the scheduled subscription with no events (events emitted when cancellation executes)
 *
 * @param params - Procedure transaction parameters
 * @param params.input - Cancellation request with subscription ID and timing arrangement
 * @param params.transaction - Active database transaction
 * @param params.ctx - Request context (may contain apiKey)
 * @returns Promise resolving to TransactionOutput with the updated subscription (formatted for client) and events to insert
 */
export const cancelSubscriptionProcedureTransaction = async ({
  input,
  transaction,
  invalidateCache,
  emitEvent,
  enqueueLedgerCommand,
}: CancelSubscriptionProcedureParams): Promise<
  TransactionOutput<{ subscription: Subscription.ClientRecord }>
> => {
  // Construct context for internal function calls
  const ctx: TransactionEffectsContext = {
    transaction,
    invalidateCache,
    emitEvent,
    enqueueLedgerCommand,
  }

  // Fetch subscription first to check if it's a free plan
  const subscription = await selectSubscriptionById(
    input.id,
    transaction
  )

  /**
   * Prevent cancellation of free plans through the API/UI.
   *
   * Note: This check is intentionally placed in the procedure transaction handler
   * and scheduleSubscriptionCancellation. During free-to-paid upgrades, the
   * createSubscriptionWorkflow bypasses these functions and uses updateSubscription
   * directly with cancellationReason = 'UpgradedToPaid', allowing the system to
   * programmatically cancel free plans as part of the upgrade flow.
   */
  if (subscription.isFreePlan) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'Cannot cancel the default free plan. Please upgrade to a paid plan instead.',
    })
  }

  if (
    input.cancellation.timing ===
    SubscriptionCancellationArrangement.Immediately
  ) {
    // Note: subscription is already fetched above, can reuse it
    const { result: updatedSubscription } =
      await cancelSubscriptionImmediately({ subscription }, ctx)
    return {
      result: {
        subscription: {
          ...updatedSubscription,
          current: isSubscriptionCurrent(
            updatedSubscription.status,
            updatedSubscription.cancellationReason
          ),
        },
      },
    }
  }
  const updatedSubscription = await scheduleSubscriptionCancellation(
    input,
    ctx
  )
  // Queue cache invalidation via effects context
  invalidateCache(
    CacheDependency.customerSubscriptions(
      updatedSubscription.customerId
    )
  )
  return {
    result: {
      subscription: {
        ...updatedSubscription,
        current: isSubscriptionCurrent(
          updatedSubscription.status,
          updatedSubscription.cancellationReason
        ),
      },
    },
  }
}

// ============================================================================
// Uncancel Subscription Functions
// ============================================================================

/**
 * Determines the previous subscription status to restore when uncanceling.
 * If the subscription has a trial end date in the future, it was likely Trialing.
 * Otherwise, default to Active.
 */
const determinePreviousSubscriptionStatus = (
  subscription: Subscription.Record
): SubscriptionStatus.Active | SubscriptionStatus.Trialing => {
  if (subscription.trialEnd && subscription.trialEnd > Date.now()) {
    return SubscriptionStatus.Trialing
  }
  return SubscriptionStatus.Active
}

/**
 * Reschedules billing runs for uncanceled billing periods.
 * - For paid subscriptions: Requires a valid payment method before allowing uncancel.
 * - For free or doNotCharge subscriptions: No payment method required, no billing runs created.
 * - Creates NEW billing runs for periods with Aborted runs.
 * - Leaves Scheduled runs as-is (already valid).
 * - Skips terminal runs (Succeeded/Failed).
 */
const rescheduleBillingRunsForUncanceledPeriods = async (
  subscription: Subscription.Record,
  billingPeriods: BillingPeriod.Record[],
  transaction: DbTransaction
): Promise<void> => {
  // Get payment method for billing run creation (with fallback to backup)
  const paymentMethodId =
    subscription.defaultPaymentMethodId ??
    subscription.backupPaymentMethodId

  const paymentMethod = paymentMethodId
    ? await selectPaymentMethodById(paymentMethodId, transaction)
    : null

  // Security check: For paid subscriptions, require payment method
  // doNotCharge subscriptions are exempt from this requirement
  if (
    !subscription.isFreePlan &&
    !subscription.doNotCharge &&
    !paymentMethod
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Cannot uncancel paid subscription without an active payment method. Please add a payment method first.',
    })
  }

  if (!paymentMethod) {
    // Free or doNotCharge subscription with no payment method - no billing runs needed
    return
  }

  // Filter to periods that need billing runs
  const periodsNeedingRuns = billingPeriods.filter(
    (bp) =>
      !bp.trialPeriod && bp.status !== BillingPeriodStatus.Completed
  )

  for (const billingPeriod of periodsNeedingRuns) {
    const existingRuns = await selectBillingRuns(
      { billingPeriodId: billingPeriod.id },
      transaction
    )

    // Leave Scheduled runs as-is (already valid)
    const hasScheduledRun = existingRuns.some(
      (run) => run.status === BillingRunStatus.Scheduled
    )
    if (hasScheduledRun) continue

    // Skip terminal runs (nothing to restore)
    const hasTerminalRun = existingRuns.some(
      (run) =>
        run.status === BillingRunStatus.Succeeded ||
        run.status === BillingRunStatus.Failed
    )
    if (hasTerminalRun) continue

    // For Aborted runs or no runs: create a new billing run
    // Note aborted runs should be those set from scheduleSubscriptionCancellation
    // not from processPaymentIntentEventForBillingRun set from Stripe
    const hasActiveOrStripeAbortedRun = existingRuns.some(
      (run) =>
        run.status === BillingRunStatus.InProgress ||
        run.status === BillingRunStatus.AwaitingPaymentConfirmation ||
        // Skip if aborted by Stripe (has payment intent event timestamp)
        (run.status === BillingRunStatus.Aborted &&
          run.lastPaymentIntentEventTimestamp !== null)
    )

    if (hasActiveOrStripeAbortedRun) {
      continue
    }

    const scheduledFor = subscription.runBillingAtPeriodStart
      ? billingPeriod.startDate
      : billingPeriod.endDate

    if (scheduledFor > Date.now()) {
      await createBillingRun(
        {
          billingPeriod,
          paymentMethod,
          scheduledFor: new Date(scheduledFor),
        },
        transaction
      )
    }
  }
}

/**
 * Reverses a scheduled subscription cancellation.
 *
 * Idempotent behavior:
 * - Silently succeeds if subscription is in terminal state.
 * - Silently succeeds if subscription is not in CancellationScheduled status.
 * - Silently succeeds if nothing is scheduled to cancel.
 *
 * State restoration:
 * - Reverts subscription status from CancellationScheduled to Active or Trialing.
 * - Clears cancelScheduledAt.
 * - Reverts billing periods from ScheduledToCancel to Upcoming/Active.
 * - Creates NEW billing runs for periods with Aborted runs.
 *
 * Security:
 * - For paid subscriptions, requires a valid payment method.
 * - For free subscriptions, allows uncancel without payment method.
 * - For doNotCharge subscriptions, allows uncancel without payment method.
 */
export const uncancelSubscription = async (
  subscription: Subscription.Record,
  ctx: TransactionEffectsContext
): Promise<TransactionOutput<Subscription.Record>> => {
  const { transaction, invalidateCache } = ctx
  // Cache invalidation for this customer's subscriptions
  invalidateCache(
    CacheDependency.customerSubscriptions(subscription.customerId)
  )

  // Idempotent behavior: If subscription is in terminal state, silently succeed
  if (isSubscriptionInTerminalState(subscription.status)) {
    return {
      result: subscription,
    }
  }

  // Idempotent behavior: If subscription is not scheduled to cancel, silently succeed
  if (
    subscription.status !== SubscriptionStatus.CancellationScheduled
  ) {
    return {
      result: subscription,
    }
  }

  // Check if there's anything to undo
  const billingPeriods = await selectBillingPeriods(
    { subscriptionId: subscription.id },
    transaction
  )
  const hasScheduledToCancelPeriods = billingPeriods.some(
    (bp) => bp.status === BillingPeriodStatus.ScheduledToCancel
  )

  // Idempotent behavior: If nothing is scheduled to cancel, silently succeed
  if (
    !subscription.cancelScheduledAt &&
    !hasScheduledToCancelPeriods
  ) {
    return {
      result: subscription,
    }
  }

  // Security check for paid subscriptions (moved before state changes)
  await rescheduleBillingRunsForUncanceledPeriods(
    subscription,
    billingPeriods,
    transaction
  )

  // Determine previous status
  const previousStatus =
    determinePreviousSubscriptionStatus(subscription)

  // Revert billing periods from ScheduledToCancel
  for (const billingPeriod of billingPeriods) {
    if (
      billingPeriod.status === BillingPeriodStatus.ScheduledToCancel
    ) {
      const newStatus =
        billingPeriod.startDate > Date.now()
          ? BillingPeriodStatus.Upcoming
          : BillingPeriodStatus.Active
      await safelyUpdateBillingPeriodStatus(
        billingPeriod,
        newStatus,
        transaction
      )
    }
  }

  // Update subscription: clear cancelScheduledAt and revert status
  const updatedSubscription = await updateSubscription(
    {
      id: subscription.id,
      cancelScheduledAt: null,
      status: previousStatus,
      renews: subscription.renews,
    },
    transaction
  )

  // Note: No events are emitted for uncancel
  return {
    result: updatedSubscription,
  }
}

type UncancelSubscriptionProcedureParams =
  ComprehensiveAuthenticatedProcedureTransactionParams<
    { id: string },
    { apiKey?: string }
  >

/**
 * Procedure transaction handler for uncanceling subscriptions.
 * Reverses a scheduled subscription cancellation.
 *
 * @param params - Procedure transaction parameters
 * @param params.input - Uncancel request with subscription ID
 * @param params.transaction - Active database transaction
 * @returns Promise resolving to TransactionOutput with the updated subscription
 */
export const uncancelSubscriptionProcedureTransaction = async ({
  input,
  transaction,
  invalidateCache,
  emitEvent,
  enqueueLedgerCommand,
}: UncancelSubscriptionProcedureParams): Promise<
  TransactionOutput<{ subscription: Subscription.ClientRecord }>
> => {
  const ctx: TransactionEffectsContext = {
    transaction,
    invalidateCache,
    emitEvent,
    enqueueLedgerCommand,
  }

  const subscription = await selectSubscriptionById(
    input.id,
    transaction
  )

  const { result: updatedSubscription } = await uncancelSubscription(
    subscription,
    ctx
  )

  return {
    result: {
      subscription: {
        ...updatedSubscription,
        current: isSubscriptionCurrent(
          updatedSubscription.status,
          updatedSubscription.cancellationReason
        ),
      },
    },
  }
}
