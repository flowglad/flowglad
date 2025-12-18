import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  type CreateUsageEventInput,
  USAGE_EVENT_PRICE_ID_DESCRIPTION,
  USAGE_EVENT_PRICE_SLUG_DESCRIPTION,
  type UsageEvent,
  usageEventsClientInsertSchema,
} from '@/db/schema/usageEvents'
import { selectCurrentBillingPeriodForSubscription } from '@/db/tableMethods/billingPeriodMethods'
import {
  selectPriceById,
  selectPriceBySlugAndCustomerId,
} from '@/db/tableMethods/priceMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import {
  insertUsageEvent,
  selectUsageEvents,
} from '@/db/tableMethods/usageEventMethods'
import { selectUsageMeterById } from '@/db/tableMethods/usageMeterMethods'
import type { TransactionOutput } from '@/db/transactionEnhacementTypes'
import type { DbTransaction } from '@/db/types'
import {
  LedgerTransactionType,
  PriceType,
  UsageMeterAggregationType,
} from '@/types'
import core from '@/utils/core'

// Schema that allows either priceId or priceSlug
export const createUsageEventWithSlugSchema = z
  .object({
    usageEvent: usageEventsClientInsertSchema
      .omit({ priceId: true })
      .extend({
        priceId: z
          .string()
          .optional()
          .describe(USAGE_EVENT_PRICE_ID_DESCRIPTION),
        priceSlug: z
          .string()
          .optional()
          .describe(USAGE_EVENT_PRICE_SLUG_DESCRIPTION),
      }),
  })
  .refine(
    (data) =>
      data.usageEvent.priceId
        ? !data.usageEvent.priceSlug
        : !!data.usageEvent.priceSlug,
    {
      message:
        'Either priceId or priceSlug must be provided, but not both',
      path: ['usageEvent', 'priceId'],
    }
  )

export type CreateUsageEventWithSlugInput = z.infer<
  typeof createUsageEventWithSlugSchema
>

/**
 * Resolves priceSlug to priceId if provided, otherwise returns the input with the existing priceId
 * @param input - The usage event input with either priceId or priceSlug
 * @param transaction - The database transaction
 * @returns The usage event input with resolved priceId
 */
export const resolveUsageEventInput = async (
  input: CreateUsageEventWithSlugInput,
  transaction: DbTransaction
): Promise<CreateUsageEventInput> => {
  // Early return if priceId is already provided
  if (input.usageEvent.priceId) {
    return {
      usageEvent: {
        ...core.omit(['priceSlug'], input.usageEvent),
        priceId: input.usageEvent.priceId,
      },
    }
  }

  // If priceSlug is provided, resolve it to priceId
  if (!input.usageEvent.priceSlug) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Either priceId or priceSlug must be provided',
    })
  }

  // First get the subscription to determine the customerId
  const subscription = await selectSubscriptionById(
    input.usageEvent.subscriptionId,
    transaction
  )

  // Look up the price by slug and customerId
  const price = await selectPriceBySlugAndCustomerId(
    {
      slug: input.usageEvent.priceSlug,
      customerId: subscription.customerId,
    },
    transaction
  )

  if (!price) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Price with slug ${input.usageEvent.priceSlug} not found for this customer's pricing model`,
    })
  }

  // Create the input with resolved priceId
  return {
    usageEvent: {
      ...core.omit(['priceSlug'], input.usageEvent),
      priceId: price.id,
    },
  }
}

export const ingestAndProcessUsageEvent = async (
  {
    input,
    livemode,
  }: { input: CreateUsageEventInput; livemode: boolean },
  transaction: DbTransaction
): Promise<TransactionOutput<{ usageEvent: UsageEvent.Record }>> => {
  const usageEventInput = input.usageEvent
  // FIXME: Handle nullable priceId - usage events can now have null priceId
  if (!usageEventInput.priceId) {
    throw new Error(
      'priceId is required. Support for usage events without prices will be added in a future update.'
    )
  }
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
