import type { Flowglad } from '@flowglad/node'
import { type ZodType, z } from 'zod'
import { FlowgladActionKey, HTTPMethod } from './types/sdk'

export type FlowgladActionValidatorMap = {
  [K in FlowgladActionKey]: {
    method: HTTPMethod
    inputValidator: ZodType<any, any, any>
  }
}

const createCoreCheckoutSessionSchema = z.object({
  successUrl: z.url(),
  cancelUrl: z.url(),
  outputMetadata: z.record(z.string(), z.any()).optional(),
  outputName: z.string().optional(),
})

const checkoutSessionWithPriceId =
  createCoreCheckoutSessionSchema.extend({
    priceId: z.string(),
    priceSlug: z.never().optional(), // Explicitly disallow
    quantity: z.number().optional().default(1),
  })

const checkoutSessionWithPriceSlug =
  createCoreCheckoutSessionSchema.extend({
    priceSlug: z.string(),
    priceId: z.never().optional(), // Explicitly disallow
    quantity: z.number().optional().default(1),
  })

export const createProductCheckoutSessionSchema = z.union([
  checkoutSessionWithPriceId,
  checkoutSessionWithPriceSlug,
])

export const createAddPaymentMethodCheckoutSessionSchema =
  createCoreCheckoutSessionSchema.extend({
    targetSubscriptionId: z.string().optional(),
  })

export const createActivateSubscriptionCheckoutSessionSchema =
  createCoreCheckoutSessionSchema.extend({
    targetSubscriptionId: z.string(),
  })

/**
 * Use z.input to get the type before any transformations (like default values) are applied by the schema.
 * This keeps fields like `quantity` optional in the input type, even if the schema applies defaults.
 */
export type CreateProductCheckoutSessionParams = z.input<
  typeof createProductCheckoutSessionSchema
>
export type CreateAddPaymentMethodCheckoutSessionParams = z.infer<
  typeof createAddPaymentMethodCheckoutSessionSchema
>
export type CreateActivateSubscriptionCheckoutSessionParams = z.infer<
  typeof createActivateSubscriptionCheckoutSessionSchema
>

export type SubscriptionCancellationArrangement =
  Flowglad.Subscriptions.SubscriptionCancelParams['cancellation']['timing']

const subscriptionCancellationTiming: Record<
  string,
  SubscriptionCancellationArrangement
> = {
  AtEndOfCurrentBillingPeriod: 'at_end_of_current_billing_period',
  Immediately: 'immediately',
}

const cancellationParametersSchema = z.discriminatedUnion('timing', [
  z.object({
    timing: z.literal(
      subscriptionCancellationTiming.AtEndOfCurrentBillingPeriod
    ),
  }),
  z.object({
    timing: z.literal(subscriptionCancellationTiming.Immediately),
  }),
])

export const cancelSubscriptionSchema = z.object({
  id: z.string(),
  cancellation: cancellationParametersSchema,
})

export const uncancelSubscriptionSchema = z.object({
  id: z.string(),
})

const baseUsageEventFields = z.object({
  amount: z.number(),
  subscriptionId: z.string(),
  properties: z.record(z.string(), z.unknown()).optional(),
  transactionId: z.string(),
  usageDate: z.number().optional(),
})

const usageEventWithPriceId = baseUsageEventFields.extend({
  priceId: z.string(),
  priceSlug: z.never().optional(), // Explicitly disallow
})

const usageEventWithPriceSlug = baseUsageEventFields.extend({
  priceSlug: z.string(),
  priceId: z.never().optional(), // Explicitly disallow
})

export const createUsageEventSchema = z.union([
  usageEventWithPriceId,
  usageEventWithPriceSlug,
])

export type CreateUsageEventParams = z.infer<
  typeof createUsageEventSchema
>

export type CancelSubscriptionParams = z.infer<
  typeof cancelSubscriptionSchema
>

export type UncancelSubscriptionParams = z.infer<
  typeof uncancelSubscriptionSchema
>

const createSubscriptionCoreSchema = z.object({
  customerId: z.string(),
  quantity: z.number().optional(),
  startDate: z.string().datetime().optional(),
  trialEnd: z
    .number()
    .optional()
    .describe(
      `Epoch time in milliseconds of when the trial ends. If not provided, defaults to startDate + the associated price's trialPeriodDays`
    ),
  metadata: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean()])
    )
    .optional(),
  name: z.string().optional(),
  backupPaymentMethodId: z.string().optional(),
  defaultPaymentMethodId: z.string().optional(),
  interval: z.enum(['day', 'week', 'month', 'year']).optional(),
  intervalCount: z.number().optional(),
  doNotCharge: z.boolean().optional().default(false),
})

const createSubscriptionWithPriceId =
  createSubscriptionCoreSchema.extend({
    priceId: z.string(),
    priceSlug: z.never().optional(), // Explicitly disallow
  })

const createSubscriptionWithPriceSlug =
  createSubscriptionCoreSchema.extend({
    priceSlug: z.string(),
    priceId: z.never().optional(), // Explicitly disallow
  })

export const createSubscriptionSchema = z.union([
  createSubscriptionWithPriceId,
  createSubscriptionWithPriceSlug,
])

/**
 * Use z.input to get the type before any transformations (like default values) are applied by the schema.
 * This keeps fields like `doNotCharge` optional in the input type, even if the schema applies defaults.
 */
export type CreateSubscriptionParams = z.input<
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

export const flowgladActionValidators = {
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
  [FlowgladActionKey.CreateAddPaymentMethodCheckoutSession]: {
    method: HTTPMethod.POST,
    inputValidator: createAddPaymentMethodCheckoutSessionSchema,
  },
  [FlowgladActionKey.CreateActivateSubscriptionCheckoutSession]: {
    method: HTTPMethod.POST,
    inputValidator: createActivateSubscriptionCheckoutSessionSchema,
  },
  [FlowgladActionKey.CreateCheckoutSession]: {
    method: HTTPMethod.POST,
    inputValidator: createProductCheckoutSessionSchema,
  },
  [FlowgladActionKey.CancelSubscription]: {
    method: HTTPMethod.POST,
    inputValidator: cancelSubscriptionSchema,
  },
  [FlowgladActionKey.UncancelSubscription]: {
    method: HTTPMethod.POST,
    inputValidator: uncancelSubscriptionSchema,
  },
  [FlowgladActionKey.CreateSubscription]: {
    method: HTTPMethod.POST,
    inputValidator: createSubscriptionSchema,
  },
  [FlowgladActionKey.UpdateCustomer]: {
    method: HTTPMethod.POST,
    inputValidator: updateCustomerSchema,
  },
} as const satisfies FlowgladActionValidatorMap
