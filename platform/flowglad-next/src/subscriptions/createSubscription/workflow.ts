import { DbTransaction } from '@/db/types'
import {
  CreateSubscriptionParams,
  NonRenewingCreateSubscriptionResult,
  StandardCreateSubscriptionResult,
} from './types'
import {
  verifyCanCreateSubscription,
  maybeDefaultPaymentMethodForSubscription,
  safelyProcessCreationForExistingSubscription,
  setupLedgerAccounts,
  maybeCreateInitialBillingPeriodAndRun,
  ledgerCommandPayload,
} from './helpers'
import { insertSubscriptionAndItems } from './initializers'
import { selectSubscriptionAndItems } from '@/db/tableMethods/subscriptionItemMethods'
import { createSubscriptionFeatureItems } from '../subscriptionItemFeatureHelpers'
import { PriceType, FeatureType, SubscriptionStatus } from '@/types'
import { idempotentSendOrganizationSubscriptionCreatedNotification } from '@/trigger/notifications/send-organization-subscription-created-notification'
import { Event } from '@/db/schema/events'
import {
  FlowgladEventType,
  EventNoun,
  LedgerTransactionType,
} from '@/types'
import { constructSubscriptionCreatedEventHash } from '@/utils/eventHelpers'
import { TransactionOutput } from '@/db/transactionEnhacementTypes'
import { BillingPeriodTransitionLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import { updateDiscountRedemption } from '@/db/tableMethods/discountRedemptionMethods'

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
    | NonRenewingCreateSubscriptionResult
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

  const includesUsageCreditGrants = subscriptionItemFeatures.some(
    (item) => item.type === FeatureType.UsageCreditGrant
  )

  if (
    price.type === PriceType.Usage ||
    includesUsageCreditGrants ||
    price.startsWithCreditTrial
  ) {
    await setupLedgerAccounts(
      {
        subscription,
        subscriptionItems,
        price,
      },
      transaction
    )
  }

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
    },
    transaction
  )

  // Don't send notifications for free subscriptions
  // A subscription is considered free if unitPrice is 0, not based on slug
  if (price.unitPrice !== 0) {
    await idempotentSendOrganizationSubscriptionCreatedNotification(
      updatedSubscription
    )
  }

  const timestamp = new Date()
  const eventInserts: Event.Insert[] = [
    {
      type: FlowgladEventType.SubscriptionCreated,
      occurredAt: timestamp,
      organizationId: updatedSubscription.organizationId,
      livemode: updatedSubscription.livemode,
      payload: {
        object: EventNoun.Subscription,
        id: updatedSubscription.id,
      },
      submittedAt: timestamp,
      hash: constructSubscriptionCreatedEventHash(
        updatedSubscription
      ),
      metadata: {},
      processedAt: null,
    },
  ]

  const ledgerCommand:
    | BillingPeriodTransitionLedgerCommand
    | undefined =
    updatedSubscription.status === SubscriptionStatus.Incomplete
      ? undefined
      : {
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
  return {
    result: transactionResult,
    ledgerCommand,
    eventsToLog: eventInserts,
  }
}
