import { z, ZodSchema } from 'zod'
import { FlowgladActionKey, HTTPMethod } from './types'
import { Flowglad } from '@flowglad/node'

export type FlowgladActionValidatorMap = Record<
  FlowgladActionKey,
  {
    method: HTTPMethod
    inputValidator: ZodSchema
  }
>

export const createCheckoutSessionSchema = z.object({
  priceId: z.string(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  outputMetadata: z.record(z.string(), z.any()).optional(),
  outputName: z.string().optional(),
  quantity: z.number().optional().nullish().default(1),
})

export type CreateCheckoutSessionParams = z.infer<
  typeof createCheckoutSessionSchema
>

export type SubscriptionCancellationArrangement =
  Flowglad.Subscriptions.SubscriptionCancelParams['cancellation']['timing']

const subscriptionCancellationTiming: Record<
  string,
  SubscriptionCancellationArrangement
> = {
  AtEndOfCurrentBillingPeriod: 'at_end_of_current_billing_period',
  AtFutureDate: 'at_future_date',
  Immediately: 'immediately',
}

const cancellationParametersSchema = z.discriminatedUnion('timing', [
  z.object({
    timing: z.literal(
      subscriptionCancellationTiming.AtEndOfCurrentBillingPeriod
    ),
  }),
  z.object({
    timing: z.literal(subscriptionCancellationTiming.AtFutureDate),
    endDate: z.date(),
  }),
  z.object({
    timing: z.literal(subscriptionCancellationTiming.Immediately),
  }),
])

export const cancelSubscriptionSchema = z.object({
  id: z.string(),
  cancellation: cancellationParametersSchema,
})

export const createUsageEventSchema = z.object({
  amount: z.number(),
  priceId: z.string(),
  subscriptionId: z.string(),
  usageMeterId: z.string(),
  properties: z.record(z.string(), z.unknown()).nullish(),
  transactionId: z.string(),
  usageDate: z.string().nullish(),
})

export type CreateUsageEventParams = z.infer<
  typeof createUsageEventSchema
>

export type CancelSubscriptionParams = z.infer<
  typeof cancelSubscriptionSchema
>

export const flowgladActionValidators: FlowgladActionValidatorMap = {
  [FlowgladActionKey.GetCustomerBilling]: {
    method: HTTPMethod.POST,
    inputValidator: z.object({
      externalId: z.string(),
    }),
  },
  [FlowgladActionKey.FindOrCreateCustomer]: {
    method: HTTPMethod.POST,
    inputValidator: z.object({
      externalId: z.string(),
    }),
  },
  [FlowgladActionKey.CreateCheckoutSession]: {
    method: HTTPMethod.POST,
    inputValidator: createCheckoutSessionSchema,
  },
  [FlowgladActionKey.CancelSubscription]: {
    method: HTTPMethod.POST,
    inputValidator: cancelSubscriptionSchema,
  },
}
