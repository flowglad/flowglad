import {
  subscriptionItemsInsertSchema,
  subscriptionItemsSelectSchema,
  subscriptionItemClientSelectSchema,
} from '@/db/schema/subscriptionItems'
import { subscriptionClientSelectSchema } from '@/db/schema/subscriptions'
import { subscriptionPriceClientSelectSchema } from '@/db/schema/prices'
import { SubscriptionAdjustmentTiming } from '@/types'
import { z } from 'zod'

export const adjustSubscriptionImmediatelySchema = z.object({
  timing: z.literal(SubscriptionAdjustmentTiming.Immediately),
  newSubscriptionItems: z.array(
    z.union([
      subscriptionItemsInsertSchema,
      subscriptionItemsSelectSchema,
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
        subscriptionItemsInsertSchema,
        subscriptionItemsSelectSchema,
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
  subscriptionItemClientSelectSchema.extend({
    price: subscriptionPriceClientSelectSchema,
  })

export const richSubscriptionClientSelectSchema =
  subscriptionClientSelectSchema.extend({
    subscriptionItems: richSubscriptionItemClientSelectSchema.array(),
  })

export type RichSubscriptionItem = z.infer<
  typeof richSubscriptionItemClientSelectSchema
>

export type RichSubscription = z.infer<
  typeof richSubscriptionClientSelectSchema
>
