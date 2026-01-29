import {
  PRICE_ID_DESCRIPTION,
  PRICE_SLUG_DESCRIPTION,
  pricesClientSelectSchema,
} from '@db-core/schema/prices'
import { subscriptionItemFeaturesClientSelectSchema } from '@db-core/schema/subscriptionItemFeatures'
import {
  staticSubscriptionItemClientSelectSchema,
  subscriptionItemClientInsertSchema,
  subscriptionItemClientSelectSchema,
  subscriptionItemsInsertSchema,
  subscriptionItemsSelectSchema,
} from '@db-core/schema/subscriptionItems'
import {
  nonRenewingSubscriptionClientSelectSchema,
  standardSubscriptionClientSelectSchema,
  subscriptionClientSelectSchema,
} from '@db-core/schema/subscriptions'
import { usageMeterBalanceClientSelectSchema } from '@db-core/schema/usageMeters'
import { z } from 'zod'
import {
  SubscriptionAdjustmentTiming,
  SubscriptionCancellationArrangement,
} from '@/types'

/**
 * Terse subscription item schema with priceSlug support.
 * Used for quick subscription adjustments where you just want to specify a price and quantity.
 */
export const terseSubscriptionItemSchema = z
  .object({
    priceId: z.string().optional().describe(PRICE_ID_DESCRIPTION),
    priceSlug: z.string().optional().describe(PRICE_SLUG_DESCRIPTION),
    quantity: z
      .number()
      .int()
      .positive()
      .optional()
      .default(1)
      .describe('The quantity of units. Defaults to 1.'),
  })
  .describe(
    'A terse subscription item with just price reference and quantity. Exactly one of priceId or priceSlug must be provided (validated at parse-time by Zod).'
  )
  .refine(
    (data) => (data.priceId ? !data.priceSlug : !!data.priceSlug),
    {
      error:
        'Price identifier required: exactly one of priceId or priceSlug must be provided, not both or neither',
    }
  )
  .meta({ id: 'TerseSubscriptionItem' })

export type TerseSubscriptionItem = z.infer<
  typeof terseSubscriptionItemSchema
>

/**
 * Extended subscription item insert schema that supports priceSlug in addition to priceId.
 * When priceSlug is provided, the server will resolve it to a priceId using the subscription's pricing model.
 */
export const subscriptionItemWithPriceSlugSchema =
  subscriptionItemClientInsertSchema
    .extend({
      priceSlug: z
        .string()
        .optional()
        .describe(PRICE_SLUG_DESCRIPTION),
    })
    .refine(
      (data) => {
        // Either priceId or priceSlug must be provided, but not both
        const hasPriceId = !!data.priceId
        const hasPriceSlug = !!data.priceSlug
        return hasPriceId !== hasPriceSlug
      },
      {
        error:
          'Price identifier required: exactly one of priceId or priceSlug must be provided, not both or neither',
      }
    )
    .meta({ id: 'SubscriptionItemWithPriceSlugInput' })

export type SubscriptionItemWithPriceSlug = z.infer<
  typeof subscriptionItemWithPriceSlugSchema
>

/**
 * Union type for subscription items that can be either:
 * - Full subscription item insert (with priceId)
 * - Full subscription item select (existing item)
 * - Full subscription item insert with priceSlug
 * - Terse item (just priceId/priceSlug and quantity)
 */
export const flexibleSubscriptionItemSchema = z.union([
  subscriptionItemClientInsertSchema,
  subscriptionItemClientSelectSchema,
  subscriptionItemWithPriceSlugSchema,
  terseSubscriptionItemSchema,
])

export type FlexibleSubscriptionItem = z.infer<
  typeof flexibleSubscriptionItemSchema
>

export const adjustSubscriptionImmediatelySchema = z
  .object({
    timing: z
      .literal(SubscriptionAdjustmentTiming.Immediately)
      .describe('Apply the adjustment immediately.'),
    newSubscriptionItems: z.array(
      z.union([
        subscriptionItemClientInsertSchema,
        subscriptionItemClientSelectSchema,
        subscriptionItemWithPriceSlugSchema,
        terseSubscriptionItemSchema,
      ])
    ),
    prorateCurrentBillingPeriod: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Whether to prorate the current billing period. Defaults to true for immediate adjustments.'
      ),
  })
  .meta({ id: 'AdjustSubscriptionImmediatelyInput' })

