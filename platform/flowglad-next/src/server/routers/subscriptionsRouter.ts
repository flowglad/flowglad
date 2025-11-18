import { protectedProcedure, router } from '../trpc'
import {
  BillingPeriodStatus,
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import { subscriptionItemClientSelectSchema } from '@/db/schema/subscriptionItems'
import {
  retryBillingRunInputSchema,
  subscriptionClientSelectSchema,
  subscriptionsPaginatedListSchema,
  subscriptionsPaginatedSelectSchema,
  subscriptionsTableRowDataSchema,
  updateSubscriptionPaymentMethodSchema,
} from '@/db/schema/subscriptions'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import {
  isSubscriptionCurrent,
  selectSubscriptionById,
  selectSubscriptionsPaginated,
  selectSubscriptionsTableRowData,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
  metadataSchema,
} from '@/db/tableUtils'
import { adjustSubscription } from '@/subscriptions/adjustSubscription'
import {
  adjustSubscriptionInputSchema,
  scheduleSubscriptionCancellationSchema,
} from '@/subscriptions/schemas'
import { cancelSubscriptionProcedureTransaction } from '@/subscriptions/cancelSubscription'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'
import { z } from 'zod'
import { createSubscriptionWorkflow } from '@/subscriptions/createSubscription/workflow'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { TRPCError } from '@trpc/server'
import {
  selectPaymentMethodById,
  selectPaymentMethods,
} from '@/db/tableMethods/paymentMethodMethods'
import { selectSubscriptionCountsByStatus } from '@/db/tableMethods/subscriptionMethods'
import {
  createBillingRunInsert,
  executeBillingRun,
} from '@/subscriptions/billingRunHelpers'
import { safelyInsertBillingRun } from '@/db/tableMethods/billingRunMethods'
import {
  cancelFreeSubscriptionForUpgrade,
  linkUpgradedSubscriptions,
} from '@/subscriptions/cancelFreeSubscriptionForUpgrade'

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
      summary: 'Adjust Subscription',
      description:
        'Note: Immediate adjustments are in private preview (Please let us know you use this feature: https://github.com/flowglad/flowglad/issues/616). Adjustments at the end of the current billing period are generally available.',
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
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, transaction, ctx }) => {
        if (!ctx.organization) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Organization not found',
          })
        }
        const { subscription, subscriptionItems } =
          await adjustSubscription(
            input,
            ctx.organization,
            transaction
          )
        return {
          result: {
            subscription: {
              ...subscription,
              current: isSubscriptionCurrent(
                subscription.status,
                subscription.cancellationReason
              ),
            },
            subscriptionItems,
          },
        }
      }
    )
  )

