import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import type { Price } from '@/db/schema/prices'
import {
  bulkInsertUsageEventsSchema,
  type UsageEvent,
  usageEventPaginatedListSchema,
  usageEventPaginatedSelectSchema,
  usageEventsClientSelectSchema,
  usageEventsPaginatedTableRowInputSchema,
  usageEventsPaginatedTableRowOutputSchema,
} from '@/db/schema/usageEvents'
import { selectBillingPeriodsForSubscriptions } from '@/db/tableMethods/billingPeriodMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectPrices } from '@/db/tableMethods/priceMethods'
import { selectPricingModelForCustomer } from '@/db/tableMethods/pricingModelMethods'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'
import {
  bulkInsertOrDoNothingUsageEventsByTransactionId,
  selectUsageEventById,
  selectUsageEventsPaginated,
  selectUsageEventsTableRowData,
} from '@/db/tableMethods/usageEventMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import { idInputSchema } from '@/db/tableUtils'
import { protectedProcedure } from '@/server/trpc'
import { PriceType, UsageMeterAggregationType } from '@/types'
import {
  generateOpenApiMetas,
  type RouteConfig,
} from '@/utils/openapi'
import {
  createUsageEventWithSlugSchema,
  generateLedgerCommandsForBulkUsageEvents,
  ingestAndProcessUsageEvent,
  resolveUsageEventInput,
} from '@/utils/usage/usageEventHelpers'
import { router } from '../trpc'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'usageEvent',
  tags: ['Usage Events'],
})

export const usageEventsRouteConfigs = routeConfigs

export const usageEventsBulkRouteConfig: Record<string, RouteConfig> =
  {
    'POST /usage-events/bulk': {
      procedure: 'usageEvents.bulkInsert',
      pattern: /^usage-events\/bulk$/,
      mapParams: (_, body) => body,
    },
  }

export const createUsageEvent = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createUsageEventWithSlugSchema)
  .output(z.object({ usageEvent: usageEventsClientSelectSchema }))
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, ctx, transaction }) => {
        const resolvedInput = await resolveUsageEventInput(
          input,
          transaction
        )

        return ingestAndProcessUsageEvent(
          { input: resolvedInput, livemode: ctx.livemode },
          transaction
        )
      }
    )
  )

export const getUsageEvent = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ usageEvent: usageEventsClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    const usageEvent = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectUsageEventById(input.id, transaction)
      },
      { apiKey: ctx.apiKey }
    )
    return { usageEvent }
  })

