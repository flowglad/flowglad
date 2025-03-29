import { protectedProcedure, router } from '../trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { subscriptionItemClientSelectSchema } from '@/db/schema/subscriptionItems'
import {
  subscriptionClientSelectSchema,
  subscriptionsPaginatedListSchema,
  subscriptionsPaginatedSelectSchema,
} from '@/db/schema/subscriptions'
import {
  isSubscriptionCurrent,
  selectSubscriptionById,
  selectSubscriptionsPaginated,
} from '@/db/tableMethods/subscriptionMethods'
import { idInputSchema } from '@/db/tableUtils'
import { adjustSubscription } from '@/subscriptions/adjustSubscription'
import { adjustSubscriptionInputSchema } from '@/subscriptions/schemas'
import {
  scheduleSubscriptionCancellation,
  scheduleSubscriptionCancellationSchema,
} from '@/subscriptions/cancelSubscription'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'
import { z } from 'zod'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'subscription',
  tags: ['Subscriptions'],
})

export const subscriptionsRouteConfigs = [
  ...routeConfigs,
  trpcToRest('subscriptions.adjust', {
    routeParams: ['id'],
  }),
  trpcToRest('subscriptions.cancel', {
    routeParams: ['id'],
  }),
]

const adjustSubscriptionProcedure = protectedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/subscriptions/{id}/adjust',
      summary: 'Adjust a Subscription',
      tags: ['Subscriptions'],
      protect: true,
    },
  })
  .input(adjustSubscriptionInputSchema)
  .output(
    z.object({
      subscription: subscriptionClientSelectSchema,
      subscriptionItems: subscriptionItemClientSelectSchema.array(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { subscription, subscriptionItems } =
      await authenticatedTransaction(
        async ({ transaction }) => {
          return adjustSubscription(input, transaction)
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    return {
      subscription: {
        ...subscription,
        current: isSubscriptionCurrent(subscription.status),
      },
      subscriptionItems,
    }
  })

const cancelSubscriptionProcedure = protectedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/subscriptions/{id}/cancel',
      summary: 'Cancel a Subscription',
      tags: ['Subscriptions'],
      protect: true,
    },
  })
  .input(scheduleSubscriptionCancellationSchema)
  .output(
    z.object({
      subscription: subscriptionClientSelectSchema,
    })
  )
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const subscription = await scheduleSubscriptionCancellation(
          input,
          transaction
        )
        return {
          subscription: {
            ...subscription,
            current: isSubscriptionCurrent(subscription.status),
          },
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const listSubscriptionsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(subscriptionsPaginatedSelectSchema)
  .output(subscriptionsPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const result = await selectSubscriptionsPaginated(
          input,
          transaction
        )
        return {
          ...result,
          data: result.data.map((subscription) => ({
            ...subscription,
            current: isSubscriptionCurrent(subscription.status),
          })),
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getSubscriptionProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ subscription: subscriptionClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const subscription = await selectSubscriptionById(
          input.id,
          transaction
        )
        return {
          subscription: {
            ...subscription,
            current: isSubscriptionCurrent(subscription.status),
          },
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const subscriptionsRouter = router({
  adjust: adjustSubscriptionProcedure,
  cancel: cancelSubscriptionProcedure,
  list: listSubscriptionsProcedure,
  get: getSubscriptionProcedure,
})
