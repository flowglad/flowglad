import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  type CreateUsageEventInput,
  type UsageEvent,
  usageEventsClientInsertSchema,
} from '@/db/schema/usageEvents'
import { selectCurrentBillingPeriodForSubscription } from '@/db/tableMethods/billingPeriodMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import {
  selectPriceById,
  selectPriceBySlugAndCustomerId,
} from '@/db/tableMethods/priceMethods'
import { selectPricingModelForCustomer } from '@/db/tableMethods/pricingModelMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import {
  insertUsageEvent,
  selectUsageEvents,
} from '@/db/tableMethods/usageEventMethods'
import {
  selectUsageMeterById,
  selectUsageMeterBySlugAndCustomerId,
} from '@/db/tableMethods/usageMeterMethods'
import type { TransactionOutput } from '@/db/transactionEnhacementTypes'
import type { DbTransaction } from '@/db/types'
import {
  LedgerTransactionType,
  PriceType,
  UsageMeterAggregationType,
} from '@/types'
import core from '@/utils/core'

// Schema for single usage event creation - wraps the slug-aware client insert schema
export const createUsageEventWithSlugSchema = z.object({
  usageEvent: usageEventsClientInsertSchema,
})

export type CreateUsageEventWithSlugInput = z.infer<
  typeof createUsageEventWithSlugSchema
>

/**
 * Resolves priceSlug to priceId if provided, usageMeterSlug to usageMeterId if provided,
 * or uses usageMeterId directly if provided.
 * When usage meter identifiers are provided, priceId will be null.
 * @param input - The usage event input with one of: priceId, priceSlug, usageMeterId, or usageMeterSlug
 * @param transaction - The database transaction
 * @returns The usage event input with resolved priceId (or null if usage meter identifiers were used)
 */
