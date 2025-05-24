import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectCurrentBillingPeriodForSubscription } from '@/db/tableMethods/billingPeriodMethods'
import { PriceType } from '@/types'
import {
  insertUsageEvent,
  selectUsageEvents,
} from '@/db/tableMethods/usageEventMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { DbTransaction } from '@/db/types'
import { CreateUsageEventInput } from '@/db/schema/usageEvents'
import { createUsageEventLedgerTransaction } from './ledgerHelpers'

export const ingestAndProcessUsageEvent = async (
  {
    input,
    livemode,
  }: { input: CreateUsageEventInput; livemode: boolean },
  transaction: DbTransaction
) => {
  const usageEventInput = input.usageEvent
  const billingPeriod =
    await selectCurrentBillingPeriodForSubscription(
      usageEventInput.subscriptionId,
      transaction
    )
  if (!billingPeriod) {
    throw new Error('Billing period not found')
  }
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
    return existingUsageEvent
  }
  const subscription = await selectSubscriptionById(
    usageEventInput.subscriptionId,
    transaction
  )

  const usageEvent = await insertUsageEvent(
    {
      ...usageEventInput,
      usageMeterId: price.usageMeterId,
      billingPeriodId: billingPeriod.id,
      customerId: subscription.customerId,
      livemode,
      properties: usageEventInput.properties ?? {},
      usageDate: usageEventInput.usageDate
        ? new Date(usageEventInput.usageDate)
        : undefined,
    },
    transaction
  )
  await createUsageEventLedgerTransaction(
    { usageEvent, organizationId: subscription.organizationId },
    transaction
  )
  return usageEvent
}
