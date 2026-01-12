import type { BillingPeriodTransitionLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import type { Event } from '@/db/schema/events'
import type { Subscription } from '@/db/schema/subscriptions'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { updateDiscountRedemption } from '@/db/tableMethods/discountRedemptionMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectSubscriptionAndItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  selectSubscriptions,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import type { TransactionOutput } from '@/db/transactionEnhacementTypes'
import type { DbTransaction } from '@/db/types'
import { idempotentSendCustomerSubscriptionCreatedNotification } from '@/trigger/notifications/send-customer-subscription-created-notification'
import { idempotentSendCustomerSubscriptionUpgradedNotification } from '@/trigger/notifications/send-customer-subscription-upgraded-notification'
import { idempotentSendOrganizationSubscriptionCreatedNotification } from '@/trigger/notifications/send-organization-subscription-created-notification'
import {
  CancellationReason,
  EventNoun,
  FeatureFlag,
  FlowgladEventType,
  LedgerTransactionType,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import type { CacheDependencyKey } from '@/utils/cache'
import { CacheDependency } from '@/utils/cache'
import { calculateTrialEligibility } from '@/utils/checkoutHelpers'
import { constructSubscriptionCreatedEventHash } from '@/utils/eventHelpers'
import { logger } from '@/utils/logger'
import { hasFeatureFlag } from '@/utils/organizationHelpers'
import { createSubscriptionFeatureItems } from '../subscriptionItemFeatureHelpers'
import {
  ledgerCommandPayload,
  maybeCreateInitialBillingPeriodAndRun,
  maybeDefaultPaymentMethodForSubscription,
  safelyProcessCreationForExistingSubscription,
  verifyCanCreateSubscription,
} from './helpers'
import { insertSubscriptionAndItems } from './initializers'
import type {
  CreateSubscriptionParams,
  NonRenewingCreateSubscriptionResult,
  StandardCreateSubscriptionResult,
} from './types'

/**
 * Transaction context for workflow functions.
 * Contains the database transaction and optional effect callbacks.
 */
export interface WorkflowTransactionContext {
  transaction: DbTransaction
  /**
   * Queue cache dependency keys to be invalidated after the transaction commits.
   * Use CacheDependency helpers to construct keys.
   */
  invalidateCache?: (...keys: CacheDependencyKey[]) => void
  /**
   * Queue events to be inserted before the transaction commits.
   */
  emitEvent?: (...events: Event.Insert[]) => void
}

/**
 * NOTE: as a matter of safety, we do not create a billing run if autoStart is not provided.
 * This is because the subscription will not be active until the organization has started it,
 * and we do not want to create a billing run if the organization has not explicitly opted to start the subscription.
 * @param params
 * @param ctx - Transaction context with database transaction and optional effect callbacks
 * @returns
 */
export const createSubscriptionWorkflow = async (
  params: CreateSubscriptionParams,
  ctx: WorkflowTransactionContext
): Promise<
  TransactionOutput<
    | StandardCreateSubscriptionResult
    | NonRenewingCreateSubscriptionResult
  >
> => {
  // Destructure context for cleaner code below
  const { transaction, invalidateCache, emitEvent } = ctx

  // FIXME: Re-enable this once usage prices are fully deprecated
  if (
    params.price.type === PriceType.Usage &&
    !hasFeatureFlag(
      params.organization,
      FeatureFlag.SubscriptionWithUsage
    )
  ) {
    throw new Error(
      `Price id: ${params.price.id} has usage price. Usage prices are not supported for subscription creation.`
    )
  }

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

  // Check if we're creating a paid plan (unitPrice !== 0)
  const isCreatingPaidPlan = params.price.unitPrice !== 0

  // If creating a paid plan, check for and cancel any existing free subscriptions
  let canceledFreeSubscription: Subscription.Record | null = null
  if (isCreatingPaidPlan) {
    // Find active free subscriptions for the customer
    const activeSubscriptions = await selectSubscriptions(
      {
        customerId: params.customer.id,
        status: SubscriptionStatus.Active,
      },
      transaction
    )

    const freeSubscriptions = activeSubscriptions.filter(
      (sub) => sub.isFreePlan === true
    )

    if (freeSubscriptions.length > 0) {
      // If multiple free subscriptions exist (edge case), cancel the most recent one
      if (freeSubscriptions.length > 1) {
        logger.warn(
          `Multiple free subscriptions found for customer ${params.customer.id}. ` +
            `Canceling the most recent one (${freeSubscriptions.length} total). ` +
            `This is an edge case that should be investigated.`,
          {
            customerId: params.customer.id,
            freeSubscriptionCount: freeSubscriptions.length,
          }
        )
      }
      // Find the most recent free subscription to cancel
      const subscriptionToCancel = freeSubscriptions.reduce(
        (latest, current) => {
          const latestTime = new Date(latest.createdAt).getTime()
          const currentTime = new Date(current.createdAt).getTime()
          return currentTime > latestTime ? current : latest
        }
      )

      // Handle billing cycle preservation if requested
      // We need to capture billing cycle info BEFORE canceling
      if (params.preserveBillingCycleAnchor) {
        const startDate =
          params.startDate instanceof Date
            ? params.startDate.getTime()
            : params.startDate

        // Preserve billing cycle from the free subscription
        params.billingCycleAnchorDate =
          subscriptionToCancel.billingCycleAnchorDate || startDate
        params.preservedBillingPeriodEnd =
          subscriptionToCancel.currentBillingPeriodEnd || undefined
        params.preservedBillingPeriodStart =
          subscriptionToCancel.currentBillingPeriodStart || undefined
        params.prorateFirstPeriod = true

        // Validate that we're not past the period end
        if (
          params.preservedBillingPeriodEnd &&
          startDate > params.preservedBillingPeriodEnd
        ) {
          // If we're past the period, don't preserve (start a new cycle)
          params.billingCycleAnchorDate = undefined
          params.preservedBillingPeriodEnd = undefined
          params.preservedBillingPeriodStart = undefined
          params.prorateFirstPeriod = false
        }
      }

      // Cancel the free subscription
      canceledFreeSubscription = await updateSubscription(
        {
          id: subscriptionToCancel.id,
          renews: subscriptionToCancel.renews,
          status: SubscriptionStatus.Canceled,
          canceledAt: Date.now(),
          cancellationReason: CancellationReason.UpgradedToPaid,
        },
        transaction
      )
    }
  }

  // Check trial eligibility and override trialEnd if customer is not eligible
  // This ensures consistency with the checkout flow behavior
  let finalTrialEnd = params.trialEnd
  const hasTrialPeriod =
    params.trialEnd ||
    (params.price.trialPeriodDays && params.price.trialPeriodDays > 0)

  if (hasTrialPeriod) {
    // Fetch customer to check trial eligibility
    const customer = await selectCustomerById(
      params.customer.id,
      transaction
    )
    // Fetch price record to check trial eligibility
    const price = await selectPriceById(params.price.id, transaction)

    // Calculate trial eligibility (returns undefined for non-subscription prices)
    const isEligibleForTrial = await calculateTrialEligibility(
      price,
      customer,
      transaction
    )

    // If not eligible, remove trial period (similar to checkout flow setting trialPeriodDays to null)
    if (isEligibleForTrial === false) {
      finalTrialEnd = undefined
    }
  }

  // Update params with the final trialEnd value
  params = {
    ...params,
    trialEnd: finalTrialEnd,
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

  // Link the canceled free subscription to the new paid subscription
  if (canceledFreeSubscription) {
    await updateSubscription(
      {
        id: canceledFreeSubscription.id,
        renews: canceledFreeSubscription.renews,
        replacedBySubscriptionId: subscription.id,
      },
      transaction
    )
  }

  if (params.discountRedemption) {
    await updateDiscountRedemption(
      {
        ...params.discountRedemption,
        subscriptionId: subscription.id,
      },
      transaction
    )
  }
  const { price } = params
  const subscriptionItemFeatures =
    await createSubscriptionFeatureItems(
      subscriptionItems,
      transaction
    )

  const {
    subscription: updatedSubscription,
    billingPeriod,
    billingPeriodItems,
    billingRun,
  } = await maybeCreateInitialBillingPeriodAndRun(
    {
      subscription,
      subscriptionItems,
      defaultPaymentMethod,
      autoStart: params.autoStart ?? false,
      prorateFirstPeriod: params.prorateFirstPeriod,
      preservedBillingPeriodEnd: params.preservedBillingPeriodEnd,
      preservedBillingPeriodStart: params.preservedBillingPeriodStart,
      isDefaultPlan: params.product.default,
    },
    transaction
  )
  // Don't send notifications for free subscriptions
  // A subscription is considered free if unitPrice is 0, not based on slug
  if (price.unitPrice !== 0) {
    // Send organization notification
    await idempotentSendOrganizationSubscriptionCreatedNotification(
      updatedSubscription
    )

    // Send customer notification - choose based on whether this is an upgrade
    if (canceledFreeSubscription) {
      // This is an upgrade from free to paid
      await idempotentSendCustomerSubscriptionUpgradedNotification({
        customerId: updatedSubscription.customerId,
        newSubscriptionId: updatedSubscription.id,
        previousSubscriptionId: canceledFreeSubscription.id,
        organizationId: updatedSubscription.organizationId,
      })
    } else {
      // This is a new paid subscription
      await idempotentSendCustomerSubscriptionCreatedNotification({
        customerId: updatedSubscription.customerId,
        subscriptionId: updatedSubscription.id,
        organizationId: updatedSubscription.organizationId,
      })
    }
  }

  const timestamp = Date.now()
  const customer = await selectCustomerById(
    updatedSubscription.customerId,
    transaction
  )

  if (!customer) {
    throw new Error(
      `Customer not found for subscription ${updatedSubscription.id}`
    )
  }

  const eventInserts: Event.Insert[] = [
    {
      type: FlowgladEventType.SubscriptionCreated,
      occurredAt: timestamp,
      organizationId: updatedSubscription.organizationId,
      livemode: updatedSubscription.livemode,
      payload: {
        object: EventNoun.Subscription,
        id: updatedSubscription.id,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      },
      submittedAt: timestamp,
      hash: constructSubscriptionCreatedEventHash(
        updatedSubscription
      ),
      metadata: {},
      processedAt: null,
    },
  ]

  let ledgerCommand: BillingPeriodTransitionLedgerCommand | undefined

  /* 
    Create the ledger command here if we are not expecting a payment intent
    Cases:
      - Subscription status must not be incomplete
      - Subscription is non-renewing
        - This is derviative for a usage-based subscriptions (pay as you go)
      - Free plans should be a right of passage because we they will not have payments
      - Trial periods do not have payments either
   */
  if (
    updatedSubscription.status !== SubscriptionStatus.Incomplete &&
    (updatedSubscription.renews === false ||
      updatedSubscription.isFreePlan === true ||
      updatedSubscription.status === SubscriptionStatus.Trialing)
  ) {
    ledgerCommand = {
      organizationId: updatedSubscription.organizationId,
      subscriptionId: updatedSubscription.id,
      livemode: updatedSubscription.livemode,
      type: LedgerTransactionType.BillingPeriodTransition,
      payload: ledgerCommandPayload({
        subscription: updatedSubscription,
        subscriptionItemFeatures,
        billingPeriod,
        billingPeriodItems,
        billingRun,
      }),
    }
  }

  const transactionResult:
    | StandardCreateSubscriptionResult
    | NonRenewingCreateSubscriptionResult =
    updatedSubscription.renews === false
      ? {
          type: 'non_renewing',
          subscription: updatedSubscription,
          subscriptionItems,
          billingPeriod: null,
          billingPeriodItems: null,
          billingRun: null,
        }
      : {
          type: 'standard',
          subscription: updatedSubscription,
          subscriptionItems,
          billingPeriod,
          billingPeriodItems,
          billingRun,
        }

  // Invalidate customer subscriptions cache via effects context
  // This queues the invalidation to be processed after transaction commits
  invalidateCache?.(
    CacheDependency.customerSubscriptions(
      updatedSubscription.customerId
    )
  )

  // Emit subscription created event via effects context
  emitEvent?.(...eventInserts)

  return {
    result: transactionResult,
    ledgerCommand,
  }
}
