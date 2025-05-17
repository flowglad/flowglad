import { router } from '../trpc'
import {
  createUsageEventSchema,
  bulkInsertUsageEventsSchema,
  UsageEvent,
} from '@/db/schema/usageEvents'
import {
  bulkInsertOrDoNothingUsageEventsByTransactionId,
  selectUsageEventById,
} from '@/db/tableMethods/usageEventMethods'
import { generateOpenApiMetas } from '@/utils/openapi'
import { usageEventsClientSelectSchema } from '@/db/schema/usageEvents'

import { usageProcedure } from '@/server/trpc'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
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

export const createUsageEvent = usageProcedure
  .meta(openApiMetas.POST)
  .input(createUsageEventSchema)
  .output(z.object({ usageEvent: usageEventsClientSelectSchema }))
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, livemode, transaction }) => {
        const usageEvent = await ingestAndProcessUsageEvent(
          { input, livemode },
          transaction
        )
        return { usageEvent }
      }
    )
  )

export const getUsageEvent = usageProcedure
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

export const bulkInsertUsageEventsProcedure = usageProcedure
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
              : undefined,
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

export const usageEventsRouter = router({
  get: getUsageEvent,
  create: createUsageEvent,
  bulkInsert: bulkInsertUsageEventsProcedure,
})