export const adjustSubscriptionAtEndOfCurrentBillingPeriodSchema = z
  .object({
    timing: z.literal(
      SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
    ),
    newSubscriptionItems: z.array(
      z.union([
        subscriptionItemClientInsertSchema,
        subscriptionItemClientSelectSchema,
        subscriptionItemWithPriceSlugSchema,
        terseSubscriptionItemSchema,
      ])
    ),
  })
  .meta({ id: 'AdjustSubscriptionAtEndOfCurrentBillingPeriodInput' })

/**
 * Auto timing adjustment schema.
 * When timing is 'auto', the server automatically determines the best timing based on whether
 * the adjustment is an upgrade or downgrade:
 * - Upgrades (net charge > 0): Applied immediately with proration
 * - Downgrades (net charge < 0): Applied at the end of the current billing period
 * - Same price: Applied immediately (no financial impact)
 */
export const adjustSubscriptionAutoTimingSchema = z
  .object({
    timing: z
      .literal(SubscriptionAdjustmentTiming.Auto)
      .describe(
        'Automatically determine timing: upgrades happen immediately, downgrades at end of period.'
      ),
    newSubscriptionItems: z.array(
      z.union([
        subscriptionItemClientInsertSchema,
        subscriptionItemClientSelectSchema,
        subscriptionItemWithPriceSlugSchema,
        terseSubscriptionItemSchema,
      ])
    ),
    prorateCurrentBillingPeriod: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Whether to prorate if the adjustment is applied immediately. Defaults to true.'
      ),
  })
  .meta({ id: 'AdjustSubscriptionAutoTimingInput' })

export const adjustSubscriptionInputSchema = z.object({
  adjustment: z.discriminatedUnion('timing', [
    adjustSubscriptionImmediatelySchema,
    adjustSubscriptionAtEndOfCurrentBillingPeriodSchema,
    adjustSubscriptionAutoTimingSchema,
  ]),
  id: z.string(),
})

export type AdjustSubscriptionParams = z.infer<
  typeof adjustSubscriptionInputSchema
>

export const richSubscriptionItemClientSelectSchema =
  staticSubscriptionItemClientSelectSchema.extend({
    price: pricesClientSelectSchema,
  })

const richSubscriptionExperimentalSchema = z
  .object({
    featureItems: subscriptionItemFeaturesClientSelectSchema.array(),
    usageMeterBalances: z.array(usageMeterBalanceClientSelectSchema),
  })
  .optional()
  .describe('Experimental fields. May change without notice.')

const richNonRenewingSubscriptionClientSelectSchema =
  nonRenewingSubscriptionClientSelectSchema
    .extend({
      subscriptionItems:
        richSubscriptionItemClientSelectSchema.array(),
      current: z.boolean(),
      experimental: richSubscriptionExperimentalSchema,
    })
    .meta({ id: 'NonRenewingSubscriptionDetails' })

const richStandardSubscriptionClientSelectSchema =
  standardSubscriptionClientSelectSchema
    .extend({
      subscriptionItems:
        richSubscriptionItemClientSelectSchema.array(),
      current: z.boolean(),
      experimental: richSubscriptionExperimentalSchema,
    })
    .meta({ id: 'StandardSubscriptionDetails' })

export const richSubscriptionClientSelectSchema = z
  .discriminatedUnion('renews', [
    richNonRenewingSubscriptionClientSelectSchema,
    richStandardSubscriptionClientSelectSchema,
  ])
  .meta({ id: 'SubscriptionDetails' })

export type RichSubscriptionItem = z.infer<
  typeof richSubscriptionItemClientSelectSchema
>

export type RichSubscription = z.infer<
  typeof richSubscriptionClientSelectSchema
>

export const subscriptionCancellationParametersSchema =
  z.discriminatedUnion('timing', [
    z
      .object({
        timing: z.literal(
          SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod
        ),
      })
      .meta({ id: 'CancelSubscriptionAtEndOfBillingPeriodInput' }),
    z
      .object({
        timing: z.literal(
          SubscriptionCancellationArrangement.Immediately
        ),
      })
      .meta({ id: 'CancelSubscriptionImmediatelyInput' }),
  ])

export const scheduleSubscriptionCancellationSchema = z.object({
  id: z.string(),
  cancellation: subscriptionCancellationParametersSchema,
})

export type ScheduleSubscriptionCancellationParams = z.infer<
  typeof scheduleSubscriptionCancellationSchema
