import { protectedProcedure, router } from '../trpc'
import { IntervalUnit } from '@/types'
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
import { idInputSchema, metadataSchema } from '@/db/tableUtils'
import { adjustSubscription } from '@/subscriptions/adjustSubscription'
import { adjustSubscriptionInputSchema } from '@/subscriptions/schemas'
import {
  scheduleSubscriptionCancellation,
  scheduleSubscriptionCancellationSchema,
} from '@/subscriptions/cancelSubscription'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'
import { z } from 'zod'
import { setupIntentSucceededCreateSubscriptionWorkflow } from '@/subscriptions/createSubscription'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { TRPCError } from '@trpc/server'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'

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

const createSubscriptionInputSchema = z.object({
  customerId: z
    .string()
    .describe('The customer for the subscription.'),
  priceId: z
    .string()
    .describe(
      `The price to subscribe to. Used to determine whether the subscription is ` +
        `usage-based or not, and set other defaults such as trial period and billing intervals.`
    ),
  quantity: z
    .number()
    .describe('The quantity of the price purchased.'),
  startDate: z
    .date()
    .optional()
    .describe(
      'The time when the subscription starts. If not provided, defaults to current time.'
    ),
  interval: z.nativeEnum(IntervalUnit),
  intervalCount: z
    .number()
    .optional()
    .describe(
      'The number of intervals that each billing period will last. If not provided, defaults to 1'
    ),
  trialEnd: z
    .date()
    .optional()
    .describe(
      `The time when the trial ends. If not provided, defaults to startDate + the associated price's trialPeriodDays`
    ),
  metadata: metadataSchema.optional(),
  name: z
    .string()
    .optional()
    .describe(
      `The name of the subscription. If not provided, defaults ` +
        `to the name of the product associated with the price provided by 'priceId'.`
    ),
  defaultPaymentMethodId: z
    .string()
    .optional()
    .describe(
      `The default payment method to use when attempting to run charges for the subscription.` +
        `If not provided, the customer's default payment method will be used. ` +
        `If no default payment method is present, charges will not run. ` +
        `If no default payment method is provided and there is a trial ` +
        `period for the subscription, ` +
        `the subscription will enter 'trial_ended' status at the end of the trial period.`
    ),
  backupPaymentMethodId: z
    .string()
    .optional()
    .describe(
      `The payment method to try if charges for the subscription fail with the default payment method.`
    ),
})

const createSubscriptionProcedure = protectedProcedure
  .input(createSubscriptionInputSchema)
  .output(z.object({ subscription: subscriptionClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const customer = await selectCustomerById(
          input.customerId,
          transaction
        )
        const priceResult =
          await selectPriceProductAndOrganizationByPriceWhere(
            {
              id: input.priceId,
            },
            transaction
          )
        if (priceResult.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Price ${input.priceId} not found`,
          })
        }
        const { price, product, organization } = priceResult[0]
        const defaultPaymentMethod = input.defaultPaymentMethodId
          ? await selectPaymentMethodById(
              input.defaultPaymentMethodId,
              transaction
            )
          : undefined
        const backupPaymentMethod = input.backupPaymentMethodId
          ? await selectPaymentMethodById(
              input.backupPaymentMethodId,
              transaction
            )
          : undefined
        const subscription =
          await setupIntentSucceededCreateSubscriptionWorkflow(
            {
              customer,
              organization,
              product,
              price,
              quantity: input.quantity,
              startDate: input.startDate ?? new Date(),
              interval: input.interval,
              intervalCount: input.intervalCount ?? 1,
              trialEnd: input.trialEnd,
              stripeSetupIntentId: input.stripeSetupIntentId,
              metadata: input.metadata,
              name: input.name,
              defaultPaymentMethod,
              backupPaymentMethod,
              livemode: ctx.livemode,
            },
            transaction
          )
        return { subscription }
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
