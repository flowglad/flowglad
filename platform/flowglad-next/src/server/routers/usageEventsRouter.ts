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
        return insertUsageEvent(
          {
            ...input.usageEvent,
            billingPeriodId: billingPeriod.id,
            livemode,
            properties: input.usageEvent.properties ?? {},
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
  .meta(openApiMetas.POST)
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

        const usageInsertsWithBillingPeriodId: UsageEvent.Insert[] =
          usageInsertsWithoutBillingPeriodId.map((usageEvent) => ({
            ...usageEvent,
            billingPeriodId: billingPeriodsMap.get(
              usageEvent.subscriptionId
            )?.id!,
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
})
