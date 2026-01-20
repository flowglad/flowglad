import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import type { z } from 'zod'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Price } from '@/db/schema/prices'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  bulkInsertUsageEventsSchema,
  type UsageEvent,
} from '@/db/schema/usageEvents'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { selectBillingPeriodsForSubscriptions } from '@/db/tableMethods/billingPeriodMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import {
  selectDefaultPricesForUsageMeters,
  selectPrices,
} from '@/db/tableMethods/priceMethods'
import { selectPricingModelForCustomer } from '@/db/tableMethods/pricingModelMethods'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'
import { bulkInsertOrDoNothingUsageEventsByTransactionId } from '@/db/tableMethods/usageEventMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import type { TransactionEffectsContext } from '@/db/types'
import { PriceType, UsageMeterAggregationType } from '@/types'
import { generateLedgerCommandsForBulkUsageEvents } from '@/utils/usage/usageEventHelpers'

type BulkInsertUsageEventsInput = z.infer<
  typeof bulkInsertUsageEventsSchema
>

type SlugResolutionEvent = {
  index: number
  slug: string
  customerId: string
}

type UsageEventWithLivemode =
  BulkInsertUsageEventsInput['usageEvents'][0] & {
    livemode: boolean
  }

// Context passed through the Result.gen chain
type BaseContext = {
  input: BulkInsertUsageEventsInput
  livemode: boolean
  ctx: TransactionEffectsContext
}

type WithSubscriptionsContext = BaseContext & {
  usageInsertsWithoutBillingPeriodId: UsageEventWithLivemode[]
  uniqueSubscriptionIds: string[]
  billingPeriodsMap: Map<string, BillingPeriod.Record>
  subscriptionsMap: Map<string, Subscription.Record>
}

type WithSlugEventsContext = WithSubscriptionsContext & {
  eventsWithPriceSlugs: SlugResolutionEvent[]
  eventsWithUsageMeterSlugs: SlugResolutionEvent[]
  pricingModelCache: Map<
    string,
    Awaited<ReturnType<typeof selectPricingModelForCustomer>>
  >
  getPricingModelForCustomer: (
    customerId: string
  ) => Promise<
    Awaited<ReturnType<typeof selectPricingModelForCustomer>>
  >
}

type WithResolvedSlugsContext = WithSlugEventsContext & {
  slugToPriceIdMap: Map<string, string>
  slugToUsageMeterIdMap: Map<string, string>
}

type ResolvedUsageEvent = Omit<
  UsageEventWithLivemode,
  'priceSlug' | 'usageMeterSlug' | 'priceId' | 'usageMeterId'
> & {
  priceId: string | null
  usageMeterId: string | undefined
}

type WithResolvedEventsContext = WithResolvedSlugsContext & {
  resolvedUsageEvents: ResolvedUsageEvent[]
}

// Price validation now happens before default price resolution
type WithValidatedPricesContext = WithResolvedEventsContext & {
  pricesMap: Map<string, Awaited<ReturnType<typeof selectPrices>>[0]>
}

type WithValidatedMetersContext = WithValidatedPricesContext & {
  usageMetersMap: Map<string, UsageMeter.Record>
}

// Default price resolution happens after meter validation
type WithDefaultPricesContext = WithValidatedMetersContext & {
  defaultPriceByUsageMeterId: Map<string, string>
}

type WithFinalInsertsContext = WithDefaultPricesContext & {
  usageInsertsWithBillingPeriodId: UsageEvent.Insert[]
}

// Step 1: Validate and map subscriptions
async function validateAndMapSubscriptions(
  context: BaseContext
): Promise<Result<WithSubscriptionsContext, TRPCError>> {
  const { input, livemode, ctx } = context
  const { transaction } = ctx

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
    { id: uniqueSubscriptionIds },
    transaction
  )

  const subscriptionsMap = new Map(
    subscriptions.map((subscription) => [
      subscription.id,
      subscription,
    ])
  )

  return Result.ok({
    ...context,
    usageInsertsWithoutBillingPeriodId,
    uniqueSubscriptionIds,
    billingPeriodsMap,
    subscriptionsMap,
  })
}

