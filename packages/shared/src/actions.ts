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

const createCoreCheckoutSessionSchema = z.object({
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  outputMetadata: z.record(z.string(), z.any()).optional(),
  outputName: z.string().optional(),
})

export const createProductCheckoutSessionSchema =
  createCoreCheckoutSessionSchema.extend({
    type: z.literal('product'),
    priceId: z.string(),
    quantity: z.number().optional().default(1),
  })

export const createAddPaymentMethodCheckoutSessionSchema =
  createCoreCheckoutSessionSchema.extend({
    type: z.literal('add_payment_method'),
    targetSubscriptionId: z.string().optional(),
  })

export const createCheckoutSessionSchema = z.discriminatedUnion(
  'type',
  [
    createProductCheckoutSessionSchema,
    createAddPaymentMethodCheckoutSessionSchema,
  ]
)

export type CreateProductCheckoutSessionParams = z.infer<
  typeof createProductCheckoutSessionSchema
>
export type CreateAddPaymentMethodCheckoutSessionParams = z.infer<
  typeof createAddPaymentMethodCheckoutSessionSchema
>

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
  usageDate: z.number().optional(),
})

export type CreateUsageEventParams = z.infer<
  typeof createUsageEventSchema
>

export type CancelSubscriptionParams = z.infer<
  typeof cancelSubscriptionSchema
>

export const createSubscriptionSchema = z.object({
  customerId: z.string(),
  priceId: z.string(),
  quantity: z.number().optional(),
  startDate: z.string().datetime().optional(),
  trialEnd: z
    .number()
    .optional()
    .describe(
      `Epoch time in milliseconds of when the trial ends. If not provided, defaults to startDate + the associated price's trialPeriodDays`
    ),
  metadata: z.record(z.string(), z.unknown()).optional(),
  name: z.string().optional(),
  backupPaymentMethodId: z.string().optional(),
  defaultPaymentMethodId: z.string().optional(),
  interval: z.enum(['day', 'week', 'month', 'year']).optional(),
  intervalCount: z.number().optional(),
})

export type CreateSubscriptionParams = z.infer<
  typeof createSubscriptionSchema
>

export const billingAddressSchema = z.object({
  name: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  address: z.object({
    name: z.string().optional(),
    line1: z.string().nullable(),
    line2: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    postal_code: z.string().nullable(),
    country: z.string(),
  }),
  phone: z.string().optional(),
})

export const updateCustomerInputSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  billingAddress: billingAddressSchema.optional(),
})

export const updateCustomerSchema = z.object({
  customer: updateCustomerInputSchema,
  externalId: z.string(),
})

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
  [FlowgladActionKey.CreateSubscription]: {
    method: HTTPMethod.POST,
    inputValidator: createSubscriptionSchema,
  },
  [FlowgladActionKey.UpdateCustomer]: {
    method: HTTPMethod.POST,
    inputValidator: updateCustomerSchema,
  },
}
