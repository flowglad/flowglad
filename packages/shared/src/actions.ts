import type { Flowglad } from '@flowglad/node'
import { type ZodType, z } from 'zod'
import { FlowgladActionKey, HTTPMethod } from './types/sdk'

export type FlowgladActionValidatorMap = {
  [K in FlowgladActionKey]: {
    method: HTTPMethod
    inputValidator: ZodType<unknown>
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

/**
 * Subscription adjustment timing options for the terse SDK API.
 * - 'immediately': Apply change now with proration
 * - 'at_end_of_period': Apply change at next billing period
 * - 'auto': Upgrades happen immediately, downgrades at end of period
 */
export const subscriptionAdjustmentTiming = {
  Immediately: 'immediately',
  AtEndOfCurrentBillingPeriod: 'at_end_of_period',
  Auto: 'auto',
} as const

export type SubscriptionAdjustmentTiming =
  (typeof subscriptionAdjustmentTiming)[keyof typeof subscriptionAdjustmentTiming]

/**
 * Options for the terse adjustSubscription SDK method.
 * The subscriptionId is optional - it auto-resolves if the customer has exactly 1 subscription.
 */
export const adjustSubscriptionOptionsSchema = z.object({
  subscriptionId: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  timing: z
    .enum([
      subscriptionAdjustmentTiming.Immediately,
      subscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
      subscriptionAdjustmentTiming.Auto,
    ])
    .optional(),
  prorate: z.boolean().optional(),
})

export type AdjustSubscriptionOptions = z.infer<
  typeof adjustSubscriptionOptionsSchema
>

/**
 * Schema for the terse adjustSubscription SDK method input.
 * The SDK method accepts (priceIdOrSlug, options?) where options.subscriptionId
 * is optional and auto-resolves if the customer has exactly 1 subscription.
 */
export const adjustSubscriptionSchema = z.object({
  priceIdOrSlug: z.string(),
  options: adjustSubscriptionOptionsSchema.optional(),
})

export type AdjustSubscriptionParams = z.infer<
  typeof adjustSubscriptionSchema
>

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
  usageMeterId: z.never().optional(), // Explicitly disallow
  usageMeterSlug: z.never().optional(), // Explicitly disallow
})

const usageEventWithPriceSlug = baseUsageEventFields.extend({
  priceSlug: z.string(),
  priceId: z.never().optional(), // Explicitly disallow
  usageMeterId: z.never().optional(), // Explicitly disallow
  usageMeterSlug: z.never().optional(), // Explicitly disallow
})

const usageEventWithUsageMeterId = baseUsageEventFields.extend({
  usageMeterId: z.string(),
  priceId: z.never().optional(), // Explicitly disallow
  priceSlug: z.never().optional(), // Explicitly disallow
  usageMeterSlug: z.never().optional(), // Explicitly disallow
})

const usageEventWithUsageMeterSlug = baseUsageEventFields.extend({
  usageMeterSlug: z.string(),
  priceId: z.never().optional(), // Explicitly disallow
  priceSlug: z.never().optional(), // Explicitly disallow
  usageMeterId: z.never().optional(), // Explicitly disallow
})

/**
 * Schema for creating a usage event. You must provide exactly one identifier:
 * - `priceId` or `priceSlug`: For price-based usage tracking
 * - `usageMeterId` or `usageMeterSlug`: For usage meter-based tracking
 */
export const createUsageEventSchema = z.union([
  usageEventWithPriceId,
  usageEventWithPriceSlug,
  usageEventWithUsageMeterId,
  usageEventWithUsageMeterSlug,
])

export type CreateUsageEventParams = z.infer<
  typeof createUsageEventSchema
>

/**
 * Schema for bulk creating usage events. Takes an array of usage events.
 */
export const bulkCreateUsageEventsSchema = z.object({
  usageEvents: z.array(createUsageEventSchema).min(1),
})

/**
 * Client-facing schema for creating a usage event.
 * This schema allows optional fields that the server will auto-resolve:
 * - `subscriptionId`: Auto-inferred from currentSubscription if not provided
 * - `amount`: Defaults to 1 if not provided
 * - `transactionId`: Auto-generated if not provided
 */
const clientBaseUsageEventFields = z.object({
  amount: z.number().optional(),
  subscriptionId: z.string().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  transactionId: z.string().optional(),
  usageDate: z.number().optional(),
})

const clientUsageEventWithPriceId = clientBaseUsageEventFields.extend(
  {
    priceId: z.string(),
    priceSlug: z.never().optional(),
    usageMeterId: z.never().optional(),
    usageMeterSlug: z.never().optional(),
  }
)

const clientUsageEventWithPriceSlug =
  clientBaseUsageEventFields.extend({
    priceSlug: z.string(),
    priceId: z.never().optional(),
    usageMeterId: z.never().optional(),
    usageMeterSlug: z.never().optional(),
  })

const clientUsageEventWithUsageMeterId =
  clientBaseUsageEventFields.extend({
    usageMeterId: z.string(),
    priceId: z.never().optional(),
    priceSlug: z.never().optional(),
    usageMeterSlug: z.never().optional(),
  })

const clientUsageEventWithUsageMeterSlug =
  clientBaseUsageEventFields.extend({
    usageMeterSlug: z.string(),
    priceId: z.never().optional(),
    priceSlug: z.never().optional(),
    usageMeterId: z.never().optional(),
  })

/**
 * Client-facing schema for creating a usage event. You must provide exactly one identifier:
 * - `priceId` or `priceSlug`: For price-based usage tracking
 * - `usageMeterId` or `usageMeterSlug`: For usage meter-based tracking
 *
 * Optional fields will be auto-resolved by the server:
 * - `subscriptionId`: Auto-inferred from currentSubscription
 * - `amount`: Defaults to 1
 * - `transactionId`: Auto-generated (nanoid)
 */
export const clientCreateUsageEventSchema = z.union([
  clientUsageEventWithPriceId,
  clientUsageEventWithPriceSlug,
  clientUsageEventWithUsageMeterId,
  clientUsageEventWithUsageMeterSlug,
])

export type ClientCreateUsageEventParams = z.infer<
  typeof clientCreateUsageEventSchema
>

export type BulkCreateUsageEventsParams = z.infer<
  typeof bulkCreateUsageEventsSchema
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
  [FlowgladActionKey.AdjustSubscription]: {
    method: HTTPMethod.POST,
    inputValidator: adjustSubscriptionSchema,
  },
  [FlowgladActionKey.CreateSubscription]: {
    method: HTTPMethod.POST,
    inputValidator: createSubscriptionSchema,
  },
  [FlowgladActionKey.UpdateCustomer]: {
    method: HTTPMethod.POST,
    inputValidator: updateCustomerSchema,
  },
  [FlowgladActionKey.CreateUsageEvent]: {
    method: HTTPMethod.POST,
    inputValidator: clientCreateUsageEventSchema,
  },
} as const satisfies FlowgladActionValidatorMap