// Step 2: Collect events that need slug resolution
function collectSlugResolutionEvents(
  context: WithSubscriptionsContext
): Result<WithSlugEventsContext, TRPCError> {
  const {
    usageInsertsWithoutBillingPeriodId,
    subscriptionsMap,
    ctx,
  } = context
  const { transaction } = ctx

  const eventsWithPriceSlugs: SlugResolutionEvent[] = []
  const eventsWithUsageMeterSlugs: SlugResolutionEvent[] = []

  for (
    let index = 0;
    index < usageInsertsWithoutBillingPeriodId.length;
    index++
  ) {
    const usageEvent = usageInsertsWithoutBillingPeriodId[index]
    const subscription = subscriptionsMap.get(
      usageEvent.subscriptionId
    )
    if (!subscription) {
      return Result.err(
        new TRPCError({
          code: 'NOT_FOUND',
          message: `Subscription ${usageEvent.subscriptionId} not found for usage event at index ${index}`,
        })
      )
    }

    if ('priceSlug' in usageEvent && usageEvent.priceSlug) {
      eventsWithPriceSlugs.push({
        index,
        slug: usageEvent.priceSlug,
        customerId: subscription.customerId,
      })
    }

    if ('usageMeterSlug' in usageEvent && usageEvent.usageMeterSlug) {
      eventsWithUsageMeterSlugs.push({
        index,
        slug: usageEvent.usageMeterSlug,
        customerId: subscription.customerId,
      })
    }
  }

  // Cache for pricing models
  const pricingModelCache = new Map<
    string,
    Awaited<ReturnType<typeof selectPricingModelForCustomer>>
  >()

  const getPricingModelForCustomer = async (customerId: string) => {
    if (pricingModelCache.has(customerId)) {
      return pricingModelCache.get(customerId)!
    }
    const customer = await selectCustomerById(customerId, transaction)
    const pricingModel = await selectPricingModelForCustomer(
      customer,
      transaction
    )
    pricingModelCache.set(customerId, pricingModel)
    return pricingModel
  }

  return Result.ok({
    ...context,
    eventsWithPriceSlugs,
    eventsWithUsageMeterSlugs,
    pricingModelCache,
    getPricingModelForCustomer,
  })
}

// Step 3: Resolve price slugs to IDs
// Uses composite key (customerId:slug) to avoid collisions across customers
// Looks up both product prices (nested in products) and usage prices (which have productId=null)
async function resolvePriceSlugs(
  context: WithSlugEventsContext
): Promise<
  Result<
    WithSlugEventsContext & { slugToPriceIdMap: Map<string, string> },
    TRPCError
  >
> {
  const { eventsWithPriceSlugs, getPricingModelForCustomer, ctx } =
    context
  const { transaction } = ctx

  const slugToPriceIdMap = new Map<string, string>()

  for (const event of eventsWithPriceSlugs) {
    const pricingModel = await getPricingModelForCustomer(
      event.customerId
    )
    // Prices are nested within products (for subscription/single payment prices)
    let foundPrice: { id: string; slug?: string | null } | undefined
    for (const product of pricingModel.products) {
      foundPrice = product.prices.find(
        (p: { slug?: string | null }) => p.slug === event.slug
      )
      if (foundPrice) break
    }

    // If not found in product prices, also look for usage prices
    // (usage prices have productId=null and belong to usage meters, not products)
    if (!foundPrice) {
      const usagePrices = await selectPrices(
        {
          pricingModelId: pricingModel.id,
          slug: event.slug,
          active: true,
        },
        transaction
      )
      if (usagePrices.length > 0) {
        foundPrice = usagePrices[0]
      }
    }

    if (!foundPrice) {
      return Result.err(
        new TRPCError({
          code: 'NOT_FOUND',
          message: `Price with slug ${event.slug} not found for this customer's pricing model at index ${event.index}`,
        })
      )
    }
    // Use composite key to avoid slug collisions across customers
    slugToPriceIdMap.set(
      `${event.customerId}:${event.slug}`,
      foundPrice.id
    )
  }

  return Result.ok({
    ...context,
    slugToPriceIdMap,
  })
}

