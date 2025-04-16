import { router } from '../trpc'
import {
  editUsageEventSchema,
  createUsageEventSchema,
  bulkInsertUsageEventsSchema,
  UsageEvent,
} from '@/db/schema/usageEvents'
import {
  bulkInsertOrDoNothingUsageEventsByTransactionId,
  selectUsageEventById,
  selectUsageEvents,
  updateUsageEvent,
} from '@/db/tableMethods/usageEventMethods'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'
import { usageEventsClientSelectSchema } from '@/db/schema/usageEvents'

import { usageProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { insertUsageEvent } from '@/db/tableMethods/usageEventMethods'
import { idInputSchema } from '@/db/tableUtils'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { z } from 'zod'
import {
  selectBillingPeriodsForSubscriptions,
  selectCurrentBillingPeriodForSubscription,
} from '@/db/tableMethods/billingPeriodMethods'
import {
  selectSubscriptionById,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import {
  selectPriceById,
  selectPrices,
} from '@/db/tableMethods/priceMethods'
import { PriceType } from '@/types'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'usageEvent',
  tags: ['UsageEvents'],
})

export const usageEventsRouteConfigs = routeConfigs

export const createUsageEvent = usageProcedure
  .meta(openApiMetas.POST)
  .input(createUsageEventSchema)
  .output(z.object({ usageEvent: usageEventsClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const usageEvent = await authenticatedTransaction(
      async ({ transaction, livemode }) => {
        const billingPeriod =
          await selectCurrentBillingPeriodForSubscription(
            input.usageEvent.subscriptionId,
            transaction
          )
        if (!billingPeriod) {
          throw new Error('Billing period not found')
        }
        const price = await selectPriceById(
          input.usageEvent.priceId,
          transaction
        )
        if (price.type !== PriceType.Usage) {
          throw new Error(
            `Price ${price.id} is not a usage price. Please provide a usage price id to create a usage event.`
          )
        }
        const [existingUsageEvent] = await selectUsageEvents(
          {
            transactionId: input.usageEvent.transactionId,
            usageMeterId: price.usageMeterId,
          },
          transaction
        )
        if (existingUsageEvent) {
          if (
            existingUsageEvent.subscriptionId !==
            input.usageEvent.subscriptionId
          ) {
            throw new Error(
              `A usage event already exists for transactionid ${input.usageEvent.transactionId}, but does not belong to subscription ${input.usageEvent.subscriptionId}. Please provide a unique transactionId to create a new usage event.`
            )
          }
          return existingUsageEvent
        }
        const subscription = await selectSubscriptionById(
          input.usageEvent.subscriptionId,
          transaction
        )

        return insertUsageEvent(
          {
            ...input.usageEvent,
            usageMeterId: price.usageMeterId,
            billingPeriodId: billingPeriod.id,
            customerId: subscription.customerId,
            livemode,
            properties: input.usageEvent.properties ?? {},
            usageDate: input.usageEvent.usageDate
              ? new Date(input.usageEvent.usageDate)
              : undefined,
          },
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return { usageEvent }
  })

export const editUsageEvent = usageProcedure
  .meta(openApiMetas.PUT)
  .input(editUsageEventSchema)
  .output(z.object({ usageEvent: usageEventsClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const usageEvent = await authenticatedTransaction(
      async ({ transaction }) => {
        const updatedUsageEvent = await updateUsageEvent(
          {
            ...input.usageEvent,
            id: input.id,
            usageDate: input.usageEvent.usageDate
              ? new Date(input.usageEvent.usageDate)
              : undefined,
          },
          transaction
        )
        return updatedUsageEvent
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return { usageEvent }
  })

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
  update: editUsageEvent,
  bulkInsert: bulkInsertUsageEventsProcedure,
})
