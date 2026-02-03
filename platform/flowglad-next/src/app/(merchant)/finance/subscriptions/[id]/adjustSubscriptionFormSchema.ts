import { z } from 'zod'
import { SubscriptionAdjustmentTiming } from '@/types'

/**
 * Form schema for adjusting a subscription.
 * This is the UI form schema - it gets transformed to the API input schema on submit.
 */
export const adjustSubscriptionFormSchema = z.object({
  priceId: z.string().min(1, 'Please select a plan'),
  quantity: z.number().int().positive().default(1),
  timing: z
    .enum([
      SubscriptionAdjustmentTiming.Immediately,
      SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
      SubscriptionAdjustmentTiming.Auto,
    ])
    .default(SubscriptionAdjustmentTiming.Auto),
  prorateCurrentBillingPeriod: z.boolean().default(true),
})

export type AdjustSubscriptionFormValues = z.infer<
  typeof adjustSubscriptionFormSchema
>
