import { router } from '../trpc'
import {
  createUsageEventSchema,
  bulkInsertUsageEventsSchema,
  usageEventPaginatedSelectSchema,
  usageEventPaginatedListSchema,
  usageEventsPaginatedTableRowInputSchema,
  usageEventsPaginatedTableRowOutputSchema,
  UsageEvent,
} from '@/db/schema/usageEvents'
import {
  bulkInsertOrDoNothingUsageEventsByTransactionId,
  selectUsageEventById,
  selectUsageEventsPaginated,
  selectUsageEventsTableRowData,
} from '@/db/tableMethods/usageEventMethods'
import { generateOpenApiMetas } from '@/utils/openapi'
import { usageEventsClientSelectSchema } from '@/db/schema/usageEvents'

import { protectedProcedure } from '@/server/trpc'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedTransaction,
  authenticatedProcedureTransaction,
} from '@/db/authenticatedTransaction'
import { idInputSchema } from '@/db/tableUtils'
import { z } from 'zod'
import { selectBillingPeriodsForSubscriptions } from '@/db/tableMethods/billingPeriodMethods'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'
import { selectPrices } from '@/db/tableMethods/priceMethods'
import { PriceType } from '@/types'
import { ingestAndProcessUsageEvent } from '@/utils/usage/usageEventHelpers'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'usageEvent',
  tags: ['UsageEvents'],
})

export const usageEventsRouteConfigs = routeConfigs

export const createUsageEvent = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createUsageEventSchema)
  .output(z.object({ usageEvent: usageEventsClientSelectSchema }))
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, ctx, transaction }) => {
        return ingestAndProcessUsageEvent(
          { input, livemode: ctx.livemode },
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
        const uniquePriceIds = [
          ...new Set(
            usageInsertsWithoutBillingPeriodId.map(
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

        const usageInsertsWithBillingPeriodId: UsageEvent.Insert[] =
          usageInsertsWithoutBillingPeriodId.map((usageEvent) => ({
            ...usageEvent,
            customerId: subscriptionsMap.get(
              usageEvent.subscriptionId
            )?.customerId!,
            billingPeriodId: billingPeriodsMap.get(
              usageEvent.subscriptionId
            )?.id!,
            usageMeterId: pricesMap.get(usageEvent.priceId)
              ?.usageMeterId!,
            usageDate: usageEvent.usageDate
              ? new Date(usageEvent.usageDate)
              : new Date(),
          }))
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
          {
            cursor: input.cursor,
            limit: input.limit,
          },
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
  .query(authenticatedProcedureTransaction(selectUsageEventsTableRowData))

export const usageEventsRouter = router({
  get: getUsageEvent,
  create: createUsageEvent,
  bulkInsert: bulkInsertUsageEventsProcedure,
  list: listUsageEventsProcedure,
  getTableRows: getTableRowsProcedure,
})
