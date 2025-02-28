import { protectedProcedure, router } from '../trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { subscriptionItemClientSelectSchema } from '@/db/schema/subscriptionItems'
import {
  subscriptionClientSelectSchema,
  subscriptionsPaginatedListSchema,
  subscriptionsPaginatedSelectSchema,
} from '@/db/schema/subscriptions'
import {
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
  resource: 'Subscription',
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
  .mutation(async ({ input }) => {
    const { subscription, subscriptionItems } =
      await authenticatedTransaction(async ({ transaction }) => {
        return adjustSubscription(input, transaction)
      })
    return {
      subscription,
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
  .mutation(async ({ input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      const subscription = await scheduleSubscriptionCancellation(
        input,
        transaction
      )
      return { subscription }
    })
  })

const listSubscriptionsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(subscriptionsPaginatedSelectSchema)
  .output(subscriptionsPaginatedListSchema)
  .query(async ({ input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      return selectSubscriptionsPaginated(input, transaction)
    })
  })

const getSubscriptionProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ subscription: subscriptionClientSelectSchema }))
  .query(async ({ input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      const subscription = await selectSubscriptionById(
        input.id,
        transaction
      )
      return { subscription }
    })
  })

export const subscriptionsRouter = router({
  adjust: adjustSubscriptionProcedure,
  cancel: cancelSubscriptionProcedure,
  list: listSubscriptionsProcedure,
  get: getSubscriptionProcedure,
})
