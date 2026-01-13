import { TRPCError } from '@trpc/server'
import type { z } from 'zod'
import type { Price } from '@/db/schema/prices'
import {
  bulkInsertUsageEventsSchema,
  type UsageEvent,
} from '@/db/schema/usageEvents'
import { selectBillingPeriodsForSubscriptions } from '@/db/tableMethods/billingPeriodMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectPrices } from '@/db/tableMethods/priceMethods'
import { selectPricingModelForCustomer } from '@/db/tableMethods/pricingModelMethods'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'
import { bulkInsertOrDoNothingUsageEventsByTransactionId } from '@/db/tableMethods/usageEventMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import type { TransactionOutput } from '@/db/transactionEnhacementTypes'
import type { DbTransaction } from '@/db/types'
import { PriceType, UsageMeterAggregationType } from '@/types'
import { generateLedgerCommandsForBulkUsageEvents } from '@/utils/usage/usageEventHelpers'

type BulkInsertUsageEventsInput = z.infer<
  typeof bulkInsertUsageEventsSchema
>

/**
 * Bulk inserts usage events with support for priceId, priceSlug, usageMeterId, or usageMeterSlug.
 * Resolves slugs to IDs, validates pricing model membership, and handles idempotency via transactionId.
 * Generates ledger commands for newly inserted events (not deduplicated ones).
 *
 * @param input - The bulk insert input containing an array of usage events
 * @param input.input - Zod-validated input schema (enforces exactly one identifier per event)
 * @param input.livemode - Whether this is a live mode operation
 * @param transaction - Database transaction to execute within
 * @returns Transaction output with inserted usage events and generated ledger commands
 * @throws {TRPCError} For all errors with appropriate error codes (NOT_FOUND, BAD_REQUEST, INTERNAL_SERVER_ERROR)
 */
export const bulkInsertUsageEventsTransaction = async (
  {
    input,
    livemode,
  }: {
    input: BulkInsertUsageEventsInput
    livemode: boolean
  },
  transaction: DbTransaction
): Promise<
  TransactionOutput<{ usageEvents: UsageEvent.ClientRecord[] }>
