import {
  subscriptionItemsInsertSchema,
  subscriptionItemsSelectSchema,
  subscriptionItemClientSelectSchema,
  subscriptionItemClientInsertSchema,
  usageSubscriptionItemClientSelectSchema,
  staticSubscriptionItemClientSelectSchema,
} from '@/db/schema/subscriptionItems'
import {
  creditTrialSubscriptionClientSelectSchema,
  standardSubscriptionClientSelectSchema,
  subscriptionClientSelectSchema,
} from '@/db/schema/subscriptions'
import { subscribablePriceClientSelectSchema } from '@/db/schema/prices'
import {
  SubscriptionAdjustmentTiming,
  SubscriptionCancellationArrangement,
} from '@/types'
import { z } from 'zod'
import { subscriptionItemFeaturesClientSelectSchema } from '@/db/schema/subscriptionItemFeatures'
import { usageMeterBalanceClientSelectSchema } from '@/db/schema/usageMeters'

export const adjustSubscriptionImmediatelySchema = z.object({
  timing: z.literal(SubscriptionAdjustmentTiming.Immediately),
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
  z.discriminatedUnion('type', [
    usageSubscriptionItemClientSelectSchema.extend({
      price: subscribablePriceClientSelectSchema,
    }),
    staticSubscriptionItemClientSelectSchema.extend({
      price: subscribablePriceClientSelectSchema,
    }),
  ])

const richSubscriptionExperimentalSchema = z
  .object({
    featureItems: subscriptionItemFeaturesClientSelectSchema.array(),
    usageMeterBalances: z.array(usageMeterBalanceClientSelectSchema),
  })
  .optional()
  .describe('Experimental fields. May change without notice.')

const richCreditTrialSubscriptionClientSelectSchema =
  creditTrialSubscriptionClientSelectSchema.extend({
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
  z.discriminatedUnion('status', [
    richCreditTrialSubscriptionClientSelectSchema,
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
      endDate: z.date(),
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