export const bulkInsertUsageEventsProcedure = protectedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/usage-events/bulk',
      summary: 'Bulk Insert Usage Events',
      description:
        'Create multiple usage events in a single request. Supports priceId, priceSlug, usageMeterId, or usageMeterSlug for each event. Exactly one identifier type must be provided per event.',
      tags: ['Usage Events'],
    },
  })
  .input(bulkInsertUsageEventsSchema)
  .output(
    z.object({ usageEvents: z.array(usageEventsClientSelectSchema) })
  )
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, ctx, transaction }) => {
        const usageInsertsWithoutBillingPeriodId =
          input.usageEvents.map((usageEvent) => ({
            ...usageEvent,
            livemode: ctx.livemode,
          }))

        const uniqueSubscriptionIds = [
          ...new Set(
            usageInsertsWithoutBillingPeriodId.map(
              (usageEvent) => usageEvent.subscriptionId
            )
          ),
        ]

        const billingPeriods =
          await selectBillingPeriodsForSubscriptions(
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

        usageInsertsWithoutBillingPeriodId.forEach(
          (usageEvent, index) => {
            const subscription = subscriptionsMap.get(
              usageEvent.subscriptionId
            )
            if (!subscription) {
              throw new Error(
                `Subscription ${usageEvent.subscriptionId} not found for usage event at index ${index}`
              )
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
          }
        )

        // Cache pricing models by customerId to avoid duplicate lookups
        const pricingModelCache = new Map<
          string,
          Awaited<ReturnType<typeof selectPricingModelForCustomer>>
        >()

        const getPricingModelForCustomer = async (
          customerId: string
        ) => {
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
          return pricingModelCache.get(customerId)!
        }

        // Batch lookup prices by slug for each unique customer-slug combination
        const slugToPriceIdMap = new Map<string, string>()

        if (eventsWithPriceSlugs.length > 0) {
          // Group by customer and collect unique slugs per customer
          const customerSlugsMap = new Map<string, Set<string>>()

          eventsWithPriceSlugs.forEach(({ customerId, slug }) => {
            if (!customerSlugsMap.has(customerId)) {
              customerSlugsMap.set(customerId, new Set())
            }
            customerSlugsMap.get(customerId)!.add(slug)
          })

          // Perform batch lookups for each customer using cached pricing models
          for (const [
            customerId,
            slugs,
          ] of customerSlugsMap.entries()) {
            const pricingModel =
              await getPricingModelForCustomer(customerId)

            for (const slug of slugs) {
              // Search through all products in the pricing model to find a price with the matching slug
              let price: Price.ClientRecord | null = null

              for (const product of pricingModel.products) {
                const foundPrice = product.prices.find(
                  (p) => p.slug === slug
                )
                if (foundPrice) {
                  price = foundPrice
                  break
                }
              }

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

          eventsWithUsageMeterSlugs.forEach(
            ({ customerId, slug }) => {
              if (!customerSlugsMap.has(customerId)) {
                customerSlugsMap.set(customerId, new Set())
              }
              customerSlugsMap.get(customerId)!.add(slug)
            }
          )

          // Perform batch lookups for each customer using cached pricing models
          for (const [
            customerId,
            slugs,
          ] of customerSlugsMap.entries()) {
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
        const resolvedUsageEvents =
          usageInsertsWithoutBillingPeriodId.map(
            (usageEvent, index) => {
              const subscription = subscriptionsMap.get(
                usageEvent.subscriptionId
              )!

              let priceId: string | null = usageEvent.priceId ?? null
              let usageMeterId: string | undefined =
                usageEvent.usageMeterId

              // If priceSlug is provided, resolve it
              if (usageEvent.priceSlug) {
                const key = `${subscription.customerId}:${usageEvent.priceSlug}`
                const resolvedPriceId = slugToPriceIdMap.get(key)

                if (!resolvedPriceId) {
                  throw new Error(
                    `Failed to resolve price slug ${usageEvent.priceSlug} for event at index ${index}`
                  )
                }
                priceId = resolvedPriceId
              }

              // If usageMeterSlug is provided, resolve it
              if (usageEvent.usageMeterSlug) {
                const key = `${subscription.customerId}:${usageEvent.usageMeterSlug}`
                const resolvedUsageMeterId =
                  slugToUsageMeterIdMap.get(key)

                if (!resolvedUsageMeterId) {
                  throw new Error(
                    `Failed to resolve usage meter slug ${usageEvent.usageMeterSlug} for event at index ${index}`
                  )
                }
                usageMeterId = resolvedUsageMeterId
                priceId = null // When usage meter identifiers are used, priceId is null
              }

              // Omit slug fields and set resolved identifiers
              const { priceSlug, usageMeterSlug, ...rest } =
                usageEvent
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
              throw new Error(
                `Received a usage event insert with priceId ${price.id}, which is not a usage price. Please ensure all priceIds provided are usage prices.`
              )
            }
          })
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

          eventsWithDirectUsageMeters.forEach(
            ({ usageEvent, index }) => {
              const subscription = subscriptionsMap.get(
                usageEvent.subscriptionId
              )!
              const customerId = subscription.customerId

              if (!customerEventsMap.has(customerId)) {
                customerEventsMap.set(customerId, [])
              }

              customerEventsMap.get(customerId)!.push({
                usageMeterId: usageEvent.usageMeterId!,
                index,
              })
            }
          )

          // Batch validate for each customer using cached pricing models
          for (const [
            customerId,
            events,
          ] of customerEventsMap.entries()) {
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
              throw new Error(
                `Subscription ${usageEvent.subscriptionId} not found for usage event at index ${index}`
              )
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
                throw new Error(
                  `Price ${usageEvent.priceId} not found for usage event at index ${index}`
                )
              }
              if (!price.usageMeterId) {
                throw new Error(
                  `Usage meter not found for price ${usageEvent.priceId} at index ${index}`
                )
              }
              finalUsageMeterId = price.usageMeterId
            } else if (usageEvent.usageMeterId) {
              // When usageMeterId is provided directly, use it
              finalUsageMeterId = usageEvent.usageMeterId
            } else {
              throw new Error(
                `Either priceId or usageMeterId must be provided for usage event at index ${index}`
              )
            }

            // Check if usage meter requires billing period (CountDistinctProperties)
            const usageMeter = usageMetersMap.get(finalUsageMeterId)
            if (
              usageMeter?.aggregationType ===
              UsageMeterAggregationType.CountDistinctProperties
            ) {
              if (!billingPeriod) {
                throw new Error(
                  `Billing period is required for usage meter "${usageMeter.name}" at index ${index} because it uses "count_distinct_properties" aggregation. This aggregation type requires a billing period for deduplication.`
                )
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
              usageDate: usageEvent.usageDate
                ? usageEvent.usageDate
                : Date.now(),
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
              livemode: ctx.livemode,
            },
            transaction
          )

        return {
          result: { usageEvents: insertedUsageEvents },
          ledgerCommands,
        }
      }
    )
  )

// List usage events with pagination
const listUsageEventsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(usageEventPaginatedSelectSchema)
  .output(usageEventPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const result = await selectUsageEventsPaginated(
          input,
          transaction
        )
        return {
          items: result.data,
          total: result.total,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

// Get table rows for usage events with joins
const getTableRowsProcedure = protectedProcedure
  .input(usageEventsPaginatedTableRowInputSchema)
  .output(usageEventsPaginatedTableRowOutputSchema)
  .query(
    authenticatedProcedureTransaction(selectUsageEventsTableRowData)
  )

export const usageEventsRouter = router({
  get: getUsageEvent,
  create: createUsageEvent,
  bulkInsert: bulkInsertUsageEventsProcedure,
  list: listUsageEventsProcedure,
  getTableRows: getTableRowsProcedure,
})
