import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectCurrentBillingPeriodForSubscription } from '@/db/tableMethods/billingPeriodMethods'
import {
  LedgerTransactionType,
  PriceType,
  UsageMeterAggregationType,
} from '@/types'
import {
  insertUsageEvent,
  selectUsageEvents,
} from '@/db/tableMethods/usageEventMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { DbTransaction } from '@/db/types'
import { CreateUsageEventInput } from '@/db/schema/usageEvents'
import { TransactionOutput } from '@/db/transactionEnhacementTypes'
import { UsageEvent } from '@/db/schema/usageEvents'
import { selectUsageMeterById } from '@/db/tableMethods/usageMeterMethods'

export const ingestAndProcessUsageEvent = async (
  {
    input,
    livemode,
  }: { input: CreateUsageEventInput; livemode: boolean },
  transaction: DbTransaction
): Promise<TransactionOutput<{ usageEvent: UsageEvent.Record }>> => {
  const usageEventInput = input.usageEvent
  const billingPeriod =
    await selectCurrentBillingPeriodForSubscription(
      usageEventInput.subscriptionId,
      transaction
    )
  const price = await selectPriceById(
    usageEventInput.priceId,
    transaction
  )
  if (price.type !== PriceType.Usage) {
    throw new Error(
      `Price ${price.id} is not a usage price. Please provide a usage price id to create a usage event.`
    )
  }
  const [existingUsageEvent] = await selectUsageEvents(
    {
      transactionId: usageEventInput.transactionId,
      usageMeterId: price.usageMeterId,
    },
    transaction
  )
  if (existingUsageEvent) {
    if (
      existingUsageEvent.subscriptionId !==
      usageEventInput.subscriptionId
    ) {
      throw new Error(
        `A usage event already exists for transactionid ${usageEventInput.transactionId}, but does not belong to subscription ${usageEventInput.subscriptionId}. Please provide a unique transactionId to create a new usage event.`
      )
    }
    return { result: { usageEvent: existingUsageEvent } }
  }
  const subscription = await selectSubscriptionById(
    usageEventInput.subscriptionId,
    transaction
  )

  const usageEvent = await insertUsageEvent(
    {
      ...usageEventInput,
      usageMeterId: price.usageMeterId,
      billingPeriodId: billingPeriod?.id ?? null,
      customerId: subscription.customerId,
      livemode,
      properties: usageEventInput.properties ?? {},
      usageDate: usageEventInput.usageDate
        ? new Date(usageEventInput.usageDate).getTime()
        : Date.now(),
    },
    transaction
  )

  // Check if UsageMeter is of type count_distinct_properties
  // If so, only return a ledgerCommand if
  // there isn't already a usageEvent for the current billing period with the same properties object
  const usageMeter = await selectUsageMeterById(
    usageEvent.usageMeterId,
    transaction
  )
  if (
    usageMeter.aggregationType ===
    UsageMeterAggregationType.CountDistinctProperties
  ) {
    if (!billingPeriod) {
      throw new Error(
        `Billing period is required in ingestAndProcessUsageEvent for usage meter of type "count_distinct_properties".`
      )
    }
    const eventsInPeriod = await selectUsageEvents(
      {
        usageMeterId: usageEvent.usageMeterId,
        ...(usageEvent.properties && {
          properties: usageEvent.properties,
        }),
        billingPeriodId: billingPeriod.id,
      },
      transaction
    )
    // Filter out the just-inserted event
    const existingUsageEvent = eventsInPeriod.find(
      (event) => event.id !== usageEvent.id
    )
    if (existingUsageEvent) {
      return { result: { usageEvent } }
    }
  }

  return {
    result: { usageEvent },
    eventsToInsert: [],
    ledgerCommand: {
      type: LedgerTransactionType.UsageEventProcessed,
      livemode,
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
      payload: {
        usageEvent,
      },
    },
  }
}
