import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import type { UsageEventProcessedLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import {
  type CreateUsageEventInput,
  type UsageEvent,
  usageEventsClientInsertSchema,
} from '@/db/schema/usageEvents'
import {
  selectBillingPeriodsForSubscriptions,
  selectCurrentBillingPeriodForSubscription,
} from '@/db/tableMethods/billingPeriodMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import {
  selectPriceById,
  selectPriceBySlugAndCustomerId,
} from '@/db/tableMethods/priceMethods'
import {
  selectSubscriptionById,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import {
  insertUsageEvent,
  selectUsageEvents,
} from '@/db/tableMethods/usageEventMethods'
import {
  selectUsageMeterById,
  selectUsageMeterBySlugAndCustomerId,
  selectUsageMeters,
} from '@/db/tableMethods/usageMeterMethods'
import type { TransactionOutput } from '@/db/transactionEnhacementTypes'
import type { DbTransaction } from '@/db/types'
import {
  LedgerTransactionType,
  PriceType,
  UsageMeterAggregationType,
} from '@/types'
import core from '@/utils/core'

/**
 * Type guard to check if a value is a plain object (not array, not null).
 */
const isPlainObject = (
  value: unknown
): value is Record<string, unknown> => {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

/**
 * Recursively sorts all object keys in a JSON structure to ensure stable stringification.
 * This is critical for comparing usage event properties where key order may differ
 * (e.g., {user_id: '123', feature: 'export'} vs {feature: 'export', user_id: '123'}).
 *
 * @param value - The value to sort (can be any JSON-serializable type)
 * @returns A new object/array with all keys sorted, preserving the original structure
 */
const stableSortJsonKeysDeep = (value: unknown): unknown => {
  // Recursively process arrays
  if (Array.isArray(value)) {
    return value.map(stableSortJsonKeysDeep)
  }

  // Return primitives and null as-is
  if (!isPlainObject(value)) {
    return value
  }

  // Sort object keys and recursively process values
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    sorted[key] = stableSortJsonKeysDeep(value[key])
  }
  return sorted
}

/**
 * Creates a stable string representation of usage event properties.
 * Uses stable key sorting to ensure that properties with the same values
 * but different key orders produce identical strings.
 *
 * @param properties - The usage event properties object (can be null)
 * @returns A stable JSON string representation of the properties
 */
const stableStringifyUsageEventProperties = (
  properties: UsageEvent.Record['properties'] | null
): string => {
  return JSON.stringify(stableSortJsonKeysDeep(properties ?? {}))
}

/**
 * Generates a unique key for a combination of usage meter, billing period, and properties.
 * Used for deduplication of CountDistinctProperties usage events within a billing period.
 * The key format is: `usageMeterId:billingPeriodId:stableJsonString(properties)`
 *
 * @param params - Object containing usage meter ID, billing period ID, and properties
 * @returns A unique string key for this combination
 */
const countDistinctPropertiesCombinationKey = (params: {
  usageMeterId: string
  billingPeriodId: string
  properties: UsageEvent.Record['properties'] | null
}): string => {
  const { usageMeterId, billingPeriodId, properties } = params
  return `${usageMeterId}:${billingPeriodId}:${stableStringifyUsageEventProperties(properties)}`
}

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
    // because it already caches the pricing model for slug resolution, so reusing it adds no extra queries.

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

  if (!price.usageMeterId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Price ${price.id} does not have a usage meter associated with it.`,
    })
  }
  // Create the input with resolved priceId and usageMeterId from the price
  const usageMeterId = price.usageMeterId
  return {
    usageEvent: {
      ...core.omit(['priceSlug', 'usageMeterSlug'], input.usageEvent),
      priceId: price.id,
      usageMeterId,
    },
  }
}

/**
 * Determines whether a usage event should generate a ledger command.
 * For CountDistinctProperties meters, only processes events with unique property combinations
 * within the same billing period. For all other aggregation types, always returns true.
 *
 * @param params - Object containing:
 *   - usageEvent: The usage event to check
 *   - usageMeterAggregationType: The aggregation type of the usage meter
 *   - billingPeriod: The billing period (required for CountDistinctProperties)
 * @param transaction - Database transaction
 * @returns true if the event should generate a ledger command, false otherwise
 * @throws TRPCError if billing period is required but not provided for CountDistinctProperties meters
 */
export const shouldProcessUsageEventLedgerCommand = async (
  params: {
    usageEvent: UsageEvent.Record
    usageMeterAggregationType: UsageMeterAggregationType
    billingPeriod: BillingPeriod.Record | null
  },
  transaction: DbTransaction
): Promise<boolean> => {
  const { usageEvent, usageMeterAggregationType, billingPeriod } =
    params

  // For non-CountDistinctProperties meters, always process
  if (
    usageMeterAggregationType !==
    UsageMeterAggregationType.CountDistinctProperties
  ) {
    return true
  }

  // CountDistinctProperties requires a billing period for deduplication
  if (!billingPeriod) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Billing period is required for usage meter of type "count_distinct_properties".`,
    })
  }

  // Fetch all events in the same billing period for this usage meter
  const eventsInPeriod = await selectUsageEvents(
    {
      usageMeterId: usageEvent.usageMeterId,
      billingPeriodId: billingPeriod.id,
    },
    transaction
  )

  // Create a set of event IDs to exclude from duplicate checking (exclude the current event)
  const excludeSet = new Set([usageEvent.id])
  const currentEventPropertiesKey =
    stableStringifyUsageEventProperties(usageEvent.properties)

  // Check if any existing event has the same properties (using stable stringification)
  const existingUsageEvent = eventsInPeriod.find((event) => {
    if (excludeSet.has(event.id)) {
      return false
    }
    const eventPropertiesKey = stableStringifyUsageEventProperties(
      event.properties
    )
    return eventPropertiesKey === currentEventPropertiesKey
  })

  // Only process if no duplicate exists
  return !existingUsageEvent
}

