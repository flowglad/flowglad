import { DbTransaction } from '@/db/types'
import {
  CreateSubscriptionParams,
  CreditTrialCreateSubscriptionResult,
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

  const { billingPeriod, billingPeriodItems, billingRun } =
    await maybeCreateInitialBillingPeriodAndRun(
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

  const ledgerCommand:
    | BillingPeriodTransitionLedgerCommand
    | undefined =
    subscription.status === SubscriptionStatus.Incomplete
      ? undefined
      : {
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
