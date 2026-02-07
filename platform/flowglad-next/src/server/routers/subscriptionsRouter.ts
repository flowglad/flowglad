import {
  BillingPeriodStatus,
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@db-core/enums'

import { Customer } from '@db-core/schema/customers'
import { Organization } from '@db-core/schema/organizations'
import {
  PRICE_ID_DESCRIPTION,
  PRICE_SLUG_DESCRIPTION,
  Price,
} from '@db-core/schema/prices'
import { Product } from '@db-core/schema/products'
import { subscriptionItemClientSelectSchema } from '@db-core/schema/subscriptionItems'
import {
  retryBillingRunInputSchema,
  subscriptionClientSelectSchema,
  subscriptionsPaginatedListSchema,
  subscriptionsPaginatedSelectSchema,
  subscriptionsTableRowDataSchema,
  updateSubscriptionPaymentMethodSchema,
} from '@db-core/schema/subscriptions'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
  metadataSchema,
  NotFoundError,
} from '@db-core/tableUtils'
import { runs } from '@trigger.dev/sdk/v3'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { z } from 'zod'
import {
  authenticatedProcedureComprehensiveTransaction,
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import {
  assertCustomerNotArchived,
  selectCustomerByExternalIdAndOrganizationId,
  selectCustomerById,
} from '@/db/tableMethods/customerMethods'
import {
  selectPaymentMethodById,
  selectPaymentMethods,
} from '@/db/tableMethods/paymentMethodMethods'
import {
  selectPriceById,
  selectPriceBySlugAndCustomerId,
  selectPriceProductAndOrganizationByPriceWhere,
} from '@/db/tableMethods/priceMethods'
import { selectCurrentlyActiveSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  assertSubscriptionNotTerminal,
  isSubscriptionCurrent,
  selectDistinctSubscriptionProductNames,
  selectSubscriptionById,
  selectSubscriptionCountsByStatus,
  selectSubscriptionsPaginated,
  selectSubscriptionsTableRowData,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import type { DbTransaction } from '@/db/types'
import {
  adjustSubscription,
  calculateAdjustmentPreview,
} from '@/subscriptions/adjustSubscription'
import {
  createBillingRun,
  executeBillingRun,
} from '@/subscriptions/billingRunHelpers'
import {
  cancelSubscriptionProcedureTransaction,
  uncancelSubscriptionProcedureTransaction,
} from '@/subscriptions/cancelSubscription'
import { createSubscriptionWorkflow } from '@/subscriptions/createSubscription/workflow'
import { cancelScheduledAdjustmentProcedureTransaction } from '@/subscriptions/scheduledAdjustmentHelpers'
import {
  adjustSubscriptionInputSchema,
  cancelScheduledAdjustmentInputSchema,
  cancelScheduledAdjustmentOutputSchema,
  previewAdjustSubscriptionOutputSchema,
  scheduleSubscriptionCancellationSchema,
  uncancelSubscriptionSchema,
} from '@/subscriptions/schemas'
import { SubscriptionAdjustmentTiming } from '@/types'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'
import { unwrapOrThrow } from '@/utils/resultHelpers'
import { addFeatureToSubscription } from '../mutations/addFeatureToSubscription'
import { protectedProcedure, router } from '../trpc'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'subscription',
  tags: ['Subscriptions'],
})

export const subscriptionsRouteConfigs = [
  ...routeConfigs,
  trpcToRest('subscriptions.adjust', {
    routeParams: ['id'],
  }),
  trpcToRest('subscriptions.previewAdjust', {
    routeParams: ['id'],
    routeSuffix: 'preview-adjust',
  }),
  trpcToRest('subscriptions.cancel', {
    routeParams: ['id'],
  }),
  trpcToRest('subscriptions.uncancel', {
    routeParams: ['id'],
  }),
  trpcToRest('subscriptions.cancelScheduledAdjustment', {
    routeParams: ['id'],
  }),
  trpcToRest('subscriptions.addFeatureToSubscription', {
    routeParams: ['id'],
    routeSuffix: 'add-feature',
  }),
]