/**
 * Batch fetches existing property combinations from the database for CountDistinctProperties meters.
 * Groups events by usage meter and billing period to minimize database queries,
 * then checks for existing property combinations that would cause duplicates.
 *
 * @param params - Object containing:
 *   - countDistinctEvents: Array of events with their meter and billing period info
 *   - batchEventIds: IDs of events in the current batch (to exclude from duplicate checking)
 * @param transaction - Database transaction
 * @returns Set of combination keys that already exist in the database
 */
const batchFetchExistingCombinations = async (
  params: {
    countDistinctEvents: Array<{
      usageEvent: UsageEvent.Record
      usageMeterId: string
      billingPeriodId: string
    }>
    batchEventIds: string[]
  },
  transaction: DbTransaction
): Promise<Set<string>> => {
  const { countDistinctEvents, batchEventIds } = params

  if (countDistinctEvents.length === 0) {
    return new Set()
  }

  // Group events by usage meter and billing period to minimize queries
  const eventsByMeterAndPeriod = new Map<
    string,
    UsageEvent.Record[]
  >()
  for (const {
    usageEvent,
    usageMeterId,
    billingPeriodId,
  } of countDistinctEvents) {
    const key = `${usageMeterId}:${billingPeriodId}`
    if (!eventsByMeterAndPeriod.has(key)) {
      eventsByMeterAndPeriod.set(key, [])
    }
    eventsByMeterAndPeriod.get(key)!.push(usageEvent)
  }

  const existingCombinations = new Set<string>()
  const batchEventIdsSet = new Set(batchEventIds)

  // Fetch existing events for each unique meter+period combination in parallel
  await Promise.all(
    Array.from(eventsByMeterAndPeriod.entries()).map(
      async ([key, events]) => {
        const [usageMeterId, billingPeriodId] = key.split(':')
        const existingEvents = await selectUsageEvents(
          {
            usageMeterId,
            billingPeriodId,
          },
          transaction
        )

        // Generate combination keys for existing events (excluding current batch)
        for (const existingEvent of existingEvents) {
          if (!batchEventIdsSet.has(existingEvent.id)) {
            const combinationKey =
              countDistinctPropertiesCombinationKey({
                usageMeterId,
                billingPeriodId,
                properties: existingEvent.properties,
              })
            existingCombinations.add(combinationKey)
          }
        }
      }
    )
  )

  return existingCombinations
}

