import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
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
import {
  selectPriceBySlugAndCustomerId,
  selectPrices,
} from '@/db/tableMethods/priceMethods'
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
        'Create multiple usage events in a single request. Supports both priceId and priceSlug for each event.',
      tags: ['Usage Events'],
    },
  })
  .input(bulkInsertUsageEventsSchema)
  .output(
    z.object({ usageEvents: z.array(usageEventsClientSelectSchema) })
  )
  .mutation(async ({ input, ctx }) => {
    const usageEvents = await authenticatedTransaction(
      async ({ transaction }) => {
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

        // Batch resolve price slugs to price IDs
        // First, collect all events that need slug resolution, grouped by customer
        const eventsWithSlugs: Array<{
          index: number
          slug: string
          customerId: string
        }> = []

        usageInsertsWithoutBillingPeriodId.forEach(
          (usageEvent, index) => {
            if (usageEvent.priceSlug) {
              const subscription = subscriptionsMap.get(
                usageEvent.subscriptionId
              )
              if (!subscription) {
                throw new Error(
                  `Subscription ${usageEvent.subscriptionId} not found for usage event at index ${index}`
                )
              }
              eventsWithSlugs.push({
                index,
                slug: usageEvent.priceSlug,
                customerId: subscription.customerId,
              })
            }
          }
        )

        // Batch lookup prices by slug for each unique customer-slug combination
        const slugToPriceIdMap = new Map<string, string>()

        if (eventsWithSlugs.length > 0) {
          // Group by customer and collect unique slugs per customer
          const customerSlugsMap = new Map<string, Set<string>>()

          eventsWithSlugs.forEach(({ customerId, slug }) => {
            if (!customerSlugsMap.has(customerId)) {
              customerSlugsMap.set(customerId, new Set())
            }
            customerSlugsMap.get(customerId)!.add(slug)
          })

          // Perform batch lookups for each customer
          for (const [
            customerId,
            slugs,
          ] of customerSlugsMap.entries()) {
            for (const slug of slugs) {
              const price = await selectPriceBySlugAndCustomerId(
                { slug, customerId },
                transaction
              )

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

        // Resolve priceIds for all events (either already present or resolved from slug)
        const resolvedUsageEvents =
          usageInsertsWithoutBillingPeriodId.map(
            (usageEvent, index) => {
              let priceId = usageEvent.priceId

              // If priceSlug is provided, resolve it
              if (usageEvent.priceSlug) {
                const subscription = subscriptionsMap.get(
                  usageEvent.subscriptionId
                )!
                const key = `${subscription.customerId}:${usageEvent.priceSlug}`
                priceId = slugToPriceIdMap.get(key)

                if (!priceId) {
                  throw new Error(
                    `Failed to resolve price slug ${usageEvent.priceSlug} for event at index ${index}`
                  )
                }
              }

              if (!priceId) {
                throw new Error(
                  `No priceId or priceSlug provided for event at index ${index}`
                )
              }

              return {
                ...usageEvent,
                priceId,
              }
            }
          )

        const uniquePriceIds = [
          ...new Set(
            resolvedUsageEvents.map(
              (usageEvent) => usageEvent.priceId
            )
          ),
        ]
        const prices = await selectPrices(
          {
            id: uniquePriceIds,
          },
          transaction
        )
        const pricesMap = new Map(
          prices.map((price) => [price.id, price])
        )

        prices.forEach((price) => {
          if (price.type !== PriceType.Usage) {
            throw new Error(
              `Received a usage event insert with priceId ${price.id}, which is not a usage price. Please ensure all priceIds provided are usage prices.`
            )
          }
        })

        // Fetch usage meters to check aggregation types
        const uniqueUsageMeterIds = [
          ...new Set(
            prices
              .map((price) => price.usageMeterId)
              .filter((id): id is string => id !== null)
          ),
        ]
        const usageMeters = await selectUsageMeters(
          {
            id: uniqueUsageMeterIds,
          },
          transaction
        )
        const usageMetersMap = new Map(
          usageMeters.map((meter) => [meter.id, meter])
        )

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

            // Check if usage meter requires billing period (CountDistinctProperties)
            const usageMeter = usageMetersMap.get(price.usageMeterId)
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
              usageMeterId: price.usageMeterId,
              usageDate: usageEvent.usageDate
                ? usageEvent.usageDate
                : Date.now(),
            }
          })
        return await bulkInsertOrDoNothingUsageEventsByTransactionId(
          usageInsertsWithBillingPeriodId,
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return { usageEvents }
  })

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