const adjustSubscriptionOutputSchema = z
  .object({
    subscription: subscriptionClientSelectSchema,
    subscriptionItems: subscriptionItemClientSelectSchema.array(),
    resolvedTiming: z
      .enum([
        SubscriptionAdjustmentTiming.Immediately,
        SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
      ])
      .describe(
        "The actual timing applied. When 'auto' timing is requested, this indicates whether the adjustment was applied immediately (for upgrades) or at the end of the billing period (for downgrades)."
      ),
    isUpgrade: z
      .boolean()
      .describe(
        'Whether this adjustment is an upgrade (true) or downgrade/lateral move (false). An upgrade means the new plan total is greater than the old plan total.'
      ),
  })
  .meta({ id: 'AdjustSubscriptionOutput' })

/**
 * Validates and resolves price information for subscription creation.
 * Handles resolution from either priceId or priceSlug, validates that the price
 * is not a usage price (which cannot be used for subscriptions), and ensures
 * the price is not a single payment price.
 *
 * @returns The validated price, product, and organization
 * @throws TRPCError with appropriate codes for validation failures
 */
export const validateAndResolvePriceForSubscription = async (params: {
  priceId?: string
  priceSlug?: string
  customerId: string
  transaction: DbTransaction
}): Promise<{
  price: Price.ProductPrice
  product: Product.Record
  organization: Organization.Record
}> => {
  const { priceId, priceSlug, customerId, transaction } = params

  // Resolve price ID from either priceId or priceSlug
  let resolvedPriceId: string
  if (priceId) {
    // Early validation: fetch price and reject usage prices before the heavier query
    const priceResult = await selectPriceById(priceId, transaction)
    if (Result.isError(priceResult)) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Price with id "${priceId}" not found`,
      })
    }
    const price = priceResult.unwrap()
    if (!Price.hasProductId(price)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Price "${priceId}" is a usage price and cannot be used to create a subscription directly. Use a subscription price instead.`,
      })
    }
    resolvedPriceId = priceId
  } else if (priceSlug) {
    const price = await selectPriceBySlugAndCustomerId(
      {
        slug: priceSlug,
        customerId,
      },
      transaction
    )
    if (!price) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Price with slug "${priceSlug}" not found for this customer's pricing model`,
      })
    }
    // Early validation: reject usage prices before fetching related data
    if (!Price.clientHasProductId(price)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Price "${priceSlug}" is a usage price and cannot be used to create a subscription directly. Use a subscription price instead.`,
      })
    }
    resolvedPriceId = price.id
  } else {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Either priceId or priceSlug must be provided',
    })
  }

  const priceResult =
    await selectPriceProductAndOrganizationByPriceWhere(
      {
        id: resolvedPriceId,
      },
      transaction
    )
  if (priceResult.length === 0) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Price with id "${resolvedPriceId}" not found`,
    })
  }
  const { price, product, organization } = priceResult[0]
  // Product is required for creating subscriptions - usage prices (with null product) are not supported
  // Use type guard for type-safe product access
  if (!Price.hasProductId(price) || !product) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Price ${resolvedPriceId} is a usage price and cannot be used to create a subscription directly. Use a subscription price instead.`,
    })
  }
  if (price.type === PriceType.SinglePayment) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Price ${resolvedPriceId} is a single payment price and cannot be used to create a subscription.`,
    })
  }

  return { price, product, organization }
}

/**
 * Validates and resolves customer information for subscription creation.
 * Handles resolution from either customerId or customerExternalId.
 *
 * @returns The validated customer record
 * @throws TRPCError with appropriate codes for validation failures
 */
