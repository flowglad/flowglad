import { z } from 'zod'
import { pricesClientSelectSchema } from '@/db/schema/prices'
import { subscriptionItemFeaturesClientSelectSchema } from '@/db/schema/subscriptionItemFeatures'
import {
  staticSubscriptionItemClientSelectSchema,
  subscriptionItemClientInsertSchema,
  subscriptionItemClientSelectSchema,
  subscriptionItemsInsertSchema,
  subscriptionItemsSelectSchema,
} from '@/db/schema/subscriptionItems'
import {
  nonRenewingSubscriptionClientSelectSchema,
  standardSubscriptionClientSelectSchema,
  subscriptionClientSelectSchema,
} from '@/db/schema/subscriptions'
import { usageMeterBalanceClientSelectSchema } from '@/db/schema/usageMeters'
import {
  SubscriptionAdjustmentTiming,
  SubscriptionCancellationArrangement,
} from '@/types'

export const adjustSubscriptionImmediatelySchema = z
  .object({
    timing: z
      .literal(SubscriptionAdjustmentTiming.Immediately)
      .describe('Apply the adjustment immediately.'),
    newSubscriptionItems: z.array(
      z.union([
        subscriptionItemClientInsertSchema,
        subscriptionItemClientSelectSchema,
      ])
    ),
    prorateCurrentBillingPeriod: z.boolean(),
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
      ])
    ),
  })
  .meta({ id: 'AdjustSubscriptionAtEndOfCurrentBillingPeriodInput' })

export const adjustSubscriptionInputSchema = z.object({
  adjustment: z.discriminatedUnion('timing', [
    adjustSubscriptionImmediatelySchema,
    adjustSubscriptionAtEndOfCurrentBillingPeriodSchema,
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