export const resolveUsageEventInput = async (
  input: CreateUsageEventWithSlugInput,
  transaction: DbTransaction
): Promise<CreateUsageEventInput> => {
  // Early return if priceId is already provided
  if (input.usageEvent.priceId) {
    // Fetch the price to get usageMeterId
    const price = await selectPriceById(
      input.usageEvent.priceId,
      transaction
    )
    if (price.type !== PriceType.Usage) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Price ${price.id} is not a usage price. Please provide a usage price id to create a usage event.`,
      })
    }
    if (!price.usageMeterId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Price ${price.id} does not have a usage meter associated with it.`,
      })
    }
    const usageMeterId = price.usageMeterId
    return {
      usageEvent: {
        ...core.omit(
          ['priceSlug', 'usageMeterSlug'],
          input.usageEvent
        ),
        priceId: input.usageEvent.priceId,
        usageMeterId,
      },
    }
  }

  // Early return if usageMeterId is already provided
  if (input.usageEvent.usageMeterId) {
    // Performance optimization: We use selectUsageMeterById + compare pricingModelId
    // instead of selectPricingModelForCustomer. This uses 3 queries with minimal data vs
    // 5+ queries fetching the entire pricing model. Bulk insert uses selectPricingModelForCustomer
    // because it already loads/caches the pricing model for slug resolution, so reusing it
    // adds no extra queries. Single events don't need the full model, so the lighter approach is more efficient.

    // First get the subscription to determine the customerId (needed for validation)
    const subscription = await selectSubscriptionById(
      input.usageEvent.subscriptionId,
      transaction
    )

    // Get the customer to determine their pricing model
    const customer = await selectCustomerById(
      subscription.customerId,
      transaction
    )

    // Validate that the customer has a pricing model ID
    if (!customer.pricingModelId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Customer ${customer.id} does not have a pricing model associated`,
      })
    }

    let usageMeter
    try {
      usageMeter = await selectUsageMeterById(
        input.usageEvent.usageMeterId,
        transaction
      )
    } catch (error) {
      // If we can't fetch the usage meter (RLS blocked or doesn't exist),
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Usage meter ${input.usageEvent.usageMeterId} not found for this customer's pricing model`,
      })
    }

    // Validate that the usage meter belongs to the customer's pricing model
    if (usageMeter.pricingModelId !== customer.pricingModelId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Usage meter ${input.usageEvent.usageMeterId} not found for this customer's pricing model`,
      })
    }

    return {
      usageEvent: {
        ...core.omit(
          ['priceSlug', 'usageMeterSlug'],
          input.usageEvent
        ),
        priceId: null,
        usageMeterId: input.usageEvent.usageMeterId,
      },
    }
  }

  // First get the subscription to determine the customerId (needed for both priceSlug and usageMeterSlug)
  const subscription = await selectSubscriptionById(
    input.usageEvent.subscriptionId,
    transaction
  )

  // If usageMeterSlug is provided, resolve it to usageMeterId with null priceId
  if (input.usageEvent.usageMeterSlug) {
    const usageMeter = await selectUsageMeterBySlugAndCustomerId(
      {
        slug: input.usageEvent.usageMeterSlug,
        customerId: subscription.customerId,
      },
      transaction
    )

    if (!usageMeter) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Usage meter with slug ${input.usageEvent.usageMeterSlug} not found for this customer's pricing model`,
      })
    }

    // Return with priceId: null and usageMeterId from the lookup
    return {
      usageEvent: {
        ...core.omit(
          ['priceSlug', 'usageMeterSlug'],
          input.usageEvent
        ),
        priceId: null,
        usageMeterId: usageMeter.id,
      },
    }
  }

  // If priceSlug is provided, resolve it to priceId
  if (!input.usageEvent.priceSlug) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided',
    })
  }

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

  // Create the input with resolved priceId and usageMeterId from the price
  if (!price.usageMeterId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Price ${price.id} does not have a usage meter associated with it.`,
    })
  }
  const usageMeterId = price.usageMeterId
  return {
    usageEvent: {
      ...core.omit(['priceSlug', 'usageMeterSlug'], input.usageEvent),
      priceId: price.id,
      usageMeterId,
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
  const billingPeriod =
    await selectCurrentBillingPeriodForSubscription(
      usageEventInput.subscriptionId,
      transaction
    )

  // Determine usageMeterId based on whether priceId is provided or not
  let usageMeterId: string

  if (usageEventInput.priceId) {
    // When priceId is provided, get usageMeterId from the price
    const price = await selectPriceById(
      usageEventInput.priceId,
      transaction
    )
    if (price.type !== PriceType.Usage) {
      throw new Error(
        `Price ${price.id} is not a usage price. Please provide a usage price id to create a usage event.`
      )
    }
    if (!price.usageMeterId) {
      throw new Error(
        `Price ${price.id} does not have a usage meter associated with it.`
      )
    }
    usageMeterId = price.usageMeterId
  } else {
    // When priceId is null, usageMeterId must be provided in the input
    if (!usageEventInput.usageMeterId) {
      throw new Error(
        'usageMeterId is required when priceId is not provided'
      )
    }
    usageMeterId = usageEventInput.usageMeterId
  }

  // Fetch subscription - needed for validation (if usageMeterId path) and for insert
  const subscription = await selectSubscriptionById(
    usageEventInput.subscriptionId,
    transaction
  )

  // If usageMeterId was provided directly, validate it belongs to customer's pricing model
  if (!usageEventInput.priceId) {
    const customer = await selectCustomerById(
      subscription.customerId,
      transaction
    )
    const pricingModel = await selectPricingModelForCustomer(
      customer,
      transaction
    )

    // Validate that the usage meter exists in the customer's pricing model
    const usageMeter = pricingModel.usageMeters.find(
      (meter) => meter.id === usageMeterId
    )

    if (!usageMeter) {
      throw new Error(
        `Usage meter ${usageMeterId} not found for this customer's pricing model`
      )
    }
  }

  const [existingUsageEvent] = await selectUsageEvents(
    {
      transactionId: usageEventInput.transactionId,
      usageMeterId,
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

  const usageEvent = await insertUsageEvent(
    {
      ...usageEventInput,
      usageMeterId,
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