export const validateAndResolveCustomerForSubscription =
  async (params: {
    customerId?: string
    customerExternalId?: string
    organizationId: string
    transaction: DbTransaction
  }): Promise<Customer.Record> => {
    const {
      customerId,
      customerExternalId,
      organizationId,
      transaction,
    } = params

    if (customerId) {
      const result = await selectCustomerById(customerId, transaction)
      if (Result.isError(result)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Customer with id "${customerId}" not found`,
        })
      }
      return result.unwrap()
    } else if (customerExternalId) {
      const customer =
        await selectCustomerByExternalIdAndOrganizationId(
          {
            externalId: customerExternalId,
            organizationId,
          },
          transaction
        )
      if (!customer) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Customer with externalId ${customerExternalId} not found`,
        })
      }
      return customer
    } else {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Either customerId or customerExternalId must be provided',
      })
    }
  }

const BILLING_RUN_TIMEOUT_MS = 60_000 // 60 seconds max wait for billing run

type PreviewAdjustSubscriptionOutput = z.infer<
  typeof previewAdjustSubscriptionOutputSchema
>

const previewAdjustSubscriptionProcedure = protectedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/subscriptions/{id}/preview-adjust',
      summary: 'Preview Subscription Adjustment',
      description:
        'Returns a preview of what a subscription adjustment would look like, including proration amount, ' +
        'payment method, and whether the adjustment can be made. This endpoint does not make any changes ' +
        'to the subscription. Use this to show users what will happen before they commit to an adjustment.',
      tags: ['Subscriptions'],
      protect: true,
    },
  })
  .input(adjustSubscriptionInputSchema)
  .output(previewAdjustSubscriptionOutputSchema)
  .mutation(async ({ input, ctx }) => {
    if (!ctx.organization) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization not found',
      })
    }

    return unwrapOrThrow(
      await authenticatedTransaction(
        async ({
          transaction,
        }): Promise<
          Result<PreviewAdjustSubscriptionOutput, Error>
        > => {
          const previewResult = await calculateAdjustmentPreview(
            input,
            transaction
          )

          if (!previewResult.canAdjust) {
            // Return the failure result directly
            return Result.ok({
              canAdjust: false,
              previewGeneratedAt: previewResult.previewGeneratedAt,
              reason: previewResult.reason,
            })
          }

          // Fetch payment method details if available
          let paymentMethodDetails:
            | {
                id: string
                type: string
                last4?: string
                brand?: string
              }
            | undefined

          if (previewResult.paymentMethodId) {
            const paymentMethodResult = await selectPaymentMethodById(
              previewResult.paymentMethodId,
              transaction
            )
            if (Result.isOk(paymentMethodResult)) {
              const pm = paymentMethodResult.value
              // Extract last4 and brand from paymentMethodData if available (for card payments)
              const pmData = pm.paymentMethodData as Record<
                string,
                unknown
              >
              paymentMethodDetails = {
                id: pm.id,
                type: pm.type,
                last4:
                  typeof pmData?.last4 === 'string'
                    ? pmData.last4
                    : undefined,
                brand:
                  typeof pmData?.brand === 'string'
                    ? pmData.brand
                    : undefined,
              }
            }
          }

          // Transform subscription items to preview format
          const currentSubscriptionItems =
            previewResult.currentSubscriptionItems.map((item) => ({
              name: item.name ?? '',
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              priceId: item.priceId ?? '',
            }))

          const newSubscriptionItems =
            previewResult.resolvedNewSubscriptionItems.map(
              (item) => ({
                name: item.name ?? '',
                unitPrice: item.unitPrice,
                quantity: item.quantity,
                priceId: item.priceId ?? '',
              })
            )

          return Result.ok({
            canAdjust: true,
            previewGeneratedAt: previewResult.previewGeneratedAt,
            prorationAmount: previewResult.prorationAmount,
            currentPlanTotal: previewResult.currentPlanTotal,
            newPlanTotal: previewResult.newPlanTotal,
            resolvedTiming: previewResult.resolvedTiming,
            effectiveDate: previewResult.effectiveDate,
            isUpgrade: previewResult.isUpgrade,
            percentThroughBillingPeriod:
              previewResult.percentThroughBillingPeriod,
            billingPeriodEnd: previewResult.billingPeriodEnd,
            paymentMethod: paymentMethodDetails,
            currentSubscriptionItems,
            newSubscriptionItems,
          })
        },
        { apiKey: ctx.apiKey }
      )
    )
  })