// Step 4: Resolve usage meter slugs to IDs
// Uses composite key (customerId:slug) to avoid collisions across customers
async function resolveUsageMeterSlugs(
  context: WithSlugEventsContext & {
    slugToPriceIdMap: Map<string, string>
  }
): Promise<Result<WithResolvedSlugsContext, TRPCError>> {
  const {
    eventsWithUsageMeterSlugs,
    getPricingModelForCustomer,
    slugToPriceIdMap,
  } = context

  const slugToUsageMeterIdMap = new Map<string, string>()

  for (const event of eventsWithUsageMeterSlugs) {
    const pricingModel = await getPricingModelForCustomer(
      event.customerId
    )
    const meter = pricingModel.usageMeters.find(
      (m: { slug?: string | null }) => m.slug === event.slug
    )
    if (!meter) {
      return Result.err(
        new TRPCError({
          code: 'NOT_FOUND',
          message: `Usage meter with slug ${event.slug} not found for this customer's pricing model at index ${event.index}`,
        })
      )
    }
    // Use composite key to avoid slug collisions across customers
    slugToUsageMeterIdMap.set(
      `${event.customerId}:${event.slug}`,
      meter.id
    )
  }

  return Result.ok({
    ...context,
    slugToPriceIdMap,
    slugToUsageMeterIdMap,
  })
}

// Step 5: Apply resolved IDs to events
// Uses composite key (customerId:slug) to look up IDs from the maps
function resolveEventIdentifiers(
  context: WithResolvedSlugsContext
): Result<WithResolvedEventsContext, TRPCError> {
  const {
    usageInsertsWithoutBillingPeriodId,
    slugToPriceIdMap,
    slugToUsageMeterIdMap,
    subscriptionsMap,
  } = context

  const resolvedUsageEvents: ResolvedUsageEvent[] =
    usageInsertsWithoutBillingPeriodId.map((usageEvent) => {
      let priceId: string | null = null
      let usageMeterId: string | undefined = undefined

      // Get customerId from subscription for composite key lookup
      const subscription = subscriptionsMap.get(
        usageEvent.subscriptionId
      )
      const customerId = subscription?.customerId

      if ('priceId' in usageEvent && usageEvent.priceId) {
        priceId = usageEvent.priceId
      } else if (
        'priceSlug' in usageEvent &&
        usageEvent.priceSlug &&
        customerId
      ) {
        // Use composite key (customerId:slug) to look up price ID
        priceId =
          slugToPriceIdMap.get(
            `${customerId}:${usageEvent.priceSlug}`
          ) ?? null
      }

      if ('usageMeterId' in usageEvent && usageEvent.usageMeterId) {
        usageMeterId = usageEvent.usageMeterId
      } else if (
        'usageMeterSlug' in usageEvent &&
        usageEvent.usageMeterSlug &&
        customerId
      ) {
        // Use composite key (customerId:slug) to look up meter ID
        usageMeterId = slugToUsageMeterIdMap.get(
          `${customerId}:${usageEvent.usageMeterSlug}`
        )
      }

      const {
        priceSlug: _priceSlug,
        usageMeterSlug: _usageMeterSlug,
        priceId: _priceId,
        usageMeterId: _usageMeterId,
        ...rest
      } = usageEvent as UsageEventWithLivemode & {
        priceSlug?: string
        usageMeterSlug?: string
        priceId?: string
        usageMeterId?: string
      }

      return {
        ...rest,
        priceId,
        usageMeterId,
      }
    })

  return Result.ok({
    ...context,
    resolvedUsageEvents,
  })
}

// Step 6: Validate prices and build price map
async function validatePricesAndBuildMap(
  context: WithResolvedEventsContext
): Promise<Result<WithValidatedPricesContext, TRPCError>> {
  const {
    resolvedUsageEvents,
    getPricingModelForCustomer,
    subscriptionsMap,
    ctx,
  } = context
  const { transaction } = ctx

  const uniquePriceIds = [
    ...new Set(
      resolvedUsageEvents
        .map((event) => event.priceId)
        .filter((id): id is string => id !== null)
    ),
  ]

  const prices =
    uniquePriceIds.length > 0
      ? await selectPrices({ id: uniquePriceIds }, transaction)
      : []

  const pricesMap = new Map(prices.map((price) => [price.id, price]))

  // Validate each event with a priceId
  for (let i = 0; i < resolvedUsageEvents.length; i++) {
    const event = resolvedUsageEvents[i]
    if (!event.priceId) continue

    const price = pricesMap.get(event.priceId)
    if (!price) {
      return Result.err(
        new TRPCError({
          code: 'NOT_FOUND',
          message: `Price ${event.priceId} not found at index ${i}`,
        })
      )
    }

    if (price.type !== PriceType.Usage) {
      return Result.err(
        new TRPCError({
          code: 'BAD_REQUEST',
          message: `Price ${event.priceId} at index ${i} is type "${price.type}" which is not a usage price`,
        })
      )
    }

    // Validate price belongs to customer's pricing model
    // Use price.pricingModelId directly since usage prices don't have productId
    // and thus aren't nested within pricingModel.products[].prices[]
    const subscription = subscriptionsMap.get(event.subscriptionId)
    if (subscription) {
      const pricingModel = await getPricingModelForCustomer(
        subscription.customerId
      )
      if (price.pricingModelId !== pricingModel.id) {
        return Result.err(
          new TRPCError({
            code: 'NOT_FOUND',
            message: `Price ${event.priceId} not found for this customer's pricing model at index ${i}`,
          })
        )
      }
    }
  }

  return Result.ok({
    ...context,
    pricesMap,
  })
}

