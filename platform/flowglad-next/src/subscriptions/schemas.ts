import {
  subscriptionItemsInsertSchema,
  subscriptionItemsSelectSchema,
  subscriptionItemClientSelectSchema,
  subscriptionItemClientInsertSchema,
  staticSubscriptionItemClientSelectSchema,
} from '@/db/schema/subscriptionItems'
import {
  nonRenewingSubscriptionClientSelectSchema,
  standardSubscriptionClientSelectSchema,
  subscriptionClientSelectSchema,
} from '@/db/schema/subscriptions'
import { pricesClientSelectSchema } from '@/db/schema/prices'
import {
  SubscriptionAdjustmentTiming,
  SubscriptionCancellationArrangement,
} from '@/types'
import { z } from 'zod'
import { subscriptionItemFeaturesClientSelectSchema } from '@/db/schema/subscriptionItemFeatures'
import { usageMeterBalanceClientSelectSchema } from '@/db/schema/usageMeters'
import { zodEpochMs } from '@/db/timestampMs'

export const adjustSubscriptionImmediatelySchema = z.object({
  timing: z
    .literal(SubscriptionAdjustmentTiming.Immediately)
    .describe(
      'Note: Immediate adjustments are in private preview. Please let us know you use this feature: https://github.com/flowglad/flowglad/issues/616.'
    ),
  newSubscriptionItems: z.array(
    z.union([
      subscriptionItemClientInsertSchema,
      subscriptionItemClientSelectSchema,
    ])
  ),
  prorateCurrentBillingPeriod: z.boolean(),
})

export const adjustSubscriptionAtEndOfCurrentBillingPeriodSchema =
  z.object({
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
  nonRenewingSubscriptionClientSelectSchema.extend({
    subscriptionItems: richSubscriptionItemClientSelectSchema.array(),
    current: z.boolean(),
    experimental: richSubscriptionExperimentalSchema,
  })

const richStandardSubscriptionClientSelectSchema =
  standardSubscriptionClientSelectSchema.extend({
    subscriptionItems: richSubscriptionItemClientSelectSchema.array(),
    current: z.boolean(),
    experimental: richSubscriptionExperimentalSchema,
  })

export const richSubscriptionClientSelectSchema =
  z.discriminatedUnion('renews', [
    richNonRenewingSubscriptionClientSelectSchema,
    richStandardSubscriptionClientSelectSchema,
  ])

export type RichSubscriptionItem = z.infer<
  typeof richSubscriptionItemClientSelectSchema
>

export type RichSubscription = z.infer<
  typeof richSubscriptionClientSelectSchema
>

export const subscriptionCancellationParametersSchema =
  z.discriminatedUnion('timing', [
    z.object({
      timing: z.literal(
        SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod
      ),
    }),
    z.object({
      timing: z.literal(
        SubscriptionCancellationArrangement.AtFutureDate
      ),
      endDate: zodEpochMs,
    }),
    z.object({
      timing: z.literal(
        SubscriptionCancellationArrangement.Immediately
      ),
    }),
  ])

export const scheduleSubscriptionCancellationSchema = z.object({
  id: z.string(),
  cancellation: subscriptionCancellationParametersSchema,
})

export type ScheduleSubscriptionCancellationParams = z.infer<
  typeof scheduleSubscriptionCancellationSchema
>