const adjustSubscriptionProcedure = protectedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/subscriptions/{id}/adjust',
      summary: 'Adjust Subscription',
      description:
        "Adjust an active subscription by changing its plan or quantity. Supports immediate adjustments with proration, end-of-billing-period adjustments for downgrades, and auto timing that automatically chooses based on whether it's an upgrade or downgrade. Also supports priceSlug for referencing prices by slug instead of id. For immediate adjustments with proration, this endpoint waits for the billing run to complete before returning, ensuring the subscription is fully updated.\n\n**Constraints:**\n- The subscription cannot be on a free plan (unitPrice must be > 0 for at least one item)\n- The subscription cannot have the `doNotCharge` flag set to true\n- The subscription cannot have a pending scheduled adjustment (scheduledAdjustmentAt must be null)\n- The subscription cannot have a pending cancellation (status cannot be `cancellation_scheduled`)",
      tags: ['Subscriptions'],
      protect: true,
    },
  })
  .input(adjustSubscriptionInputSchema)
  .output(adjustSubscriptionOutputSchema)
  .mutation(async ({ input, ctx }) => {
    if (!ctx.organization) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization not found',
      })
    }

    // Step 1: Perform the adjustment in a transaction
    // This triggers the billing run but doesn't wait for it
    // Cache invalidations are handled automatically by the comprehensive transaction
    // Domain errors are automatically converted to TRPCErrors by domainErrorMiddleware
    const adjustmentResult = unwrapOrThrow(
      await authenticatedTransaction(
        async (transactionCtx) => {
          const result = await adjustSubscription(
            input,
            ctx.organization!,
            transactionCtx
          )
          // Unwrap the inner Result - errors will propagate through the transaction wrapper
          return Result.ok(result.unwrap())
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    )

    const {
      subscription,
      subscriptionItems: initialSubscriptionItems,
      resolvedTiming,
      isUpgrade,
      pendingBillingRunId,
    } = adjustmentResult

    // Step 2: If there's a pending billing run, wait for it to complete
    // This happens outside the transaction since it can take several seconds
    if (pendingBillingRunId) {
      const startTime = Date.now()

      for await (const run of runs.subscribeToRun(
        pendingBillingRunId
      )) {
        // Check for timeout
        if (Date.now() - startTime > BILLING_RUN_TIMEOUT_MS) {
          throw new TRPCError({
            code: 'TIMEOUT',
            message:
              'Billing run timed out. The subscription adjustment may still complete in the background.',
          })
        }

        // Check if run completed (successfully or with error)
        if (run.status === 'COMPLETED') {
          break
        }

        // Handle terminal failure states
        if (
          run.status === 'FAILED' ||
          run.status === 'CANCELED' ||
          run.status === 'CRASHED' ||
          run.status === 'SYSTEM_FAILURE' ||
          run.status === 'EXPIRED' ||
          run.status === 'TIMED_OUT'
        ) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Billing run failed with status: ${run.status}`,
          })
        }
      }

      // Step 3: After billing run completes, fetch fresh subscription data
      // The subscription items are now updated by processOutcomeForBillingRun
      // Pass apiKey to maintain authentication context after async wait
      const freshData = unwrapOrThrow(
        await authenticatedTransaction(
          async ({ transaction }) => {
            const freshSubscription = (
              await selectSubscriptionById(
                subscription.id,
                transaction
              )
            ).unwrap()
            const freshSubscriptionItems =
              await selectCurrentlyActiveSubscriptionItems(
                { subscriptionId: subscription.id },
                new Date(),
                transaction
              )
            return Result.ok({
              freshSubscription,
              freshSubscriptionItems,
            })
          },
          { apiKey: ctx.apiKey }
        )
      )

      return {
        subscription: {
          ...freshData.freshSubscription,
          current: isSubscriptionCurrent(
            freshData.freshSubscription.status,
            freshData.freshSubscription.cancellationReason
          ),
        },
        subscriptionItems: freshData.freshSubscriptionItems,
        resolvedTiming,
        isUpgrade,
      }
    }

    // No billing run to wait for - return immediately
    return {
      subscription: {
        ...subscription,
        current: isSubscriptionCurrent(
          subscription.status,
          subscription.cancellationReason
        ),
      },
      subscriptionItems: initialSubscriptionItems,
      resolvedTiming,
      isUpgrade,
    }
  })

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

const uncancelSubscriptionProcedure = protectedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/subscriptions/{id}/uncancel',
      summary: 'Uncancel Subscription',
      description:
        'Reverses a scheduled subscription cancellation. The subscription must be in `cancellation_scheduled` status. This will restore the subscription to its previous status (typically `active` or `trialing`) and reschedule any billing runs that were aborted. For paid subscriptions, a valid payment method is required.',
      tags: ['Subscriptions'],
      protect: true,
    },
  })
  .input(uncancelSubscriptionSchema)
  .output(
    z.object({
      subscription: subscriptionClientSelectSchema,
    })
  )
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      uncancelSubscriptionProcedureTransaction
    )
  )

const cancelScheduledAdjustmentProcedure = protectedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/subscriptions/{id}/cancel-scheduled-adjustment',
      summary: 'Cancel Scheduled Adjustment',
      description:
        'Cancels a scheduled subscription adjustment. The subscription must have a pending scheduled adjustment (scheduledAdjustmentAt is not null). This will expire any subscription items that were scheduled to become active at the end of the billing period and clear the scheduledAdjustmentAt field.',
      tags: ['Subscriptions'],
      protect: true,
    },
  })
  .input(cancelScheduledAdjustmentInputSchema)
  .output(cancelScheduledAdjustmentOutputSchema)
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      cancelScheduledAdjustmentProcedureTransaction
    )
  )

const listSubscriptionsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(subscriptionsPaginatedSelectSchema)
  .output(subscriptionsPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return unwrapOrThrow(
      await authenticatedTransaction(
        async ({ transaction }) => {
          const result = await selectSubscriptionsPaginated(
            input,
            transaction
          )
          return Result.ok({
            ...result,
            data: result.data.map((subscription) => ({
              ...subscription,
              current: isSubscriptionCurrent(
                subscription.status,
                subscription.cancellationReason
              ),
            })),
          })
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    )
  })

const getSubscriptionProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ subscription: subscriptionClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    return (
      await authenticatedTransaction(
        async ({ transaction }) => {
          const subscription = (
            await selectSubscriptionById(input.id, transaction)
          ).unwrap()
          return Result.ok({
            subscription: {
              ...subscription,
              current: isSubscriptionCurrent(
                subscription.status,
                subscription.cancellationReason
              ),
            },
          })
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
  })

export const createSubscriptionInputSchema = z
  .object({
    customerId: z
      .string()
      .optional()
      .describe(
        'The internal ID of the customer. If not provided, customerExternalId is required.'
      ),
    customerExternalId: z
      .string()
      .optional()
      .describe(
        'The external ID of the customer. If not provided, customerId is required.'
      ),
    priceId: z.string().optional().describe(PRICE_ID_DESCRIPTION),
    priceSlug: z.string().optional().describe(PRICE_SLUG_DESCRIPTION),
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
      .enum(IntervalUnit)
      .optional()
      .describe(
        'The interval of the subscription. If not provided, defaults to the interval of the price provided by ' +
          '`priceId` or `priceSlug`.'
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
          `to the name of the product associated with the price provided by 'priceId' or 'priceSlug'.`
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
    doNotCharge: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        `If true, the subscription item's unitPrice will be set to 0, resulting in no charges. The original price.unitPrice value in the price record remains unchanged.`
      ),
    // FIXME: Consider exposing preserveBillingCycleAnchor to the API
  })
  .refine(
    (data) =>
      data.customerId
        ? !data.customerExternalId
        : !!data.customerExternalId,
    {
      message:
        'Either customerId or customerExternalId must be provided, but not both',
      path: ['customerId'],
    }
  )
  .refine(
    (data) => (data.priceId ? !data.priceSlug : !!data.priceSlug),
    {
      message:
        'Either priceId or priceSlug must be provided, but not both',
      path: ['priceId'],
    }
  )
  .refine(
    (data) => {
      // If doNotCharge is true, payment methods should not be provided
      if (data.doNotCharge) {
        return (
          !data.defaultPaymentMethodId && !data.backupPaymentMethodId
        )
      }
      return true
    },
    {
      message:
        'Payment methods cannot be provided when doNotCharge is true. Payment methods are not needed since no charges will be made.',
      path: ['doNotCharge'],
    }
  )

const createSubscriptionProcedure = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createSubscriptionInputSchema)
  .output(z.object({ subscription: subscriptionClientSelectSchema }))
  .mutation(
    authenticatedProcedureComprehensiveTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const {
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
          enqueueTriggerTask,
        } = transactionCtx
        if (!ctx.organization) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Organization not found',
          })
        }

        const customer =
          await validateAndResolveCustomerForSubscription({
            customerId: input.customerId,
            customerExternalId: input.customerExternalId,
            organizationId: ctx.organization.id,
            transaction,
          })

        // Guard: cannot create subscriptions for archived customers
        assertCustomerNotArchived(customer, 'create subscription')

        const { price, product, organization } =
          await validateAndResolvePriceForSubscription({
            priceId: input.priceId,
            priceSlug: input.priceSlug,
            customerId: customer.id,
            transaction,
          })

        const defaultPaymentMethod = input.defaultPaymentMethodId
          ? (
              await selectPaymentMethodById(
                input.defaultPaymentMethodId,
                transaction
              )
            ).unwrap()
          : undefined
        const backupPaymentMethod = input.backupPaymentMethodId
          ? (
              await selectPaymentMethodById(
                input.backupPaymentMethodId,
                transaction
              )
            ).unwrap()
          : undefined
        const startDate = input.startDate ?? new Date()
        const defaultTrialEnd = price.trialPeriodDays
          ? new Date(
              startDate.getTime() +
                price.trialPeriodDays * 24 * 60 * 60 * 1000
            )
          : undefined
        const trialEnd = input.trialEnd ?? defaultTrialEnd
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
            doNotCharge: input.doNotCharge,
            // FIXME: Uncomment if we decide to expose preserveBillingCycleAnchor in the API
            // preserveBillingCycleAnchor: input.preserveBillingCycleAnchor ?? false,
          },
          {
            transaction,
            cacheRecomputationContext,
            invalidateCache,
            emitEvent,
            enqueueLedgerCommand,
            enqueueTriggerTask,
          }
        )
        const outputValue = output.unwrap()
        const finalResult = {
          subscription: {
            ...outputValue.subscription,
            current: isSubscriptionCurrent(
              outputValue.subscription.status,
              outputValue.subscription.cancellationReason
            ),
          },
        }

        return Result.ok(finalResult)
      }
    )
  )