// Step 7: Validate usage meters
async function validateUsageMeters(
  context: WithValidatedPricesContext
): Promise<Result<WithValidatedMetersContext, TRPCError>> {
  const {
    resolvedUsageEvents,
    pricesMap,
    getPricingModelForCustomer,
    subscriptionsMap,
    billingPeriodsMap,
    ctx,
  } = context
  const { transaction } = ctx

  // Collect all usage meter IDs (from direct usageMeterId or from price's usageMeterId)
  const usageMeterIds = new Set<string>()
  for (const event of resolvedUsageEvents) {
    if (event.usageMeterId) {
      usageMeterIds.add(event.usageMeterId)
    } else if (event.priceId) {
      const price = pricesMap.get(event.priceId)
      if (price?.usageMeterId) {
        usageMeterIds.add(price.usageMeterId)
      }
    }
  }

  const usageMeters =
    usageMeterIds.size > 0
      ? await selectUsageMeters(
          { id: [...usageMeterIds] },
          transaction
        )
      : []

  const usageMetersMap = new Map(
    usageMeters.map((meter) => [meter.id, meter])
  )

  // Validate each event
  for (let i = 0; i < resolvedUsageEvents.length; i++) {
    const event = resolvedUsageEvents[i]
    let usageMeterId = event.usageMeterId

    // If no direct usageMeterId, get it from the price
    if (!usageMeterId && event.priceId) {
      const price = pricesMap.get(event.priceId)
      usageMeterId = price?.usageMeterId ?? undefined
    }

    if (!usageMeterId) continue

    const meter = usageMetersMap.get(usageMeterId)
    if (!meter) {
      return Result.err(
        new TRPCError({
          code: 'NOT_FOUND',
          message: `Usage meter ${usageMeterId} not found for this customer's pricing model at index ${i}`,
        })
      )
    }

    // Validate meter belongs to customer's pricing model
    const subscription = subscriptionsMap.get(event.subscriptionId)
    if (subscription) {
      const pricingModel = await getPricingModelForCustomer(
        subscription.customerId
      )
      const meterInModel = pricingModel.usageMeters.find(
        (m: { id: string }) => m.id === usageMeterId
      )
      if (!meterInModel) {
        return Result.err(
          new TRPCError({
            code: 'NOT_FOUND',
            message: `Usage meter ${usageMeterId} not found for this customer's pricing model at index ${i}`,
          })
        )
      }
    }

    // Validate CountDistinctProperties requirements
    if (
      meter.aggregationType ===
      UsageMeterAggregationType.CountDistinctProperties
    ) {
      const billingPeriod = billingPeriodsMap.get(
        event.subscriptionId
      )
      if (!billingPeriod) {
        return Result.err(
          new TRPCError({
            code: 'BAD_REQUEST',
            message: `Billing period is required for usage meter "${meter.name}" at index ${i} because it uses "count_distinct_properties" aggregation. This aggregation type requires a billing period for deduplication.`,
          })
        )
      }

      const hasProperties =
        event.properties &&
        typeof event.properties === 'object' &&
        Object.keys(event.properties).length > 0

      if (!hasProperties) {
        return Result.err(
          new TRPCError({
            code: 'BAD_REQUEST',
            message: `Properties are required for usage meter "${meter.name}" at index ${i} because it uses "count_distinct_properties" aggregation. Each usage event must have a non-empty properties object to identify the distinct combination being counted.`,
          })
        )
      }
    }
  }

  return Result.ok({
    ...context,
    usageMetersMap,
  })
}