/**
 * Generates ledger commands for a batch of inserted usage events.
 * Handles deduplication for CountDistinctProperties meters by checking both:
 * 1. Duplicates within the current batch
 * 2. Duplicates against existing events in the database
 *
 * Uses batch queries to efficiently fetch subscriptions, usage meters, and billing periods
 * for all events in a single operation.
 *
 * @param params - Object containing:
 *   - insertedUsageEvents: Array of usage events that were just inserted
 *   - livemode: Whether the events are in livemode
 * @param transaction - Database transaction
 * @returns Array of ledger commands for events that should be processed
 * @throws Error if subscription or usage meter is not found for any event
 */
export const generateLedgerCommandsForBulkUsageEvents = async (
  params: {
    insertedUsageEvents: UsageEvent.Record[]
    livemode: boolean
  },
  transaction: DbTransaction
): Promise<UsageEventProcessedLedgerCommand[]> => {
  const { insertedUsageEvents, livemode } = params

  if (insertedUsageEvents.length === 0) {
    return []
  }

  // Extract unique IDs for batch queries
  const subscriptionIds = [
    ...new Set(insertedUsageEvents.map((e) => e.subscriptionId)),
  ]
  const usageMeterIds = [
    ...new Set(insertedUsageEvents.map((e) => e.usageMeterId)),
  ]

  // Batch fetch all required data in parallel
  const [subscriptions, usageMeters, billingPeriods] =
    await Promise.all([
      selectSubscriptions({ id: subscriptionIds }, transaction),
      selectUsageMeters({ id: usageMeterIds }, transaction),
      selectBillingPeriodsForSubscriptions(
        subscriptionIds,
        transaction
      ),
    ])

  // Create lookup maps for O(1) access
  const subscriptionById = new Map(
    subscriptions.map((s) => [s.id, s])
  )
  const usageMeterById = new Map(usageMeters.map((m) => [m.id, m]))
  const billingPeriodBySubscriptionId = new Map(
    billingPeriods.map((bp) => [bp.subscriptionId, bp])
  )

  const batchEventIds = insertedUsageEvents.map((e) => e.id)
  // Track combinations already processed in this batch to avoid duplicates
  const processedCombinationsInBatch = new Set<string>()

  // Collect CountDistinctProperties events for batch duplicate checking
  const countDistinctEvents: Array<{
    usageEvent: UsageEvent.Record
    usageMeterId: string
    billingPeriodId: string
  }> = []

  type ProcessedEventData = {
    usageEvent: UsageEvent.Record
    subscription: NonNullable<ReturnType<typeof subscriptionById.get>>
    combinationKey: string | null
  }
  const processedEventData: ProcessedEventData[] = []

  // Process each event and collect metadata
  for (const usageEvent of insertedUsageEvents) {
    const subscription = subscriptionById.get(
      usageEvent.subscriptionId
    )
    if (!subscription) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Subscription ${usageEvent.subscriptionId} not found`,
      })
    }

    const usageMeter = usageMeterById.get(usageEvent.usageMeterId)
    if (!usageMeter) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Usage meter ${usageEvent.usageMeterId} not found`,
      })
    }

    const billingPeriod =
      billingPeriodBySubscriptionId.get(usageEvent.subscriptionId) ??
      null

    // Determine if this is a CountDistinctProperties meter with a billing period
    const isCountDistinctPropertiesMeter =
      usageMeter.aggregationType ===
      UsageMeterAggregationType.CountDistinctProperties

    // Generate combination key for deduplication (null for non-CountDistinctProperties)
    let combinationKey: string | null = null
    if (isCountDistinctPropertiesMeter) {
      if (billingPeriod === null) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Billing period is required for usage meter of type "count_distinct_properties".`,
        })
      }
      combinationKey = countDistinctPropertiesCombinationKey({
        usageMeterId: usageEvent.usageMeterId,
        billingPeriodId: billingPeriod.id,
        properties: usageEvent.properties,
      })

      // Collect CountDistinctProperties events for batch duplicate checking
      countDistinctEvents.push({
        usageEvent,
        usageMeterId: usageEvent.usageMeterId,
        billingPeriodId: billingPeriod.id,
      })
    }

    processedEventData.push({
      usageEvent,
      subscription,
      combinationKey,
    })
  }

  // Batch fetch existing combinations from database for CountDistinctProperties events
  const existingCombinationsInDb =
    await batchFetchExistingCombinations(
      {
        countDistinctEvents,
        batchEventIds,
      },
      transaction
    )

  const ledgerCommands: UsageEventProcessedLedgerCommand[] = []

  // Generate ledger commands, skipping duplicates
  for (const {
    usageEvent,
    subscription,
    combinationKey,
  } of processedEventData) {
    // Skip if this combination was already processed in this batch
    if (
      combinationKey !== null &&
      processedCombinationsInBatch.has(combinationKey)
    ) {
      continue
    }

    // Skip if this combination already exists in the database
    if (
      combinationKey !== null &&
      existingCombinationsInDb.has(combinationKey)
    ) {
      continue
    }

    // Mark this combination as processed in the batch
    if (combinationKey !== null) {
      processedCombinationsInBatch.add(combinationKey)
    }

    // Generate ledger command for this event
    ledgerCommands.push({
      type: LedgerTransactionType.UsageEventProcessed,
      livemode,
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
      payload: {
        usageEvent,
      },
    })
  }

  return ledgerCommands
}

/**
 * Ingests and processes a single usage event.
 * Handles validation, deduplication by transactionId, and generates ledger commands
 * for non-duplicate CountDistinctProperties events.
 *
 * @param params - Object containing:
 *   - input: The usage event input (with resolved priceId/usageMeterId)
 *   - livemode: Whether the event is in livemode
 * @param transaction - Database transaction
 * @returns Transaction output with the usage event and optional ledger command
 */
export const ingestAndProcessUsageEvent = async (
  {
    input,
    livemode,
  }: { input: CreateUsageEventInput; livemode: boolean },
  transaction: DbTransaction
): Promise<TransactionOutput<{ usageEvent: UsageEvent.Record }>> => {
  const usageEventInput = input.usageEvent
  // Fetch the current billing period for the subscription
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
    usageMeterId = price.usageMeterId
  } else {
    // When priceId is null, usageMeterId must be provided in the input
    if (!usageEventInput.usageMeterId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'usageMeterId is required when priceId is not provided',
      })
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
        usageMeterId,
        transaction
      )
    } catch (error) {
      // If we can't fetch the usage meter (RLS blocked or doesn't exist),
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Usage meter ${usageMeterId} not found for this customer's pricing model`,
      })
    }

    // Validate that the usage meter belongs to the customer's pricing model
    if (usageMeter.pricingModelId !== customer.pricingModelId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Usage meter ${usageMeterId} not found for this customer's pricing model`,
      })
    }
  }

  // Check for existing usage event with the same transactionId and usageMeterId
  // This prevents duplicate events from being created for the same transaction
  const [existingUsageEvent] = await selectUsageEvents(
    {
      transactionId: usageEventInput.transactionId,
      usageMeterId,
    },
    transaction
  )
  if (existingUsageEvent) {
    // Validate that the existing event belongs to the same subscription
    if (
      existingUsageEvent.subscriptionId !==
      usageEventInput.subscriptionId
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `A usage event already exists for transactionid ${usageEventInput.transactionId}, but does not belong to subscription ${usageEventInput.subscriptionId}. Please provide a unique transactionId to create a new usage event.`,
      })
    }
    // Return the existing event without creating a new one
    return { result: { usageEvent: existingUsageEvent } }
  }

  // Insert the new usage event
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
  // If so, only return a ledgerCommand if there isn't already a usageEvent
  // for the current billing period with the same properties object
  const usageMeter = await selectUsageMeterById(
    usageEvent.usageMeterId,
    transaction
  )

  const shouldProcess = await shouldProcessUsageEventLedgerCommand(
    {
      usageEvent,
      usageMeterAggregationType: usageMeter.aggregationType,
      billingPeriod,
    },
    transaction
  )

  if (!shouldProcess) {
    return { result: { usageEvent } }
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