const getCountsByStatusProcedure = protectedProcedure
  .input(z.object({}))
  .output(
    z.array(
      z.object({
        status: z.enum(SubscriptionStatus),
        count: z.number(),
      })
    )
  )
  .query(async ({ ctx }) => {
    return (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await selectSubscriptionCountsByStatus(transaction)
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
  })

const getTableRows = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        status: z.enum(SubscriptionStatus).optional(),
        customerId: z.string().optional(),
        organizationId: z.string().optional(),
        productName: z.string().optional(),
        isFreePlan: z.boolean().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(
      subscriptionsTableRowDataSchema
    )
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectSubscriptionsTableRowData({
          input,
          transaction,
        })
      }
    )
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
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        const subscription = (
          await selectSubscriptionById(input.id, transaction)
        ).unwrap()

        // Guard: cannot update payment method on terminal subscriptions
        assertSubscriptionNotTerminal(subscription)

        // Verify the payment method exists and belongs to the same customer
        const paymentMethod = (
          await selectPaymentMethodById(
            input.paymentMethodId,
            transaction
          )
        ).unwrap()

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
    const result = unwrapOrThrow(
      await authenticatedTransaction(
        async ({ transaction }) => {
          const billingPeriod = (
            await selectBillingPeriodById(
              input.billingPeriodId,
              transaction
            )
          ).unwrap()
          if (
            billingPeriod.status === BillingPeriodStatus.Completed
          ) {
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
          const subscription = (
            await selectSubscriptionById(
              billingPeriod.subscriptionId,
              transaction
            )
          ).unwrap()

          if (subscription.doNotCharge) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'Cannot retry billing for doNotCharge subscriptions',
            })
          }

          const paymentMethod = subscription.defaultPaymentMethodId
            ? (
                await selectPaymentMethodById(
                  subscription.defaultPaymentMethodId,
                  transaction
                )
              ).unwrap()
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

          const billingRunResult = await createBillingRun(
            {
              billingPeriod,
              scheduledFor: new Date(),
              paymentMethod,
            },
            transaction
          )
          return billingRunResult
        },
        { apiKey: ctx.apiKey }
      )
    )
    const billingRunResult = await executeBillingRun(result.id)
    if (Result.isError(billingRunResult)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Failed to execute billing run: ${billingRunResult.error.message}`,
      })
    }
    return {
      message: 'Billing run executed',
    }
  })

/**
 * Retrieves all distinct product names from subscriptions within the authenticated organization.
 *
 * This procedure queries all subscriptions in the organization and returns a unique list
 * of product names associated with those subscriptions. The result is scoped to the
 * organization associated with the provided API key.
 *
 * @returns An array of unique product name strings. Returns an empty array if no
 *          subscriptions exist or no distinct product names are found.
 */
const listDistinctSubscriptionProductNamesProcedure =
  protectedProcedure
    .input(z.object({}).optional())
    .output(z.array(z.string()))
    .query(async ({ ctx }) => {
      return (
        await authenticatedTransaction(
          async ({ transaction, organizationId }) => {
            return Result.ok(
              await selectDistinctSubscriptionProductNames(
                organizationId,
                transaction
              )
            )
          },
          {
            apiKey: ctx.apiKey,
          }
        )
      ).unwrap()
    })

export const subscriptionsRouter = router({
  adjust: adjustSubscriptionProcedure,
  previewAdjust: previewAdjustSubscriptionProcedure,
  cancel: cancelSubscriptionProcedure,
  uncancel: uncancelSubscriptionProcedure,
  cancelScheduledAdjustment: cancelScheduledAdjustmentProcedure,
  list: listSubscriptionsProcedure,
  get: getSubscriptionProcedure,
  create: createSubscriptionProcedure,
  getCountsByStatus: getCountsByStatusProcedure,
  retryBillingRunProcedure,
  getTableRows,
  updatePaymentMethod: updatePaymentMethodProcedure,
  listDistinctSubscriptionProductNames:
    listDistinctSubscriptionProductNamesProcedure,
  addFeatureToSubscription,
})