>

export const uncancelSubscriptionSchema = z
  .object({
    id: z.string(),
  })
  .meta({ id: 'UncancelSubscriptionInput' })

export type UncancelSubscriptionParams = z.infer<
  typeof uncancelSubscriptionSchema
>

export const cancelScheduledAdjustmentInputSchema = z
  .object({
    id: z.string().describe('The subscription ID'),
  })
  .meta({ id: 'CancelScheduledAdjustmentInput' })

export type CancelScheduledAdjustmentParams = z.infer<
  typeof cancelScheduledAdjustmentInputSchema
>

export const cancelScheduledAdjustmentOutputSchema = z
  .object({
    subscription: subscriptionClientSelectSchema,
    canceledItemCount: z
      .number()
      .int()
      .describe(
        'The number of scheduled subscription items that were canceled'
      ),
  })
  .meta({ id: 'CancelScheduledAdjustmentOutput' })

export type CancelScheduledAdjustmentOutput = z.infer<
  typeof cancelScheduledAdjustmentOutputSchema
>

/**
 * Schema for the preview adjustment subscription item.
 * Contains the essential fields needed for displaying in the preview UI.
 */
export const previewSubscriptionItemSchema = z
  .object({
    name: z.string(),
    unitPrice: z.number(),
    quantity: z.number(),
    priceId: z.string(),
  })
  .meta({ id: 'PreviewSubscriptionItem' })

export type PreviewSubscriptionItem = z.infer<
  typeof previewSubscriptionItemSchema
>

/**
 * Schema for the payment method info in preview responses.
 */
export const previewPaymentMethodSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    last4: z.string().optional(),
    brand: z.string().optional(),
  })
  .meta({ id: 'PreviewPaymentMethod' })

export type PreviewPaymentMethod = z.infer<
  typeof previewPaymentMethodSchema
>

/**
 * Output schema for subscription adjustment preview.
 * Returns either a success result with all calculation details,
 * or a failure result with the reason the adjustment cannot be made.
 */
export const previewAdjustSubscriptionOutputSchema = z
  .object({
    canAdjust: z
      .boolean()
      .describe(
        'Whether the adjustment can be made. If false, the reason field will contain the explanation.'
      ),
    reason: z
      .string()
      .optional()
      .describe(
        'The reason the adjustment cannot be made, if canAdjust is false.'
      ),
    previewGeneratedAt: z
      .number()
      .int()
      .describe(
        'Epoch milliseconds when this preview was generated. Useful for staleness detection.'
      ),
    prorationAmount: z
      .number()
      .optional()
      .describe(
        'The proration amount that will be charged, if applicable.'
      ),
    currentPlanTotal: z
      .number()
      .optional()
      .describe(
        'The total price of the current plan (sum of unitPrice * quantity for all items).'
      ),
    newPlanTotal: z
      .number()
      .optional()
      .describe(
        'The total price of the new plan (sum of unitPrice * quantity for all items).'
      ),
    resolvedTiming: z
      .enum([
        SubscriptionAdjustmentTiming.Immediately,
        SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
      ])
      .optional()
      .describe(
        'The resolved timing for the adjustment. When auto timing is requested, this indicates whether it resolved to immediate or end-of-period.'
      ),
    effectiveDate: z
      .number()
      .int()
      .optional()
      .describe(
        'Epoch milliseconds when the adjustment will take effect.'
      ),
    isUpgrade: z
      .boolean()
      .optional()
      .describe(
        'Whether this adjustment is an upgrade (true) or downgrade/lateral move (false).'
      ),
    percentThroughBillingPeriod: z
      .number()
      .optional()
      .describe(
        'The percentage through the current billing period (0-1).'
      ),
    billingPeriodEnd: z
      .number()
      .int()
      .optional()
      .describe(
        'Epoch milliseconds when the current billing period ends.'
      ),
    paymentMethod: previewPaymentMethodSchema
      .optional()
      .describe(
        'The payment method that will be charged for immediate adjustments with proration.'
      ),
    currentSubscriptionItems: z
      .array(previewSubscriptionItemSchema)
      .optional()
      .describe('The current subscription items.'),
    newSubscriptionItems: z
      .array(previewSubscriptionItemSchema)
      .optional()
      .describe('The new subscription items that will be applied.'),
  })
  .meta({ id: 'PreviewAdjustSubscriptionOutput' })