const cancelSubscriptionProcedure = protectedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/subscriptions/{id}/cancel',
      summary: 'Cancel Subscription',
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
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      cancelSubscriptionProcedureTransaction
    )
  )

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
            current: isSubscriptionCurrent(
              subscription.status,
              subscription.cancellationReason
            ),
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
            current: isSubscriptionCurrent(
              subscription.status,
              subscription.cancellationReason
            ),
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
    .optional()
    .describe(
      'The quantity of the price purchased. If not provided, defaults to 1.'
    ),
  startDate: z
    .date()
    .optional()
    .describe(
      'The time when the subscription starts. If not provided, defaults to current time.'
    ),
  interval: z
    .nativeEnum(IntervalUnit)
    .optional()
    .describe(
      'The interval of the subscription. If not provided, defaults to the interval of the price provided by ' +
        '`priceId`.'
    ),
  intervalCount: z
    .number()
    .optional()
    .describe(
      'The number of intervals that each billing period will last. If not provided, defaults to 1'
    ),
  trialEnd: z
    .number()
    .optional()
    .describe(
      `Epoch time in milliseconds of when the trial ends. If not provided, defaults to startDate + the associated price's trialPeriodDays`
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
  .meta(openApiMetas.POST)
  .input(createSubscriptionInputSchema)
  .output(z.object({ subscription: subscriptionClientSelectSchema }))
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, transaction, ctx }) => {
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
        if (price.type === PriceType.SinglePayment) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Price ${input.priceId} is a single payment price and cannot be used to create a subscription.`,
          })
        }
        const startDate = input.startDate ?? new Date()
        const defaultTrialEnd = price.trialPeriodDays
          ? new Date(
              startDate.getTime() +
                price.trialPeriodDays * 24 * 60 * 60 * 1000
            )
          : undefined
        const trialEnd = input.trialEnd ?? defaultTrialEnd
        /**
         * If the price is paid (unitPrice > 0), treat this as a potential
         * free → paid upgrade and cancel any active free subscription first.
         * This mirrors the behavior in the checkout flow (processSetupIntent),
         * but is applied at the API layer before calling the shared workflow.
         */
        const canceledFreeSubscription =
          price.unitPrice > 0
            ? await cancelFreeSubscriptionForUpgrade(
                customer.id,
                transaction
              )
            : null

        const output = await createSubscriptionWorkflow(
          {
            customer,
            organization,
            product,
            price,
            quantity: input.quantity ?? 1,
            interval: input.interval ?? price.intervalUnit,
            intervalCount: input.intervalCount ?? price.intervalCount,
            trialEnd: trialEnd ? new Date(trialEnd) : undefined,
            metadata: input.metadata,
            name: input.name,
            startDate,
            defaultPaymentMethod,
            backupPaymentMethod,
            livemode: ctx.livemode,
            autoStart: true,
            previousSubscriptionId:
              canceledFreeSubscription?.id ?? undefined,
          },
          transaction
        )
        /**
         * If a free subscription was canceled as part of an upgrade, link
         * the old and new subscriptions for traceability.
         */
        if (canceledFreeSubscription && output.result?.subscription) {
          await linkUpgradedSubscriptions(
            canceledFreeSubscription,
            output.result.subscription.id,
            transaction
          )
        }
        const finalResult = {
          subscription: {
            ...output.result.subscription,
            current: isSubscriptionCurrent(
              output.result.subscription.status,
              output.result.subscription.cancellationReason
            ),
          },
        }

        return {
          ...output,
          result: {
            ...output.result,
            ...finalResult,
          },
        }
      }
    )
  )

const getCountsByStatusProcedure = protectedProcedure
  .input(z.object({}))
  .output(
    z.array(
      z.object({
        status: z.nativeEnum(SubscriptionStatus),
        count: z.number(),
      })
    )
  )
  .query(async ({ ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectSubscriptionCountsByStatus(transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getTableRows = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        status: z.nativeEnum(SubscriptionStatus).optional(),
        customerId: z.string().optional(),
        organizationId: z.string().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(
      subscriptionsTableRowDataSchema
    )
  )
  .query(
    authenticatedProcedureTransaction(selectSubscriptionsTableRowData)
  )

// TRPC-only procedure, not exposed as REST API
const updatePaymentMethodProcedure = protectedProcedure
  .input(updateSubscriptionPaymentMethodSchema)
  .output(
    z.object({
      subscription: subscriptionClientSelectSchema,
    })
  )
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transaction }) => {
        const subscription = await selectSubscriptionById(
          input.id,
          transaction
        )

        // Verify the payment method exists and belongs to the same customer
        const paymentMethod = await selectPaymentMethodById(
          input.paymentMethodId,
          transaction
        )

        if (paymentMethod.customerId !== subscription.customerId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Payment method does not belong to the subscription customer',
          })
        }

        // Update the subscription with the new payment method
        const updatedSubscription = await updateSubscription(
          {
            id: subscription.id,
            defaultPaymentMethodId: input.paymentMethodId,
            renews: subscription.renews,
          },
          transaction
        )

        return {
          subscription: {
            ...updatedSubscription,
            current: isSubscriptionCurrent(
              updatedSubscription.status,
              updatedSubscription.cancellationReason
            ),
          },
        }
      }
    )
  )
const retryBillingRunProcedure = protectedProcedure
  .input(retryBillingRunInputSchema)
  .output(z.object({ message: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const billingPeriod = await selectBillingPeriodById(
          input.billingPeriodId,
          transaction
        )
        if (billingPeriod.status === BillingPeriodStatus.Completed) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Billing period is already completed',
          })
        }
        if (billingPeriod.status === BillingPeriodStatus.Canceled) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Billing period is already canceled',
          })
        }
        if (billingPeriod.status === BillingPeriodStatus.Upcoming) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Billing period is already upcoming',
          })
        }
        const subscription = await selectSubscriptionById(
          billingPeriod.subscriptionId,
          transaction
        )
        const paymentMethod = subscription.defaultPaymentMethodId
          ? await selectPaymentMethodById(
              subscription.defaultPaymentMethodId,
              transaction
            )
          : (
              await selectPaymentMethods(
                {
                  customerId: subscription.customerId,
                  default: true,
                },
                transaction
              )
            )[0]

        if (!paymentMethod) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No payment method found for subscription',
          })
        }

        const billingRunInsert = createBillingRunInsert({
          billingPeriod,
          scheduledFor: new Date(),
          paymentMethod,
        })
        return safelyInsertBillingRun(billingRunInsert, transaction)
      },
      { apiKey: ctx.apiKey }
    )
    const billingRun = await executeBillingRun(result.id)
    if (!billingRun) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Failed to execute billing run',
      })
    }
    return {
      message: 'Billing run executed',
    }
  })

export const subscriptionsRouter = router({
  adjust: adjustSubscriptionProcedure,
  cancel: cancelSubscriptionProcedure,
  list: listSubscriptionsProcedure,
  get: getSubscriptionProcedure,
  create: createSubscriptionProcedure,
  getCountsByStatus: getCountsByStatusProcedure,
  retryBillingRunProcedure,
  getTableRows,
  updatePaymentMethod: updatePaymentMethodProcedure,
})