// Step 8: Resolve default prices for events using meter identifiers
// When events use usageMeterId or usageMeterSlug without an explicit priceId,
// we need to resolve to the meter's default price
// NOTE: This step runs AFTER meter validation to ensure we only resolve prices
// for meters that belong to the customer's pricing model
async function resolveDefaultPricesForMeterEvents(
  context: WithValidatedMetersContext
): Promise<Result<WithDefaultPricesContext, TRPCError>> {
  const { resolvedUsageEvents, pricesMap, ctx } = context
  const { transaction } = ctx

  // Collect all usage meter IDs that need default price resolution
  // (events with usageMeterId but no priceId)
  const usageMeterIdsNeedingDefaultPrice: string[] = []

  for (const event of resolvedUsageEvents) {
    if (event.usageMeterId && !event.priceId) {
      usageMeterIdsNeedingDefaultPrice.push(event.usageMeterId)
    }
  }

  // Batch fetch default prices for all usage meters that need them
  const defaultPricesByMeterId =
    await selectDefaultPricesForUsageMeters(
      [...new Set(usageMeterIdsNeedingDefaultPrice)],
      transaction
    )

  // Verify all meters have default prices and build the ID map
  const defaultPriceByUsageMeterId = new Map<string, string>()
  // Create a new pricesMap that includes the default prices
  const updatedPricesMap = new Map(pricesMap)

  for (const usageMeterId of new Set(
    usageMeterIdsNeedingDefaultPrice
  )) {
    const defaultPrice = defaultPricesByMeterId.get(usageMeterId)
    if (!defaultPrice) {
      return Result.err(
        new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Usage meter ${usageMeterId} has no default price. This should not happen.`,
        })
      )
    }
    defaultPriceByUsageMeterId.set(usageMeterId, defaultPrice.id)
    // Add the default price to the prices map so downstream code can access it
    updatedPricesMap.set(defaultPrice.id, defaultPrice)
  }

  // Update events to use the resolved default prices
  const eventsWithDefaultPrices = resolvedUsageEvents.map((event) => {
    if (event.usageMeterId && !event.priceId) {
      const defaultPriceId = defaultPriceByUsageMeterId.get(
        event.usageMeterId
      )
      if (defaultPriceId) {
        return {
          ...event,
          priceId: defaultPriceId,
        }
      }
    }
    return event
  })

  return Result.ok({
    ...context,
    resolvedUsageEvents: eventsWithDefaultPrices,
    pricesMap: updatedPricesMap,
    defaultPriceByUsageMeterId,
  })
}

// Step 9: Assemble final insert records with billing periods
function assembleFinalInserts(
  context: WithDefaultPricesContext
): Result<WithFinalInsertsContext, TRPCError> {
  const {
    resolvedUsageEvents,
    pricesMap,
    subscriptionsMap,
    billingPeriodsMap,
    usageMetersMap,
  } = context

  const usageInsertsWithBillingPeriodId: UsageEvent.Insert[] = []

  for (let i = 0; i < resolvedUsageEvents.length; i++) {
    const event = resolvedUsageEvents[i]
    const subscription = subscriptionsMap.get(event.subscriptionId)
    const billingPeriod = billingPeriodsMap.get(event.subscriptionId)

    // Validate subscription exists (should have been validated in collectSlugResolutionEvents)
    if (!subscription) {
      return Result.err(
        new TRPCError({
          code: 'NOT_FOUND',
          message: `Subscription ${event.subscriptionId} not found for usage event at index ${i}`,
        })
      )
    }

    // Get usageMeterId from event or from price
    let usageMeterId = event.usageMeterId
    if (!usageMeterId && event.priceId) {
      const price = pricesMap.get(event.priceId)
      usageMeterId = price?.usageMeterId ?? undefined
    }

    // usageMeterId is required for insert
    if (!usageMeterId) {
      return Result.err(
        new TRPCError({
          code: 'BAD_REQUEST',
          message: `Usage event at index ${i} must have a usageMeterId either directly or via a usage price`,
        })
      )
    }

    // Get pricingModelId from meter or price
    let pricingModelId: string | undefined
    const meter = usageMetersMap.get(usageMeterId)
    pricingModelId = meter?.pricingModelId
    if (!pricingModelId && event.priceId) {
      const price = pricesMap.get(event.priceId)
      pricingModelId = price?.pricingModelId
    }

    // Validate pricingModelId exists
    if (!pricingModelId) {
      return Result.err(
        new TRPCError({
          code: 'BAD_REQUEST',
          message: `Could not determine pricingModelId for usage event at index ${i}. Neither the usage meter nor the price has a pricingModelId.`,
        })
      )
    }

    // priceId must be present after default price resolution (either explicit or from meter's default)
    // This should always be true after resolveDefaultPricesForMeterEvents, but we validate to be safe
    if (!event.priceId) {
      return Result.err(
        new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Usage event at index ${i} has no priceId after default price resolution. This should not happen.`,
        })
      )
    }

    usageInsertsWithBillingPeriodId.push({
      subscriptionId: event.subscriptionId,
      customerId: subscription.customerId,
      priceId: event.priceId,
      usageMeterId,
      pricingModelId,
      amount: event.amount,
      transactionId: event.transactionId,
      livemode: event.livemode,
      properties: event.properties ?? {},
      usageDate: event.usageDate ?? Date.now(),
      billingPeriodId: billingPeriod?.id,
    })
  }

  return Result.ok({
    ...context,
    usageInsertsWithBillingPeriodId,
  })
}