> => {
  const usageInsertsWithoutBillingPeriodId = input.usageEvents.map(
    (usageEvent) => ({
      ...usageEvent,
      livemode,
    })
  )

  const uniqueSubscriptionIds = [
    ...new Set(
      usageInsertsWithoutBillingPeriodId.map(
        (usageEvent) => usageEvent.subscriptionId
      )
    ),
  ]

  const billingPeriods = await selectBillingPeriodsForSubscriptions(
    uniqueSubscriptionIds,
    transaction
  )

  const billingPeriodsMap = new Map(
    billingPeriods.map((billingPeriod) => [
      billingPeriod.subscriptionId,
      billingPeriod,
    ])
  )
  const subscriptions = await selectSubscriptions(
    {
      id: uniqueSubscriptionIds,
    },
    transaction
  )
  const subscriptionsMap = new Map(
    subscriptions.map((subscription) => [
      subscription.id,
      subscription,
    ])
  )

  type SlugResolutionEvent = {
    index: number
    slug: string
    customerId: string
  }
  // Batch resolve price slugs to price IDs and usage meter slugs to usage meter IDs
  // First, collect all events that need slug resolution, grouped by customer
  const eventsWithPriceSlugs: SlugResolutionEvent[] = []
  const eventsWithUsageMeterSlugs: SlugResolutionEvent[] = []

  usageInsertsWithoutBillingPeriodId.forEach((usageEvent, index) => {
    const subscription = subscriptionsMap.get(
      usageEvent.subscriptionId
    )
    if (!subscription) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Subscription ${usageEvent.subscriptionId} not found for usage event at index ${index}`,
      })
    }

    if (usageEvent.priceSlug) {
      eventsWithPriceSlugs.push({
        index,
        slug: usageEvent.priceSlug,
        customerId: subscription.customerId,
      })
    }

    if (usageEvent.usageMeterSlug) {
      eventsWithUsageMeterSlugs.push({
        index,
        slug: usageEvent.usageMeterSlug,
        customerId: subscription.customerId,
      })
    }
  })

  // Cache pricing models by customerId to avoid duplicate lookups
  const pricingModelCache = new Map<
    string,
    Awaited<ReturnType<typeof selectPricingModelForCustomer>>
  >()

  const getPricingModelForCustomer = async (customerId: string) => {
    if (!pricingModelCache.has(customerId)) {
      const customer = await selectCustomerById(
        customerId,
        transaction
      )
      const pricingModel = await selectPricingModelForCustomer(
        customer,
        transaction
      )
      pricingModelCache.set(customerId, pricingModel)
    }
    const cached = pricingModelCache.get(customerId)
    if (!cached) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Pricing model cache miss for customer ${customerId} - this should not happen`,
      })
    }
    return cached
  }

  // Batch lookup prices by slug for each unique customer-slug combination
  const slugToPriceIdMap = new Map<string, string>()

  if (eventsWithPriceSlugs.length > 0) {
    // Group by customer and collect unique slugs per customer
    const customerSlugsMap = new Map<string, Set<string>>()

    eventsWithPriceSlugs.forEach(({ customerId, slug }) => {
      const customerSlugs = customerSlugsMap.get(customerId)
      if (customerSlugs) {
        customerSlugs.add(slug)
      } else {
        customerSlugsMap.set(customerId, new Set([slug]))
      }
    })

    // Perform batch lookups for each customer using cached pricing models
    for (const [customerId, slugs] of customerSlugsMap.entries()) {
      const pricingModel =
        await getPricingModelForCustomer(customerId)

      // Build a slug->price map once for O(1) lookups
      const slugToPriceMap = new Map<string, Price.ClientRecord>()
      for (const product of pricingModel.products) {
        for (const price of product.prices) {
          if (price.slug) {
            slugToPriceMap.set(price.slug, price)
          }
        }
      }

      // Also look up usage prices that don't have a productId
      // (usage prices belong to usage meters, not products)
      const usagePricesFromDb = await selectPrices(
        { pricingModelId: pricingModel.id, active: true },
        transaction
      )
      for (const price of usagePricesFromDb) {
        if (price.slug && !slugToPriceMap.has(price.slug)) {
          slugToPriceMap.set(price.slug, price)
        }
      }

      for (const slug of slugs) {
        const price = slugToPriceMap.get(slug)

        if (!price) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Price with slug ${slug} not found for customer's pricing model`,
          })
        }

        // Create a composite key for customer-slug combination
        const key = `${customerId}:${slug}`
        slugToPriceIdMap.set(key, price.id)
      }
    }
  }

  // Batch lookup usage meters by slug for each unique customer-slug combination
  const slugToUsageMeterIdMap = new Map<string, string>()

  if (eventsWithUsageMeterSlugs.length > 0) {
    // Group by customer and collect unique slugs per customer
    const customerSlugsMap = new Map<string, Set<string>>()

    eventsWithUsageMeterSlugs.forEach(({ customerId, slug }) => {
      const customerSlugs = customerSlugsMap.get(customerId)
      if (customerSlugs) {
        customerSlugs.add(slug)
      } else {
        customerSlugsMap.set(customerId, new Set([slug]))
      }
    })

    // Perform batch lookups for each customer using cached pricing models
    for (const [customerId, slugs] of customerSlugsMap.entries()) {
      const pricingModel =
        await getPricingModelForCustomer(customerId)

      for (const slug of slugs) {
        // Search through usage meters in the pricing model to find one with matching slug
        const usageMeter = pricingModel.usageMeters.find(
          (meter) => meter.slug === slug
        )

        if (!usageMeter) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Usage meter with slug ${slug} not found for customer's pricing model`,
          })
        }

        // Create a composite key for customer-slug combination
        const key = `${customerId}:${slug}`
        slugToUsageMeterIdMap.set(key, usageMeter.id)
      }
    }
  }

  // Resolve identifiers for all events
  const resolvedUsageEvents = usageInsertsWithoutBillingPeriodId.map(
    (usageEvent, index) => {
      const subscription = subscriptionsMap.get(
        usageEvent.subscriptionId
      )
      if (!subscription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Subscription ${usageEvent.subscriptionId} not found for usage event at index ${index}`,
        })
      }

      let priceId: string | null = usageEvent.priceId ?? null
      let usageMeterId: string | undefined = usageEvent.usageMeterId

      // If priceSlug is provided, resolve it
      if (usageEvent.priceSlug) {
        const key = `${subscription.customerId}:${usageEvent.priceSlug}`
        const resolvedPriceId = slugToPriceIdMap.get(key)

        if (!resolvedPriceId) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to resolve price slug ${usageEvent.priceSlug} for event at index ${index}`,
          })
        }
        priceId = resolvedPriceId
      }

      // If usageMeterSlug is provided, resolve it
      if (usageEvent.usageMeterSlug) {
        const key = `${subscription.customerId}:${usageEvent.usageMeterSlug}`
        const resolvedUsageMeterId = slugToUsageMeterIdMap.get(key)

        if (!resolvedUsageMeterId) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to resolve usage meter slug ${usageEvent.usageMeterSlug} for event at index ${index}`,
          })
        }
        usageMeterId = resolvedUsageMeterId
        priceId = null // When usage meter identifiers are used, priceId is null
      }

      // Omit slug fields and set resolved identifiers
      const { priceSlug, usageMeterSlug, ...rest } = usageEvent
      return {
        ...rest,
        priceId,
        usageMeterId,
      }
    }
  )

  // Fetch prices only for events that have a priceId
  const uniquePriceIds = [
    ...new Set(
      resolvedUsageEvents
        .map((usageEvent) => usageEvent.priceId)
        .filter((id): id is string => id !== null)
    ),
  ]
  const pricesMap = new Map<
    string,
    Awaited<ReturnType<typeof selectPrices>>[0]
  >()

  if (uniquePriceIds.length > 0) {
    const prices = await selectPrices(
      {
        id: uniquePriceIds,
      },
      transaction
    )

    prices.forEach((price) => {
      pricesMap.set(price.id, price)
      if (price.type !== PriceType.Usage) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Received a usage event insert with priceId ${price.id}, which is not a usage price. Please ensure all priceIds provided are usage prices.`,
        })
      }
    })
  }

  // Validate price IDs that were provided directly (not resolved from slug)
  // They must exist in the customer's pricing model
  // Note: Events with priceSlug already validated during slug resolution (lines 156-199)
  const eventsWithDirectPriceIds = resolvedUsageEvents
    .map((usageEvent, index) => ({
      usageEvent,
      index,
    }))
    .filter(({ usageEvent, index }) => {
      // Only validate events that have a priceId AND were NOT resolved from a slug
      // Check if this event originally had a priceSlug by checking the original input
      const originalEvent = input.usageEvents[index]
      return (
        usageEvent.priceId !== null &&
        !originalEvent.priceSlug &&
        !originalEvent.usageMeterSlug
      )
    })

  if (eventsWithDirectPriceIds.length > 0) {
    // Group by customer to batch pricing model lookups
    const customerPriceEventsMap = new Map<
      string,
      Array<{ priceId: string; index: number }>
    >()

    eventsWithDirectPriceIds.forEach(({ usageEvent, index }) => {
      const subscription = subscriptionsMap.get(
        usageEvent.subscriptionId
      )
      if (!subscription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Subscription ${usageEvent.subscriptionId} not found for usage event at index ${index}`,
        })
      }
      const customerId = subscription.customerId

      const customerEvents = customerPriceEventsMap.get(customerId)
      if (customerEvents) {
        customerEvents.push({
          priceId: usageEvent.priceId!,
          index,
        })
      } else {
        customerPriceEventsMap.set(customerId, [
          {
            priceId: usageEvent.priceId!,
            index,
          },
        ])
      }
    })

    // Batch validate for each customer using cached pricing models
    for (const [
      customerId,
      events,
    ] of customerPriceEventsMap.entries()) {
      const pricingModel =
        await getPricingModelForCustomer(customerId)

      // Build a set of allowed price IDs from the customer's pricing model
      const pricingModelPriceIds = new Set<string>()
      for (const product of pricingModel.products) {
        for (const price of product.prices) {
          pricingModelPriceIds.add(price.id)
        }
      }

      for (const { priceId, index } of events) {
        if (!pricingModelPriceIds.has(priceId)) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Price ${priceId} not found for this customer's pricing model at index ${index}`,
          })
        }
      }
    }
  }

  // Collect all usage meter IDs (from prices and direct usage meter identifiers)
  const usageMeterIdsFromPrices = Array.from(pricesMap.values())
    .map((price) => price.usageMeterId)
    .filter((id): id is string => id !== null)

  const usageMeterIdsFromEvents = resolvedUsageEvents
    .map((usageEvent) => usageEvent.usageMeterId)
    .filter((id): id is string => id !== undefined)

  const uniqueUsageMeterIds = [
    ...new Set([
      ...usageMeterIdsFromPrices,
      ...usageMeterIdsFromEvents,
    ]),
  ]

  // Fetch usage meters to check aggregation types
  const usageMeters = await selectUsageMeters(
    {
      id: uniqueUsageMeterIds,
    },
    transaction
  )
  const usageMetersMap = new Map(
    usageMeters.map((meter) => [meter.id, meter])
  )

  // Validate usage meter IDs that were provided directly (not from prices)
  // They must exist in the customer's pricing model
  // Batch validation by customer to reduce database queries
  const eventsWithDirectUsageMeters = resolvedUsageEvents
    .map((usageEvent, index) => ({
      usageEvent,
      index,
    }))
    .filter(
      ({ usageEvent }) =>
        usageEvent.priceId === null && usageEvent.usageMeterId
    )

  if (eventsWithDirectUsageMeters.length > 0) {
    // Group by customer to batch pricing model lookups
    const customerEventsMap = new Map<
      string,
      Array<{ usageMeterId: string; index: number }>
    >()

    eventsWithDirectUsageMeters.forEach(({ usageEvent, index }) => {
      const subscription = subscriptionsMap.get(
        usageEvent.subscriptionId
      )
      if (!subscription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Subscription ${usageEvent.subscriptionId} not found for usage event at index ${index}`,
        })
      }
      const customerId = subscription.customerId

      const customerEvents = customerEventsMap.get(customerId)
      if (customerEvents) {
        customerEvents.push({
          usageMeterId: usageEvent.usageMeterId!,
          index,
        })
      } else {
        customerEventsMap.set(customerId, [
          {
            usageMeterId: usageEvent.usageMeterId!,
            index,
          },
        ])
      }
    })

    // Batch validate for each customer using cached pricing models
    for (const [customerId, events] of customerEventsMap.entries()) {
      const pricingModel =
        await getPricingModelForCustomer(customerId)

      const pricingModelUsageMeterIds = new Set(
        pricingModel.usageMeters.map((meter) => meter.id)
      )

      for (const { usageMeterId, index } of events) {
        if (!pricingModelUsageMeterIds.has(usageMeterId)) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Usage meter ${usageMeterId} not found for this customer's pricing model at index ${index}`,
          })
        }
      }
    }
  }

  const usageInsertsWithBillingPeriodId: UsageEvent.Insert[] =
    resolvedUsageEvents.map((usageEvent, index) => {
      const subscription = subscriptionsMap.get(
        usageEvent.subscriptionId
      )
      if (!subscription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Subscription ${usageEvent.subscriptionId} not found for usage event at index ${index}`,
        })
      }

      const billingPeriod = billingPeriodsMap.get(
        usageEvent.subscriptionId
      )

      // Determine usageMeterId - either from price or directly provided
      let finalUsageMeterId: string

      if (usageEvent.priceId) {
        // When priceId is provided, get usageMeterId from the price
        const price = pricesMap.get(usageEvent.priceId)
        if (!price) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Price ${usageEvent.priceId} not found for usage event at index ${index}`,
          })
        }
        if (!price.usageMeterId) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Usage meter not found for price ${usageEvent.priceId} at index ${index}`,
          })
        }
        finalUsageMeterId = price.usageMeterId
      } else if (usageEvent.usageMeterId) {
        // When usageMeterId is provided directly, use it
        finalUsageMeterId = usageEvent.usageMeterId
      } else {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Either priceId or usageMeterId must be provided for usage event at index ${index}`,
        })
      }

      /**
       * Validation for CountDistinctProperties aggregation type.
       *
       * This aggregation type counts unique property combinations within a billing period.
       * For example, if tracking unique users who performed an action, each event must include
       * a properties object like `{ user_id: '123' }` to identify the distinct entity.
       *
       * Requirements:
       * 1. A billing period must exist - deduplication is scoped to billing periods
       * 2. Properties must be non-empty - without properties, all events would be treated as
       *    having the same "empty" combination, causing incorrect deduplication where only
       *    the first event generates a ledger transaction (leading to underbilling)
       *
       * @see https://docs.flowglad.com/usage-based-billing/aggregation-types
       */
      const usageMeter = usageMetersMap.get(finalUsageMeterId)
      if (
        usageMeter?.aggregationType ===
        UsageMeterAggregationType.CountDistinctProperties
      ) {
        if (!billingPeriod) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Billing period is required for usage meter "${usageMeter.name}" at index ${index} because it uses "count_distinct_properties" aggregation. This aggregation type requires a billing period for deduplication.`,
          })
        }

        // Validate that properties are provided and non-empty for count_distinct_properties meters
        if (
          !usageEvent.properties ||
          Object.keys(usageEvent.properties).length === 0
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Properties are required for usage meter "${usageMeter.name}" at index ${index} because it uses "count_distinct_properties" aggregation. Each usage event must have a non-empty properties object to identify the distinct combination being counted.`,
          })
        }
      }

      return {
        ...usageEvent,
        customerId: subscription.customerId,
        ...(billingPeriod
          ? { billingPeriodId: billingPeriod.id }
          : {}),
        usageMeterId: finalUsageMeterId,
        properties: usageEvent.properties ?? {},
        usageDate: usageEvent.usageDate ?? Date.now(),
      }
    })

  const insertedUsageEvents =
    await bulkInsertOrDoNothingUsageEventsByTransactionId(
      usageInsertsWithBillingPeriodId,
      transaction
    )

  // Generate ledger commands for the inserted usage events
  const ledgerCommands =
    await generateLedgerCommandsForBulkUsageEvents(
      {
        insertedUsageEvents,
        livemode,
      },
      transaction
    )

  return {
    result: { usageEvents: insertedUsageEvents },
    ledgerCommands,
  }
}
