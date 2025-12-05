import { TRPCError } from '@trpc/server'
import type { AuthenticatedProcedureTransactionParams } from '@/db/authenticatedTransaction'
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
import { selectPricesAndProductsByProductWhere } from '@/db/tableMethods/priceMethods'
import { selectDefaultPricingModel } from '@/db/tableMethods/pricingModelMethods'
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
import type { DbTransaction } from '@/db/types'
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
import { constructSubscriptionCanceledEventHash } from '@/utils/eventHelpers'

// Abort all scheduled billing runs for a subscription
export const abortScheduledBillingRuns = async (
  subscriptionId: string,
  transaction: DbTransaction
) => {
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
 * @param transaction Active database transaction.
 * @returns Resolves when the reassignment logic finishes.
 */
export const reassignDefaultSubscription = async (
  canceledSubscription: Subscription.Record,
  transaction: DbTransaction
) => {
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

    let pricingModelId = customer.pricingModelId

    if (!pricingModelId) {
      const defaultPricingModel = await selectDefaultPricingModel(
        {
          organizationId: organization.id,
          livemode: canceledSubscription.livemode,
        },
        transaction
      )

      pricingModelId = defaultPricingModel?.id ?? null
    }

    if (!pricingModelId) {
      console.warn(
        `reassignDefaultSubscription: no pricing model found for customer ${customer.id}`
      )
      return
    }

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
      transaction
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
// Cancel a subscription immediately
export const cancelSubscriptionImmediately = async (
  subscription: Subscription.Record,
  transaction: DbTransaction
): Promise<TransactionOutput<Subscription.Record>> => {
  const customer = await selectCustomerById(
    subscription.customerId,
    transaction
  )
  if (isSubscriptionInTerminalState(subscription.status)) {
    return {
      result: subscription,
      eventsToInsert: [
        constructSubscriptionCanceledEventInsert(
          subscription,
          customer
        ),
      ],
    }
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
    return {
      result: updatedSubscription,
      eventsToInsert: [
        constructSubscriptionCanceledEventInsert(
          updatedSubscription,
          customer
        ),
      ],
    }
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
  await abortScheduledBillingRuns(subscription.id, transaction)

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
  if (result) {
    updatedSubscription = result
  }
  await reassignDefaultSubscription(updatedSubscription, transaction)
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
  return {
    result: updatedSubscription,
    eventsToInsert: [
      constructSubscriptionCanceledEventInsert(
        updatedSubscription,
        customer
      ),
    ],
  }
}

// Schedule a subscription cancellation for the future
export const scheduleSubscriptionCancellation = async (
  params: ScheduleSubscriptionCancellationParams,
  transaction: DbTransaction
): Promise<Subscription.Record> => {
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
  await abortScheduledBillingRuns(subscription.id, transaction)

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
  AuthenticatedProcedureTransactionParams<
    ScheduleSubscriptionCancellationParams,
    { subscription: Subscription.ClientRecord },
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
 * For scheduled cancellations (end of billing period or future date):
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
  ctx,
}: CancelSubscriptionProcedureParams): Promise<
  TransactionOutput<{ subscription: Subscription.ClientRecord }>
> => {
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
    const { result: updatedSubscription, eventsToInsert } =
      await cancelSubscriptionImmediately(subscription, transaction)
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
      eventsToInsert,
    }
  }
  const updatedSubscription = await scheduleSubscriptionCancellation(
    input,
    transaction
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
    eventsToInsert: [],
  }
}