// Step 10: Insert events and enqueue ledger commands
async function insertAndEnqueueLedger(
  context: WithFinalInsertsContext
): Promise<
  Result<{ usageEvents: UsageEvent.ClientRecord[] }, TRPCError>
> {
  const { usageInsertsWithBillingPeriodId, livemode, ctx } = context
  const { transaction, enqueueLedgerCommand } = ctx

  const insertedUsageEvents =
    await bulkInsertOrDoNothingUsageEventsByTransactionId(
      usageInsertsWithBillingPeriodId,
      transaction
    )

  // Generate ledger commands for the inserted usage events and enqueue them
  const ledgerCommands =
    await generateLedgerCommandsForBulkUsageEvents(
      {
        insertedUsageEvents,
        livemode,
      },
      transaction
    )
  for (const command of ledgerCommands) {
    enqueueLedgerCommand(command)
  }

  return Result.ok({ usageEvents: insertedUsageEvents })
}

/**
 * Bulk inserts usage events with support for priceId, priceSlug, usageMeterId, or usageMeterSlug.
 * Resolves slugs to IDs, validates pricing model membership, and handles idempotency via transactionId.
 * Generates ledger commands for newly inserted events (not deduplicated ones) via enqueueLedgerCommand callback.
 *
 * @param input - The bulk insert input containing an array of usage events
 * @param input.input - Zod-validated input schema (enforces exactly one identifier per event)
 * @param input.livemode - Whether this is a live mode operation
 * @param ctx - Transaction effects context with callbacks
 * @returns Result with inserted usage events or TRPCError
 */
export const bulkInsertUsageEventsTransaction = async (
  {
    input,
    livemode,
  }: {
    input: BulkInsertUsageEventsInput
    livemode: boolean
  },
  ctx: TransactionEffectsContext
): Promise<
  Result<{ usageEvents: UsageEvent.ClientRecord[] }, TRPCError>
> => {
  return Result.gen(async function* () {
    const withSubscriptions = yield* Result.await(
      validateAndMapSubscriptions({ input, livemode, ctx })
    )
    const withSlugEvents =
      yield* collectSlugResolutionEvents(withSubscriptions)
    const withPriceSlugsResolved = yield* Result.await(
      resolvePriceSlugs(withSlugEvents)
    )
    const withMeterSlugsResolved = yield* Result.await(
      resolveUsageMeterSlugs(withPriceSlugsResolved)
    )
    const withResolvedIdentifiers = yield* resolveEventIdentifiers(
      withMeterSlugsResolved
    )
    // Validate prices first (for events that have explicit priceId)
    const withValidatedPrices = yield* Result.await(
      validatePricesAndBuildMap(withResolvedIdentifiers)
    )
    // Validate usage meters (checks meter belongs to customer's pricing model)
    const withValidatedMeters = yield* Result.await(
      validateUsageMeters(withValidatedPrices)
    )
    // Resolve default prices for events using meter identifiers (after validation)
    const withDefaultPrices = yield* Result.await(
      resolveDefaultPricesForMeterEvents(withValidatedMeters)
    )
    const withFinalInserts =
      yield* assembleFinalInserts(withDefaultPrices)
    const result = yield* Result.await(
      insertAndEnqueueLedger(withFinalInserts)
    )
    return Result.ok(result)
  })
}
