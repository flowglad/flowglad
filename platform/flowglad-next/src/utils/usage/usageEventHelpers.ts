import { Result } from 'better-result'
import { z } from 'zod'
import type { UsageEventProcessedLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import {
  type CreateUsageEventInput,
  type UsageEvent,
  usageEventsClientInsertSchema,
} from '@/db/schema/usageEvents'
import {
  selectBillingPeriodsForSubscriptions,
  selectCurrentBillingPeriodForSubscription,
} from '@/db/tableMethods/billingPeriodMethods'
import {
  assertCustomerNotArchived,
  selectCustomerById,
} from '@/db/tableMethods/customerMethods'
import {
  selectDefaultPriceForUsageMeter,
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
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import {
  ArchivedCustomerError,
  ConflictError,
  type DomainError,
  NotFoundError,
  panic,
  ValidationError,
} from '@/errors'
import {
  LedgerTransactionType,
  PriceType,
  UsageMeterAggregationType,
} from '@/types'
import core from '@/utils/core'

/**
 * Fetches the default price for a usage meter.
 * Panics if no default price exists, as this indicates a data integrity issue.
 *
 * @param usageMeterId - The ID of the usage meter
 * @param transaction - Database transaction
 * @returns The default price record
 * @throws Invariant violation if no default price exists
 */
export const getRequiredDefaultPriceForMeter = async (
  usageMeterId: string,
  transaction: DbTransaction
): Promise<
  NonNullable<
    Awaited<ReturnType<typeof selectDefaultPriceForUsageMeter>>
  >
> => {
  const defaultPrice = await selectDefaultPriceForUsageMeter(
    usageMeterId,
    transaction
  )
  if (!defaultPrice) {
    panic(
      `Invalid usageMeterId: Usage meter ${usageMeterId} has no default price. This should not happen.`
    )
  }
  return defaultPrice
}

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
 * When usage meter identifiers are provided without an explicit priceId, the meter's default price is used.
 * @param input - The usage event input with one of: priceId, priceSlug, usageMeterId, or usageMeterSlug
 * @param transaction - The database transaction
 * @returns Result with the usage event input with resolved priceId
 */
export const resolveUsageEventInput = async (
  input: CreateUsageEventWithSlugInput,
  transaction: DbTransaction
): Promise<Result<CreateUsageEventInput, DomainError>> => {
  // Early return if priceId is already provided
  if (input.usageEvent.priceId) {
    // Fetch the price to get usageMeterId
    const priceResult = await selectPriceById(
      input.usageEvent.priceId,
      transaction
    )
    if (Result.isError(priceResult)) {
      return Result.err(
        new NotFoundError('Price', input.usageEvent.priceId)
      )
    }
    const price = priceResult.value
    if (price.type !== PriceType.Usage) {
      return Result.err(
        new ValidationError(
          'priceId',
          `Price ${price.id} is not a usage price. Please provide a usage price id to create a usage event.`
        )
      )
    }
    if (!price.usageMeterId) {
      return Result.err(
        new ValidationError(
          'priceId',
          `Price ${price.id} does not have a usage meter associated with it.`
        )
      )
    }

    // Validate that the price belongs to the customer's pricing model
    const subscription = (
      await selectSubscriptionById(
        input.usageEvent.subscriptionId,
        transaction
      )
    ).unwrap()
    const customer = (
      await selectCustomerById(subscription.customerId, transaction)
    ).unwrap()
    if (!customer.pricingModelId) {
      return Result.err(
        new ValidationError(
          'customerId',
          `Customer ${customer.id} does not have a pricing model associated`
        )
      )
    }
    if (price.pricingModelId !== customer.pricingModelId) {
      return Result.err(
        new NotFoundError(
          'Price',
          `${price.id} (not in customer's pricing model)`
        )
      )
    }

    const usageMeterId = price.usageMeterId
    return Result.ok({
      usageEvent: {
        ...core.omit(
          ['priceSlug', 'usageMeterSlug'],
          input.usageEvent
        ),
        priceId: input.usageEvent.priceId,
        usageMeterId,
      },
    })
  }

  // Early return if usageMeterId is already provided
  if (input.usageEvent.usageMeterId) {
    // Performance optimization: We use selectUsageMeterById + compare pricingModelId
    // instead of selectPricingModelForCustomer. This uses 3 queries with minimal data vs
    // 5+ queries fetching the entire pricing model. Bulk insert uses selectPricingModelForCustomer
    // because it already caches the pricing model for slug resolution, so reusing it adds no extra queries.

    // First get the subscription to determine the customerId (needed for validation)
    const subscription = (
      await selectSubscriptionById(
        input.usageEvent.subscriptionId,
        transaction
      )
    ).unwrap()

    // Get the customer to determine their pricing model
    const customer = (
      await selectCustomerById(subscription.customerId, transaction)
    ).unwrap()

    // Validate that the customer has a pricing model ID
    if (!customer.pricingModelId) {
      return Result.err(
        new ValidationError(
          'customerId',
          `Customer ${customer.id} does not have a pricing model associated`
        )
      )
    }

    let usageMeter
    try {
      usageMeter = await selectUsageMeterById(
        input.usageEvent.usageMeterId,
        transaction
      )
    } catch (error) {
      // If we can't fetch the usage meter (RLS blocked or doesn't exist),
      return Result.err(
        new NotFoundError(
          'UsageMeter',
          `${input.usageEvent.usageMeterId} (not in customer's pricing model)`
        )
      )
    }

    // Validate that the usage meter belongs to the customer's pricing model
    if (usageMeter.pricingModelId !== customer.pricingModelId) {
      return Result.err(
        new NotFoundError(
          'UsageMeter',
          `${input.usageEvent.usageMeterId} (not in customer's pricing model)`
        )
      )
    }

    // Get the default price for the usage meter
    const defaultPrice = await getRequiredDefaultPriceForMeter(
      input.usageEvent.usageMeterId,
      transaction
    )

    return Result.ok({
      usageEvent: {
        ...core.omit(
          ['priceSlug', 'usageMeterSlug'],
          input.usageEvent
        ),
        priceId: defaultPrice.id,
        usageMeterId: input.usageEvent.usageMeterId,
      },
    })
  }

  // First get the subscription to determine the customerId (needed for both priceSlug and usageMeterSlug)
  const subscription = (
    await selectSubscriptionById(
      input.usageEvent.subscriptionId,
      transaction
    )
  ).unwrap()

  // If usageMeterSlug is provided, resolve it to usageMeterId and fetch default price
  if (input.usageEvent.usageMeterSlug) {
    const usageMeter = await selectUsageMeterBySlugAndCustomerId(
      {
        slug: input.usageEvent.usageMeterSlug,
        customerId: subscription.customerId,
      },
      transaction
    )

    if (!usageMeter) {
      return Result.err(
        new NotFoundError(
          'UsageMeter',
          `with slug ${input.usageEvent.usageMeterSlug} (not in customer's pricing model)`
        )
      )
    }

    // Get the default price for the usage meter
    const defaultPrice = await getRequiredDefaultPriceForMeter(
      usageMeter.id,
      transaction
    )

    return Result.ok({
      usageEvent: {
        ...core.omit(
          ['priceSlug', 'usageMeterSlug'],
          input.usageEvent
        ),
        priceId: defaultPrice.id,
        usageMeterId: usageMeter.id,
      },
    })
  }

  // If priceSlug is provided, resolve it to priceId
  if (!input.usageEvent.priceSlug) {
    return Result.err(
      new ValidationError(
        'identifier',
        'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
      )
    )
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
    return Result.err(
      new NotFoundError(
        'Price',
        `with slug ${input.usageEvent.priceSlug} (not in customer's pricing model)`
      )
    )
  }

  if (!price.usageMeterId) {
    return Result.err(
      new ValidationError(
        'priceId',
        `Price ${price.id} does not have a usage meter associated with it.`
      )
    )
  }
  // Create the input with resolved priceId and usageMeterId from the price
  const usageMeterId = price.usageMeterId
  return Result.ok({
    usageEvent: {
      ...core.omit(['priceSlug', 'usageMeterSlug'], input.usageEvent),
      priceId: price.id,
      usageMeterId,
    },
  })
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
 * @returns Result with array of ledger commands for events that should be processed
 */
export const generateLedgerCommandsForBulkUsageEvents = async (
  params: {
    insertedUsageEvents: UsageEvent.Record[]
    livemode: boolean
  },
  transaction: DbTransaction
): Promise<
  Result<UsageEventProcessedLedgerCommand[], DomainError>
> => {
  const { insertedUsageEvents, livemode } = params

  if (insertedUsageEvents.length === 0) {
    return Result.ok([])
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
      return Result.err(
        new NotFoundError('Subscription', usageEvent.subscriptionId)
      )
    }

    const usageMeter = usageMeterById.get(usageEvent.usageMeterId)
    if (!usageMeter) {
      return Result.err(
        new NotFoundError('UsageMeter', usageEvent.usageMeterId)
      )
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
        return Result.err(
          new ValidationError(
            'billingPeriod',
            'Billing period is required for usage meter of type "count_distinct_properties".'
          )
        )
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

  return Result.ok(ledgerCommands)
}

/**
 * Ingests and processes a single usage event.
 * Handles validation, deduplication by transactionId, and generates ledger commands
 * for non-duplicate CountDistinctProperties events.
 *
 * @param params - Object containing:
 *   - input: The usage event input (with resolved priceId/usageMeterId)
 *   - livemode: Whether the event is in livemode
 * @param ctx - Transaction effects context with callbacks for enqueueing ledger commands
 * @returns Result with the usage event record
 */
export const ingestAndProcessUsageEvent = async (
  {
    input,
    livemode,
  }: { input: CreateUsageEventInput; livemode: boolean },
  ctx: TransactionEffectsContext
): Promise<
  Result<{ usageEvent: UsageEvent.Record }, DomainError>
> => {
  const { transaction, enqueueLedgerCommand } = ctx
  const usageEventInput = input.usageEvent
  // Fetch the current billing period for the subscription
  const billingPeriod =
    await selectCurrentBillingPeriodForSubscription(
      usageEventInput.subscriptionId,
      transaction
    )

  // Fetch subscription - needed for validation and for insert
  const subscription = (
    await selectSubscriptionById(
      usageEventInput.subscriptionId,
      transaction
    )
  ).unwrap()

  // Fetch customer once for archived/pricing model validation
  const customer = (
    await selectCustomerById(subscription.customerId, transaction)
  ).unwrap()

  // Guard: cannot create usage events for archived customers
  if (customer.archived) {
    return Result.err(new ArchivedCustomerError('create usage event'))
  }

  // Validate that the customer has a pricing model ID
  if (!customer.pricingModelId) {
    return Result.err(
      new ValidationError(
        'customerId',
        `Customer ${customer.id} does not have a pricing model associated`
      )
    )
  }

  // Determine usageMeterId and resolved priceId based on whether priceId is provided or not
  let usageMeterId: string
  let resolvedPriceId: string | null = usageEventInput.priceId ?? null

  if (usageEventInput.priceId) {
    // When priceId is provided, get usageMeterId from the price
    const price = (
      await selectPriceById(usageEventInput.priceId, transaction)
    ).unwrap()
    if (price.type !== PriceType.Usage) {
      return Result.err(
        new ValidationError(
          'priceId',
          `Price ${price.id} is not a usage price. Please provide a usage price id to create a usage event.`
        )
      )
    }
    if (!price.usageMeterId) {
      return Result.err(
        new ValidationError(
          'priceId',
          `Price ${price.id} does not have a usage meter associated with it.`
        )
      )
    }

    // Validate that the price belongs to the customer's pricing model
    if (price.pricingModelId !== customer.pricingModelId) {
      return Result.err(
        new NotFoundError(
          'Price',
          `${price.id} (not in customer's pricing model)`
        )
      )
    }

    usageMeterId = price.usageMeterId
  } else {
    // When priceId is null, usageMeterId must be provided in the input
    if (!usageEventInput.usageMeterId) {
      return Result.err(
        new ValidationError(
          'usageMeterId',
          'usageMeterId is required when priceId is not provided'
        )
      )
    }
    usageMeterId = usageEventInput.usageMeterId
  }

  // If usageMeterId was provided directly, validate it belongs to customer's pricing model
  if (!usageEventInput.priceId) {
    let usageMeter
    try {
      usageMeter = await selectUsageMeterById(
        usageMeterId,
        transaction
      )
    } catch (error) {
      // If we can't fetch the usage meter (RLS blocked or doesn't exist),
      return Result.err(
        new NotFoundError(
          'UsageMeter',
          `${usageMeterId} (not in customer's pricing model)`
        )
      )
    }

    // Validate that the usage meter belongs to the customer's pricing model
    if (usageMeter.pricingModelId !== customer.pricingModelId) {
      return Result.err(
        new NotFoundError(
          'UsageMeter',
          `${usageMeterId} (not in customer's pricing model)`
        )
      )
    }

    // Resolve to the default price for this usage meter
    const defaultPrice = await getRequiredDefaultPriceForMeter(
      usageMeterId,
      transaction
    )
    resolvedPriceId = defaultPrice.id
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
      return Result.err(
        new ConflictError(
          'UsageEvent',
          `A usage event already exists for transactionid ${usageEventInput.transactionId}, but does not belong to subscription ${usageEventInput.subscriptionId}. Please provide a unique transactionId to create a new usage event.`
        )
      )
    }
    // Return the existing event without creating a new one
    return Result.ok({ usageEvent: existingUsageEvent })
  }

  // Fetch the usage meter to validate count_distinct_properties requirements before insert
  const usageMeter = await selectUsageMeterById(
    usageMeterId,
    transaction
  )

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
  if (
    usageMeter.aggregationType ===
    UsageMeterAggregationType.CountDistinctProperties
  ) {
    if (!billingPeriod) {
      return Result.err(
        new ValidationError(
          'billingPeriod',
          `Billing period is required for usage meter "${usageMeter.name}" because it uses "count_distinct_properties" aggregation.`
        )
      )
    }

    if (
      !usageEventInput.properties ||
      Object.keys(usageEventInput.properties).length === 0
    ) {
      return Result.err(
        new ValidationError(
          'properties',
          `Properties are required for usage meter "${usageMeter.name}" because it uses "count_distinct_properties" aggregation. Each usage event must have a non-empty properties object to identify the distinct combination being counted.`
        )
      )
    }
  }

  // Insert the new usage event
  const usageEvent = await insertUsageEvent(
    {
      ...usageEventInput,
      priceId: resolvedPriceId,
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

  // For CountDistinctProperties meters, check for duplicates in the same billing period
  // (billingPeriod and properties were already validated before insert)
  if (
    usageMeter.aggregationType ===
    UsageMeterAggregationType.CountDistinctProperties
  ) {
    // Fetch all events in the same billing period for this usage meter
    // billingPeriod is guaranteed to exist here due to pre-insert validation
    const eventsInPeriod = await selectUsageEvents(
      {
        usageMeterId: usageEvent.usageMeterId,
        billingPeriodId: billingPeriod!.id,
      },
      transaction
    )

    // Create a set of event IDs to exclude from duplicate checking (exclude the current event)
    const excludeSet = new Set([usageEvent.id])
    const currentEventPropertiesKey =
      stableStringifyUsageEventProperties(usageEvent.properties)

    // Check if any existing event has the same properties (using stable stringification)
    const existingUsageEventDuplicate = eventsInPeriod.find(
      (event) => {
        if (excludeSet.has(event.id)) {
          return false
        }
        const eventPropertiesKey =
          stableStringifyUsageEventProperties(event.properties)
        return eventPropertiesKey === currentEventPropertiesKey
      }
    )

    // Only process if no duplicate exists
    if (existingUsageEventDuplicate) {
      return Result.ok({ usageEvent })
    }
  }

  enqueueLedgerCommand({
    type: LedgerTransactionType.UsageEventProcessed,
    livemode,
    organizationId: subscription.organizationId,
    subscriptionId: subscription.id,
    payload: {
      usageEvent,
    },
  })

  return Result.ok({ usageEvent })
}
