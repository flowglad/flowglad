import type { Customer } from '@/db/schema/customers'
import type { Event } from '@/db/schema/events'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  safelyUpdateBillingPeriodStatus,
  selectBillingPeriods,
  updateBillingPeriod,
} from '@/db/tableMethods/billingPeriodMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  selectPriceById,
  selectPricesAndProductsByProductWhere,
} from '@/db/tableMethods/priceMethods'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import {
  expireSubscriptionItems,
  selectSubscriptionItems,
} from '@/db/tableMethods/subscriptionItemMethods'
import {
  currentSubscriptionStatuses,
  isSubscriptionInTerminalState,
  safelyUpdateSubscriptionStatus,
  selectSubscriptions,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import type { TransactionOutput } from '@/db/transactionEnhacementTypes'
import type { DbTransaction } from '@/db/types'
import { abortScheduledBillingRuns } from '@/subscriptions/cancelSubscription'
import { createSubscriptionWorkflow } from '@/subscriptions/createSubscription'
import {
  BillingPeriodStatus,
  CancellationReason,
  EventNoun,
  FlowgladEventType,
  SubscriptionStatus,
} from '@/types'
import { constructSubscriptionCanceledEventHash } from '@/utils/eventHelpers'

/**
 * Cancels a subscription immediately for pricing model migration.
 * Similar to cancelSubscriptionImmediately but without reassignment or notifications.
 */
const cancelSubscriptionForMigration = async (
  subscription: Subscription.Record,
  customer: Customer.Record,
  transaction: DbTransaction
): Promise<TransactionOutput<Subscription.Record>> => {
  // If already in terminal state, just return with event
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

  // If already canceled but not in Canceled status, update status
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

  // Update subscription with cancellation details and migration reason
  let updatedSubscription = await updateSubscription(
    {
      id: subscription.id,
      canceledAt: endDate,
      cancelScheduledAt: endDate,
      status,
      cancellationReason: CancellationReason.PricingModelMigration,
      renews: subscription.renews,
    },
    transaction
  )

  const result = await safelyUpdateSubscriptionStatus(
    subscription,
    status,
    transaction
  )

  // Update billing periods
  for (const billingPeriod of billingPeriodsForSubscription) {
    // Mark future billing periods as canceled
    if (billingPeriod.startDate > endDate) {
      await safelyUpdateBillingPeriodStatus(
        billingPeriod,
        BillingPeriodStatus.Canceled,
        transaction
      )
    }
    // Mark the current billing period as completed
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
    // Mark all past due billing periods as canceled
    if (billingPeriod.status === BillingPeriodStatus.PastDue) {
      await safelyUpdateBillingPeriodStatus(
        billingPeriod,
        BillingPeriodStatus.Canceled,
        transaction
      )
    }
  }

  // Abort all scheduled billing runs
  await abortScheduledBillingRuns(subscription.id, transaction)

  // Expire all subscription items
  const subscriptionItems = await selectSubscriptionItems(
    { subscriptionId: subscription.id },
    transaction
  )
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

  // Note: Do NOT call reassignDefaultSubscription
  // Note: Do NOT send notifications

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

export interface MigratePricingModelForCustomerParams {
  customer: Customer.Record
  oldPricingModelId: string | null
  newPricingModelId: string
}

export interface MigratePricingModelForCustomerResult {
  customer: Customer.Record
  canceledSubscriptions: Subscription.Record[]
  newSubscription: Subscription.Record
}

/**
 * Migrates a customer from one pricing model to another by:
 * 1. Canceling all existing subscriptions immediately
 * 2. Creating a new default free plan subscription on the new pricing model
 *
 * @param params - Migration parameters including customer and pricing model IDs
 * @param transaction - Database transaction
 * @returns Transaction output with migration result and events
 */
export const migratePricingModelForCustomer = async (
  params: MigratePricingModelForCustomerParams,
  transaction: DbTransaction
): Promise<
  TransactionOutput<MigratePricingModelForCustomerResult>
> => {
  const { customer, oldPricingModelId, newPricingModelId } = params

  // If customer is already on the target pricing model, it's a no-op
  if (oldPricingModelId === newPricingModelId) {
    // Fetch subscriptions associated with the new pricing model
    const currentSubscriptions = await selectSubscriptions(
      {
        customerId: customer.id,
        status: currentSubscriptionStatuses,
      },
      transaction
    )

    // Filter to only subscriptions on the new pricing model
    // Follow the chain: subscription → price → product → pricingModelId
    const subscriptionsOnNewPricingModel: Subscription.Record[] = []
    for (const subscription of currentSubscriptions) {
      if (subscription.priceId) {
        const price = await selectPriceById(
          subscription.priceId,
          transaction
        )
        if (price?.productId) {
          const product = await selectProductById(
            price.productId,
            transaction
          )
          if (product?.pricingModelId === newPricingModelId) {
            subscriptionsOnNewPricingModel.push(subscription)
          }
        }
      }
    }

    if (subscriptionsOnNewPricingModel.length === 0) {
      // Create default subscription
      const { newSubscription, eventsToInsert } =
        await createDefaultSubscriptionOnPricingModel(
          customer,
          newPricingModelId,
          transaction
        )

      return {
        result: {
          customer,
          canceledSubscriptions: [],
          newSubscription,
        },
        eventsToInsert,
      }
    }

    // Find the subscription with default free price associated with a default product
    // Follow the chain: subscription → price → product
    let defaultFreeSubscription: Subscription.Record | undefined
    for (const subscription of subscriptionsOnNewPricingModel) {
      if (subscription.priceId) {
        const price = await selectPriceById(
          subscription.priceId,
          transaction
        )
        if (
          price?.unitPrice === 0 &&
          price.isDefault &&
          price.productId
        ) {
          const product = await selectProductById(
            price.productId,
            transaction
          )
          if (product?.default) {
            defaultFreeSubscription = subscription
            break
          }
        }
      }
    }

    if (!defaultFreeSubscription) {
      throw new Error(
        `Customer ${customer.id} is already on pricing model ${newPricingModelId} but has no subscription with a default free price associated with a default product`
      )
    }

    // Already on target model with subscriptions, nothing to do
    return {
      result: {
        customer,
        canceledSubscriptions: [],
        newSubscription: defaultFreeSubscription,
      },
      eventsToInsert: [],
    }
  }

  // Validate that the new pricing model exists
  const newPricingModel = await selectPricingModelById(
    newPricingModelId,
    transaction
  )

  if (!newPricingModel) {
    throw new Error(`Pricing model ${newPricingModelId} not found`)
  }

  // Validate that the new pricing model belongs to the same organization
  if (newPricingModel.organizationId !== customer.organizationId) {
    throw new Error(
      `Pricing model ${newPricingModelId} does not belong to organization ${customer.organizationId}`
    )
  }

  // Fetch all current subscriptions
  const currentSubscriptions = await selectSubscriptions(
    {
      customerId: customer.id,
      status: currentSubscriptionStatuses,
    },
    transaction
  )

  // Cancel all current subscriptions
  const canceledSubscriptions: Subscription.Record[] = []
  const eventsToInsert: Event.Insert[] = []

  for (const subscription of currentSubscriptions) {
    const {
      result: canceledSubscription,
      eventsToInsert: cancelEvents,
    } = await cancelSubscriptionForMigration(
      subscription,
      customer,
      transaction
    )
    canceledSubscriptions.push(canceledSubscription)
    if (cancelEvents) {
      eventsToInsert.push(...cancelEvents)
    }
  }

  // Create default subscription on new pricing model
  const { newSubscription, eventsToInsert: createEvents } =
    await createDefaultSubscriptionOnPricingModel(
      customer,
      newPricingModelId,
      transaction
    )
  if (createEvents) {
    eventsToInsert.push(...createEvents)
  }

  return {
    result: {
      customer,
      canceledSubscriptions,
      newSubscription,
    },
    eventsToInsert,
  }
}

/**
 * Creates a default free plan subscription on the specified pricing model.
 * If no default product exists, one will be created.
 */
async function createDefaultSubscriptionOnPricingModel(
  customer: Customer.Record,
  pricingModelId: string,
  transaction: DbTransaction
): Promise<{
  newSubscription: Subscription.Record
  eventsToInsert: Event.Insert[]
}> {
  const organization = await selectOrganizationById(
    customer.organizationId,
    transaction
  )

  // Try to find default product on the new pricing model
  let [defaultProduct] = await selectPricesAndProductsByProductWhere(
    {
      pricingModelId,
      default: true,
      active: true,
    },
    transaction
  )

  // If no default product exists, throw an error
  // We throw an error rather than auto-creating because it's unclear what price type
  // the default price should be (Subscription vs SinglePayment, and if Subscription,
  // what interval unit). The user should create the default product themselves and
  // set the appropriate price type.
  if (!defaultProduct) {
    throw new Error(
      `No default product found for pricing model ${pricingModelId}. Please create a default product with a default price before migrating customers to this pricing model.`
    )
  }

  const defaultPrice = defaultProduct.defaultPrice

  if (!defaultPrice) {
    throw new Error(
      `Default product ${defaultProduct.id} is missing a default price`
    )
  }

  const trialEnd = defaultPrice.trialPeriodDays
    ? new Date(
        Date.now() +
          defaultPrice.trialPeriodDays * 24 * 60 * 60 * 1000
      )
    : undefined

  // Create the subscription
  const subscriptionResult = await createSubscriptionWorkflow(
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

  return {
    newSubscription: subscriptionResult.result.subscription,
    eventsToInsert: subscriptionResult.eventsToInsert || [],
  }
}
