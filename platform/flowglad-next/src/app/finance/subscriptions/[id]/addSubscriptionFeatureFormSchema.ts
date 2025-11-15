import { z } from 'zod'

export const addSubscriptionFeatureFormSchema = z.object({
  subscriptionItemId: z.string().min(1, 'Select a subscription item'),
  featureId: z.string().min(1, 'Select a feature to grant'),
  grantCreditsImmediately: z.boolean().default(false),
})

export type AddSubscriptionFeatureFormValues = z.infer<
  typeof addSubscriptionFeatureFormSchema
>
