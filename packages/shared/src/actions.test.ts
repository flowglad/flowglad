import { describe, expect, it } from 'vitest'
import {
  adjustSubscriptionParamsSchema,
  billingAddressSchema,
  bulkCreateUsageEventsSchema,
  cancelSubscriptionSchema,
  claimResourceSchema,
  createActivateSubscriptionCheckoutSessionSchema,
  createAddPaymentMethodCheckoutSessionSchema,
  createProductCheckoutSessionSchema,
  createSubscriptionSchema,
  createUsageEventSchema,
  flowgladActionValidators,
  getResourcesSchema,
  listResourceClaimsSchema,
  releaseResourceSchema,
  subscriptionAdjustmentTiming,
  subscriptionAdjustmentTimingSchema,
  terseSubscriptionItemSchema,
  updateCustomerInputSchema,
  updateCustomerSchema,
} from './actions'
import { FlowgladActionKey, HTTPMethod } from './types/sdk'

describe('createProductCheckoutSessionSchema', () => {
  const validBaseParams = {
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
  }

  it('accepts valid input with priceId', () => {
    const input = { ...validBaseParams, priceId: 'price_123' }
    const result = createProductCheckoutSessionSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.priceId).toBe('price_123')
      expect(result.data.quantity).toBe(1) // default value
    }
  })

  it('accepts valid input with priceSlug', () => {
    const input = { ...validBaseParams, priceSlug: 'my-price-slug' }
    const result = createProductCheckoutSessionSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.priceSlug).toBe('my-price-slug')
    }
  })

  it('accepts optional outputMetadata and outputName', () => {
    const input = {
      ...validBaseParams,
      priceId: 'price_123',
      outputMetadata: { key: 'value' },
      outputName: 'My Subscription',
    }
    const result = createProductCheckoutSessionSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts custom quantity', () => {
    const input = {
      ...validBaseParams,
      priceId: 'price_123',
      quantity: 5,
    }
    const result = createProductCheckoutSessionSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quantity).toBe(5)
    }
  })

  it('rejects input with both priceId and priceSlug', () => {
    const input = {
      ...validBaseParams,
      priceId: 'price_123',
      priceSlug: 'my-slug',
    }
    const result = createProductCheckoutSessionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with neither priceId nor priceSlug', () => {
    const result =
      createProductCheckoutSessionSchema.safeParse(validBaseParams)
    expect(result.success).toBe(false)
  })

  it('rejects invalid successUrl', () => {
    const input = {
      ...validBaseParams,
      successUrl: 'not-a-url',
      priceId: 'price_123',
    }
    const result = createProductCheckoutSessionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects invalid cancelUrl', () => {
    const input = {
      ...validBaseParams,
      cancelUrl: 'not-a-url',
      priceId: 'price_123',
    }
    const result = createProductCheckoutSessionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('createAddPaymentMethodCheckoutSessionSchema', () => {
  const validInput = {
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
  }

  it('accepts valid input without targetSubscriptionId', () => {
    const result =
      createAddPaymentMethodCheckoutSessionSchema.safeParse(
        validInput
      )
    expect(result.success).toBe(true)
  })

  it('accepts valid input with targetSubscriptionId', () => {
    const input = { ...validInput, targetSubscriptionId: 'sub_123' }
    const result =
      createAddPaymentMethodCheckoutSessionSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.targetSubscriptionId).toBe('sub_123')
    }
  })

  it('accepts optional outputMetadata and outputName', () => {
    const input = {
      ...validInput,
      outputMetadata: { campaign: 'test' },
      outputName: 'Payment Setup',
    }
    const result =
      createAddPaymentMethodCheckoutSessionSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects missing successUrl', () => {
    const input = { cancelUrl: 'https://example.com/cancel' }
    const result =
      createAddPaymentMethodCheckoutSessionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('createActivateSubscriptionCheckoutSessionSchema', () => {
  const validInput = {
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
    targetSubscriptionId: 'sub_123',
  }

  it('accepts valid input with required targetSubscriptionId', () => {
    const result =
      createActivateSubscriptionCheckoutSessionSchema.safeParse(
        validInput
      )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.targetSubscriptionId).toBe('sub_123')
    }
  })

  it('rejects missing targetSubscriptionId', () => {
    const input = {
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    }
    const result =
      createActivateSubscriptionCheckoutSessionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('cancelSubscriptionSchema', () => {
  it('accepts at_end_of_current_billing_period timing', () => {
    const input = {
      id: 'sub_123',
      cancellation: { timing: 'at_end_of_current_billing_period' },
    }
    const result = cancelSubscriptionSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts immediately timing', () => {
    const input = {
      id: 'sub_123',
      cancellation: { timing: 'immediately' },
    }
    const result = cancelSubscriptionSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects invalid timing value', () => {
    const input = {
      id: 'sub_123',
      cancellation: { timing: 'invalid_timing' },
    }
    const result = cancelSubscriptionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects missing id', () => {
    const input = {
      cancellation: { timing: 'immediately' },
    }
    const result = cancelSubscriptionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('terseSubscriptionItemSchema', () => {
  it('accepts valid input with priceSlug', () => {
    const result = terseSubscriptionItemSchema.safeParse({
      priceSlug: 'pro-monthly',
      quantity: 5,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.priceSlug).toBe('pro-monthly')
      expect(result.data.quantity).toBe(5)
    }
  })

  it('accepts valid input with priceId', () => {
    const result = terseSubscriptionItemSchema.safeParse({
      priceId: 'price_123',
      quantity: 3,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.priceId).toBe('price_123')
      expect(result.data.quantity).toBe(3)
    }
  })

  it('defaults quantity to 1 when not provided', () => {
    const result = terseSubscriptionItemSchema.safeParse({
      priceSlug: 'pro-monthly',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quantity).toBe(1)
    }
  })

  it('rejects non-positive quantity', () => {
    const result = terseSubscriptionItemSchema.safeParse({
      priceSlug: 'pro-monthly',
      quantity: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative quantity', () => {
    const result = terseSubscriptionItemSchema.safeParse({
      priceSlug: 'pro-monthly',
      quantity: -1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-integer quantity', () => {
    const result = terseSubscriptionItemSchema.safeParse({
      priceSlug: 'pro-monthly',
      quantity: 1.5,
    })
    expect(result.success).toBe(false)
  })

  it('rejects input with both priceId and priceSlug', () => {
    const result = terseSubscriptionItemSchema.safeParse({
      priceId: 'price_123',
      priceSlug: 'pro-monthly',
      quantity: 1,
    })
    expect(result.success).toBe(false)
  })
})

describe('adjustSubscriptionParamsSchema', () => {
  it('accepts minimal valid input with priceSlug', () => {
    const result = adjustSubscriptionParamsSchema.safeParse({
      priceSlug: 'pro-monthly',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.priceSlug).toBe('pro-monthly')
      expect(result.data.quantity).toBe(1) // default
      expect(result.data.timing).toBe('auto') // default
    }
  })

  it('accepts valid input with priceId', () => {
    const result = adjustSubscriptionParamsSchema.safeParse({
      priceId: 'price_123',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.priceId).toBe('price_123')
      expect(result.data.quantity).toBe(1) // default
    }
  })

  it('accepts priceSlug with quantity and options', () => {
    const result = adjustSubscriptionParamsSchema.safeParse({
      priceSlug: 'pro-monthly',
      quantity: 5,
      subscriptionId: 'sub_123',
      timing: subscriptionAdjustmentTiming.Immediately,
      prorate: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.priceSlug).toBe('pro-monthly')
      expect(result.data.quantity).toBe(5)
      expect(result.data.subscriptionId).toBe('sub_123')
      expect(result.data.timing).toBe('immediately')
      expect(result.data.prorate).toBe(true)
    }
  })

  it('accepts subscriptionItems array for multi-item adjustments', () => {
    const result = adjustSubscriptionParamsSchema.safeParse({
      subscriptionItems: [
        { priceSlug: 'base-plan', quantity: 1 },
        { priceSlug: 'addon-storage', quantity: 3 },
      ],
      timing: subscriptionAdjustmentTiming.Immediately,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.subscriptionItems).toHaveLength(2)
      expect(result.data.subscriptionItems?.[0].priceSlug).toBe(
        'base-plan'
      )
      expect(result.data.subscriptionItems?.[1].quantity).toBe(3)
    }
  })

  it('accepts subscriptionItems with priceId', () => {
    const result = adjustSubscriptionParamsSchema.safeParse({
      subscriptionItems: [{ priceId: 'price_123', quantity: 2 }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.subscriptionItems?.[0].priceId).toBe(
        'price_123'
      )
    }
  })

  it('rejects input with both priceSlug and priceId', () => {
    const result = adjustSubscriptionParamsSchema.safeParse({
      priceSlug: 'pro-monthly',
      priceId: 'price_123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects input with both priceSlug and subscriptionItems', () => {
    const result = adjustSubscriptionParamsSchema.safeParse({
      priceSlug: 'pro-monthly',
      subscriptionItems: [{ priceSlug: 'base-plan' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects input with both priceId and subscriptionItems', () => {
    const result = adjustSubscriptionParamsSchema.safeParse({
      priceId: 'price_123',
      subscriptionItems: [{ priceSlug: 'base-plan' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects input with none of priceSlug, priceId, or subscriptionItems', () => {
    const result = adjustSubscriptionParamsSchema.safeParse({
      subscriptionId: 'sub_123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty subscriptionItems array', () => {
    const result = adjustSubscriptionParamsSchema.safeParse({
      subscriptionItems: [],
    })
    expect(result.success).toBe(false)
  })

  it('accepts all timing values', () => {
    const timings = [
      subscriptionAdjustmentTiming.Immediately,
      subscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
      subscriptionAdjustmentTiming.Auto,
    ]
    for (const timing of timings) {
      const result = adjustSubscriptionParamsSchema.safeParse({
        priceSlug: 'pro-monthly',
        timing,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid timing value', () => {
    const result = adjustSubscriptionParamsSchema.safeParse({
      priceSlug: 'pro-monthly',
      timing: 'invalid_timing',
    })
    expect(result.success).toBe(false)
  })

  it('accepts prorate boolean', () => {
    const resultTrue = adjustSubscriptionParamsSchema.safeParse({
      priceSlug: 'pro-monthly',
      prorate: true,
    })
    expect(resultTrue.success).toBe(true)

    const resultFalse = adjustSubscriptionParamsSchema.safeParse({
      priceSlug: 'pro-monthly',
      prorate: false,
    })
    expect(resultFalse.success).toBe(true)
  })

  it('rejects non-positive quantity', () => {
    const result = adjustSubscriptionParamsSchema.safeParse({
      priceSlug: 'pro-monthly',
      quantity: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative quantity', () => {
    const result = adjustSubscriptionParamsSchema.safeParse({
      priceSlug: 'pro-monthly',
      quantity: -1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-integer quantity', () => {
    const result = adjustSubscriptionParamsSchema.safeParse({
      priceSlug: 'pro-monthly',
      quantity: 1.5,
    })
    expect(result.success).toBe(false)
  })
})

describe('createUsageEventSchema', () => {
  const validBaseParams = {
    amount: 100,
    subscriptionId: 'sub_123',
    transactionId: 'txn_456',
  }

  it('accepts valid input with priceId', () => {
    const input = { ...validBaseParams, priceId: 'price_123' }
    const result = createUsageEventSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts valid input with priceSlug', () => {
    const input = { ...validBaseParams, priceSlug: 'my-price-slug' }
    const result = createUsageEventSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts optional properties and usageDate', () => {
    const input = {
      ...validBaseParams,
      priceId: 'price_123',
      properties: { endpoint: '/api/data' },
      usageDate: Date.now(),
    }
    const result = createUsageEventSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts valid input with usageMeterId', () => {
    const input = { ...validBaseParams, usageMeterId: 'meter_123' }
    const result = createUsageEventSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts valid input with usageMeterSlug', () => {
    const input = {
      ...validBaseParams,
      usageMeterSlug: 'my-meter-slug',
    }
    const result = createUsageEventSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects input with both priceId and priceSlug', () => {
    const input = {
      ...validBaseParams,
      priceId: 'price_123',
      priceSlug: 'my-slug',
    }
    const result = createUsageEventSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with both usageMeterId and usageMeterSlug', () => {
    const input = {
      ...validBaseParams,
      usageMeterId: 'meter_123',
      usageMeterSlug: 'my-meter-slug',
    }
    const result = createUsageEventSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with priceId and usageMeterId', () => {
    const input = {
      ...validBaseParams,
      priceId: 'price_123',
      usageMeterId: 'meter_123',
    }
    const result = createUsageEventSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with priceId and usageMeterSlug', () => {
    const input = {
      ...validBaseParams,
      priceId: 'price_123',
      usageMeterSlug: 'my-meter-slug',
    }
    const result = createUsageEventSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with priceSlug and usageMeterId', () => {
    const input = {
      ...validBaseParams,
      priceSlug: 'my-price-slug',
      usageMeterId: 'meter_123',
    }
    const result = createUsageEventSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with priceSlug and usageMeterSlug', () => {
    const input = {
      ...validBaseParams,
      priceSlug: 'my-price-slug',
      usageMeterSlug: 'my-meter-slug',
    }
    const result = createUsageEventSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with neither priceId, priceSlug, usageMeterId, nor usageMeterSlug', () => {
    const result = createUsageEventSchema.safeParse(validBaseParams)
    expect(result.success).toBe(false)
  })

  it('rejects missing amount', () => {
    const input = {
      subscriptionId: 'sub_123',
      transactionId: 'txn_456',
      priceId: 'price_123',
    }
    const result = createUsageEventSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects missing subscriptionId', () => {
    const input = {
      amount: 100,
      transactionId: 'txn_456',
      priceId: 'price_123',
    }
    const result = createUsageEventSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects missing transactionId', () => {
    const input = {
      amount: 100,
      subscriptionId: 'sub_123',
      priceId: 'price_123',
    }
    const result = createUsageEventSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('bulkCreateUsageEventsSchema', () => {
  const validUsageEvent = {
    amount: 100,
    subscriptionId: 'sub_123',
    transactionId: 'txn_456',
    priceId: 'price_123',
  }

  it('accepts valid input with single usage event', () => {
    const input = { usageEvents: [validUsageEvent] }
    const result = bulkCreateUsageEventsSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.usageEvents).toHaveLength(1)
      expect(result.data.usageEvents[0]).toEqual(validUsageEvent)
    }
  })

  it('accepts valid input with multiple usage events', () => {
    const input = {
      usageEvents: [
        validUsageEvent,
        { ...validUsageEvent, transactionId: 'txn_789', amount: 200 },
        {
          amount: 100,
          subscriptionId: 'sub_123',
          transactionId: 'txn_101',
          priceSlug: 'my-price',
        },
      ],
    }
    const result = bulkCreateUsageEventsSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.usageEvents).toHaveLength(3)
    }
  })

  it('accepts valid input with usage events using different identifier types', () => {
    const baseEvent = {
      amount: 100,
      subscriptionId: 'sub_123',
      transactionId: 'txn_1',
    }
    const input = {
      usageEvents: [
        { ...baseEvent, priceId: 'price_123' },
        {
          ...baseEvent,
          transactionId: 'txn_2',
          priceSlug: 'my-price',
        },
        {
          ...baseEvent,
          transactionId: 'txn_3',
          usageMeterId: 'meter_123',
        },
        {
          ...baseEvent,
          transactionId: 'txn_4',
          usageMeterSlug: 'my-meter',
        },
      ],
    }
    const result = bulkCreateUsageEventsSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects empty array', () => {
    const input = { usageEvents: [] }
    const result = bulkCreateUsageEventsSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects array with invalid usage event', () => {
    const input = {
      usageEvents: [
        validUsageEvent,
        {
          amount: 100,
          subscriptionId: 'sub_123',
          // missing transactionId
          priceId: 'price_123',
        },
      ],
    }
    const result = bulkCreateUsageEventsSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects missing usageEvents field', () => {
    const result = bulkCreateUsageEventsSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects invalid usageEvents type', () => {
    const result = bulkCreateUsageEventsSchema.safeParse({
      usageEvents: 'not-an-array',
    })
    expect(result.success).toBe(false)
  })
})

describe('createSubscriptionSchema', () => {
  const validInput = {
    customerId: 'cust_123',
    priceId: 'price_456',
  }

  it('accepts minimal valid input', () => {
    const result = createSubscriptionSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('accepts all optional fields', () => {
    const input = {
      ...validInput,
      quantity: 2,
      startDate: '2025-01-01T00:00:00Z',
      trialEnd: Date.now() + 86_400_000, // 1 day from now
      metadata: { source: 'api' },
      name: 'Pro Subscription',
      backupPaymentMethodId: 'pm_backup',
      defaultPaymentMethodId: 'pm_default',
      interval: 'month' as const,
      intervalCount: 1,
    }
    const result = createSubscriptionSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts valid interval values', () => {
    const intervals = ['day', 'week', 'month', 'year'] as const
    for (const interval of intervals) {
      const input = { ...validInput, interval }
      const result = createSubscriptionSchema.safeParse(input)
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid interval value', () => {
    const input = { ...validInput, interval: 'invalid' }
    const result = createSubscriptionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects invalid startDate format', () => {
    const input = { ...validInput, startDate: 'not-a-datetime' }
    const result = createSubscriptionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects missing customerId', () => {
    const input = { priceId: 'price_456' }
    const result = createSubscriptionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('accepts valid input with priceSlug instead of priceId', () => {
    const input = {
      customerId: 'cust_123',
      priceSlug: 'my-price-slug',
    }
    const result = createSubscriptionSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.priceSlug).toBe('my-price-slug')
    }
  })

  it('rejects input with both priceId and priceSlug', () => {
    const input = {
      customerId: 'cust_123',
      priceId: 'price_456',
      priceSlug: 'my-price-slug',
    }
    const result = createSubscriptionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with neither priceId nor priceSlug', () => {
    const input = { customerId: 'cust_123' }
    const result = createSubscriptionSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('billingAddressSchema', () => {
  const validAddress = {
    address: {
      line1: '123 Main St',
      line2: null,
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94105',
      country: 'US',
    },
  }

  it('accepts valid billing address with all fields', () => {
    const input = {
      name: 'John Doe',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '+1234567890',
      ...validAddress,
    }
    const result = billingAddressSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts minimal address with only required fields', () => {
    const input = {
      address: {
        line1: null,
        line2: null,
        city: null,
        state: null,
        postal_code: null,
        country: 'US',
      },
    }
    const result = billingAddressSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts address with nested name field', () => {
    const input = {
      address: {
        name: 'Billing Address',
        line1: '123 Main St',
        line2: null,
        city: 'NYC',
        state: 'NY',
        postal_code: '10001',
        country: 'US',
      },
    }
    const result = billingAddressSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects invalid email format', () => {
    const input = {
      email: 'not-an-email',
      ...validAddress,
    }
    const result = billingAddressSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects missing country in address', () => {
    const input = {
      address: {
        line1: '123 Main St',
        line2: null,
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94105',
      },
    }
    const result = billingAddressSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects missing address object', () => {
    const input = {
      name: 'John Doe',
      email: 'john@example.com',
    }
    const result = billingAddressSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('updateCustomerInputSchema', () => {
  it('accepts valid input with id only', () => {
    const input = { id: 'cust_123' }
    const result = updateCustomerInputSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts all optional fields', () => {
    const input = {
      id: 'cust_123',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+1234567890',
      billingAddress: {
        address: {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94105',
          country: 'US',
        },
      },
    }
    const result = updateCustomerInputSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects missing id', () => {
    const input = { name: 'John Doe' }
    const result = updateCustomerInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects invalid email format', () => {
    const input = { id: 'cust_123', email: 'not-an-email' }
    const result = updateCustomerInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('updateCustomerSchema', () => {
  const validInput = {
    customer: { id: 'cust_123' },
    externalId: 'ext_456',
  }

  it('accepts valid input', () => {
    const result = updateCustomerSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('accepts customer with all fields', () => {
    const input = {
      customer: {
        id: 'cust_123',
        name: 'John Doe',
        email: 'john@example.com',
      },
      externalId: 'ext_456',
    }
    const result = updateCustomerSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects missing externalId', () => {
    const input = { customer: { id: 'cust_123' } }
    const result = updateCustomerSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects missing customer', () => {
    const input = { externalId: 'ext_456' }
    const result = updateCustomerSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('getResourcesSchema', () => {
  it('accepts empty input', () => {
    const result = getResourcesSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts optional subscriptionId', () => {
    const result = getResourcesSchema.safeParse({
      subscriptionId: 'sub_123',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.subscriptionId).toBe('sub_123')
    }
  })
})

describe('claimResourceSchema', () => {
  it('validates quantity mode with resourceSlug=seats and quantity=3, parsing successfully with externalId and externalIds undefined', () => {
    const input = { resourceSlug: 'seats', quantity: 3 }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quantity).toBe(3)
      expect(result.data.externalId).toBeUndefined()
      expect(result.data.externalIds).toBeUndefined()
    }
  })

  it('validates externalId mode with resourceSlug=seats and externalId=user_123, parsing successfully with quantity and externalIds undefined', () => {
    const input = { resourceSlug: 'seats', externalId: 'user_123' }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.externalId).toBe('user_123')
      expect(result.data.quantity).toBeUndefined()
      expect(result.data.externalIds).toBeUndefined()
    }
  })

  it('validates externalIds mode with resourceSlug=seats and externalIds=[user_1, user_2], parsing successfully', () => {
    const input = {
      resourceSlug: 'seats',
      externalIds: ['user_1', 'user_2'],
    }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.externalIds).toEqual(['user_1', 'user_2'])
    }
  })

  it('rejects input with only resourceSlug=seats, returning validation error about exactly one mode required', () => {
    const input = { resourceSlug: 'seats' }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      const errorMessage = result.error.issues
        .map((issue) => issue.message)
        .join(', ')
      expect(errorMessage).toContain('Exactly one of')
    }
  })

  it('rejects input with both quantity=3 and externalId=user_123, returning validation error', () => {
    const input = {
      resourceSlug: 'seats',
      quantity: 3,
      externalId: 'user_123',
    }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with both quantity and externalIds', () => {
    const input = {
      resourceSlug: 'seats',
      quantity: 3,
      externalIds: ['user_1', 'user_2'],
    }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with both externalId and externalIds', () => {
    const input = {
      resourceSlug: 'seats',
      externalId: 'user_1',
      externalIds: ['user_2', 'user_3'],
    }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with all three modes provided', () => {
    const input = {
      resourceSlug: 'seats',
      quantity: 1,
      externalId: 'user_1',
      externalIds: ['user_2'],
    }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('accepts optional subscriptionId', () => {
    const input = {
      resourceSlug: 'seats',
      quantity: 1,
      subscriptionId: 'sub_123',
    }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.subscriptionId).toBe('sub_123')
    }
  })

  it('accepts optional metadata', () => {
    const input = {
      resourceSlug: 'seats',
      externalId: 'user_123',
      metadata: { assignedTo: 'John Doe', priority: 1, active: true },
    }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.metadata).toEqual({
        assignedTo: 'John Doe',
        priority: 1,
        active: true,
      })
    }
  })

  it('rejects non-positive quantity', () => {
    const input = { resourceSlug: 'seats', quantity: 0 }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects negative quantity', () => {
    const input = { resourceSlug: 'seats', quantity: -1 }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects non-integer quantity', () => {
    const input = { resourceSlug: 'seats', quantity: 1.5 }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects externalId longer than 255 characters', () => {
    const input = {
      resourceSlug: 'seats',
      externalId: 'a'.repeat(256),
    }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects externalIds with items longer than 255 characters', () => {
    const input = {
      resourceSlug: 'seats',
      externalIds: ['valid_id', 'a'.repeat(256)],
    }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects empty externalIds array', () => {
    const input = {
      resourceSlug: 'seats',
      externalIds: [],
    }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects missing resourceSlug', () => {
    const input = { quantity: 3 }
    const result = claimResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('releaseResourceSchema', () => {
  it('validates all four modes (quantity, externalId, externalIds, claimIds) when each is provided alone', () => {
    const quantityResult = releaseResourceSchema.safeParse({
      resourceSlug: 'seats',
      quantity: 2,
    })
    const externalIdResult = releaseResourceSchema.safeParse({
      resourceSlug: 'seats',
      externalId: 'user_1',
    })
    const externalIdsResult = releaseResourceSchema.safeParse({
      resourceSlug: 'seats',
      externalIds: ['user_1', 'user_2'],
    })
    const claimIdsResult = releaseResourceSchema.safeParse({
      resourceSlug: 'seats',
      claimIds: ['claim_1', 'claim_2'],
    })

    expect(quantityResult.success).toBe(true)
    expect(externalIdResult.success).toBe(true)
    expect(externalIdsResult.success).toBe(true)
    expect(claimIdsResult.success).toBe(true)
  })

  it('rejects input with both claimIds and externalId, returning validation error', () => {
    const input = {
      resourceSlug: 'seats',
      claimIds: ['claim_1'],
      externalId: 'user_1',
    }
    const result = releaseResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with both quantity and claimIds', () => {
    const input = {
      resourceSlug: 'seats',
      quantity: 2,
      claimIds: ['claim_1'],
    }
    const result = releaseResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with both quantity and externalId', () => {
    const input = {
      resourceSlug: 'seats',
      quantity: 2,
      externalId: 'user_1',
    }
    const result = releaseResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with both quantity and externalIds', () => {
    const input = {
      resourceSlug: 'seats',
      quantity: 2,
      externalIds: ['user_1', 'user_2'],
    }
    const result = releaseResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with both externalId and externalIds', () => {
    const input = {
      resourceSlug: 'seats',
      externalId: 'user_1',
      externalIds: ['user_2', 'user_3'],
    }
    const result = releaseResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects input with no mode provided', () => {
    const input = { resourceSlug: 'seats' }
    const result = releaseResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      const errorMessage = result.error.issues
        .map((issue) => issue.message)
        .join(', ')
      expect(errorMessage).toContain('Exactly one of')
    }
  })

  it('accepts optional subscriptionId', () => {
    const input = {
      resourceSlug: 'seats',
      quantity: 1,
      subscriptionId: 'sub_123',
    }
    const result = releaseResourceSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.subscriptionId).toBe('sub_123')
    }
  })

  it('rejects non-positive quantity', () => {
    const input = { resourceSlug: 'seats', quantity: 0 }
    const result = releaseResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects negative quantity', () => {
    const input = { resourceSlug: 'seats', quantity: -1 }
    const result = releaseResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects non-integer quantity', () => {
    const input = { resourceSlug: 'seats', quantity: 1.5 }
    const result = releaseResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects externalId longer than 255 characters', () => {
    const input = {
      resourceSlug: 'seats',
      externalId: 'a'.repeat(256),
    }
    const result = releaseResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects externalIds with items longer than 255 characters', () => {
    const input = {
      resourceSlug: 'seats',
      externalIds: ['valid_id', 'a'.repeat(256)],
    }
    const result = releaseResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects empty externalIds array', () => {
    const input = {
      resourceSlug: 'seats',
      externalIds: [],
    }
    const result = releaseResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects empty claimIds array', () => {
    const input = {
      resourceSlug: 'seats',
      claimIds: [],
    }
    const result = releaseResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects missing resourceSlug', () => {
    const input = { quantity: 3 }
    const result = releaseResourceSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('listResourceClaimsSchema', () => {
  it('accepts empty input', () => {
    const result = listResourceClaimsSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts optional subscriptionId', () => {
    const result = listResourceClaimsSchema.safeParse({
      subscriptionId: 'sub_123',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.subscriptionId).toBe('sub_123')
    }
  })

  it('accepts optional resourceSlug', () => {
    const result = listResourceClaimsSchema.safeParse({
      resourceSlug: 'seats',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.resourceSlug).toBe('seats')
    }
  })

  it('accepts both subscriptionId and resourceSlug', () => {
    const result = listResourceClaimsSchema.safeParse({
      subscriptionId: 'sub_123',
      resourceSlug: 'seats',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.subscriptionId).toBe('sub_123')
      expect(result.data.resourceSlug).toBe('seats')
    }
  })
})

describe('flowgladActionValidators', () => {
  it('has validators for all FlowgladActionKey values', () => {
    const expectedKeys = [
      FlowgladActionKey.GetCustomerBilling,
      FlowgladActionKey.FindOrCreateCustomer,
      FlowgladActionKey.CreateAddPaymentMethodCheckoutSession,
      FlowgladActionKey.CreateActivateSubscriptionCheckoutSession,
      FlowgladActionKey.CreateCheckoutSession,
      FlowgladActionKey.CancelSubscription,
      FlowgladActionKey.UncancelSubscription,
      FlowgladActionKey.AdjustSubscription,
      FlowgladActionKey.CreateSubscription,
      FlowgladActionKey.UpdateCustomer,
      FlowgladActionKey.CreateUsageEvent,
      FlowgladActionKey.GetResourceUsages,
      FlowgladActionKey.GetResourceUsage,
      FlowgladActionKey.ClaimResource,
      FlowgladActionKey.ReleaseResource,
      FlowgladActionKey.ListResourceClaims,
    ]

    for (const key of expectedKeys) {
      const validator = flowgladActionValidators[key]
      expect(validator).toEqual(
        expect.objectContaining({
          method: expect.any(String),
          inputValidator: expect.objectContaining({
            safeParse: expect.any(Function),
          }),
        })
      )
    }
  })
  const getMethodKeys = [
    FlowgladActionKey.GetResourceUsage,
    FlowgladActionKey.GetResourceUsages,
    FlowgladActionKey.ListResourceClaims,
  ]
  it('all validators not starting with "get" use POST method', () => {
    for (const key of Object.keys(
      flowgladActionValidators
    ) as FlowgladActionKey[]) {
      // Only check keys that do not start with "Get"
      if (!getMethodKeys.includes(key)) {
        expect(flowgladActionValidators[key].method).toBe(
          HTTPMethod.POST
        )
      }
    }
  })
  it('all validators starting with "get" or "list" use GET method', () => {
    for (const key of Object.keys(
      flowgladActionValidators
    ) as FlowgladActionKey[]) {
      if (getMethodKeys.includes(key)) {
        expect(flowgladActionValidators[key].method).toBe(
          HTTPMethod.GET
        )
      }
    }
  })
  it('GetCustomerBilling validator accepts externalId', () => {
    const validator =
      flowgladActionValidators[FlowgladActionKey.GetCustomerBilling]
        .inputValidator
    const result = validator.safeParse({ externalId: 'ext_123' })
    expect(result.success).toBe(true)
  })

  it('FindOrCreateCustomer validator accepts externalId', () => {
    const validator =
      flowgladActionValidators[FlowgladActionKey.FindOrCreateCustomer]
        .inputValidator
    const result = validator.safeParse({ externalId: 'ext_123' })
    expect(result.success).toBe(true)
  })

  it('AdjustSubscription validator accepts priceSlug', () => {
    const validator =
      flowgladActionValidators[FlowgladActionKey.AdjustSubscription]
        .inputValidator
    const result = validator.safeParse({
      priceSlug: 'pro-monthly',
    })
    expect(result.success).toBe(true)
  })

  it('AdjustSubscription validator accepts priceId', () => {
    const validator =
      flowgladActionValidators[FlowgladActionKey.AdjustSubscription]
        .inputValidator
    const result = validator.safeParse({
      priceId: 'price_123',
    })
    expect(result.success).toBe(true)
  })

  it('AdjustSubscription validator accepts priceSlug with options', () => {
    const validator =
      flowgladActionValidators[FlowgladActionKey.AdjustSubscription]
        .inputValidator
    const result = validator.safeParse({
      priceSlug: 'pro-monthly',
      subscriptionId: 'sub_123',
      quantity: 5,
      timing: 'auto',
    })
    expect(result.success).toBe(true)
  })

  it('AdjustSubscription validator accepts subscriptionItems', () => {
    const validator =
      flowgladActionValidators[FlowgladActionKey.AdjustSubscription]
        .inputValidator
    const result = validator.safeParse({
      subscriptionItems: [
        { priceSlug: 'base-plan', quantity: 1 },
        { priceId: 'price_addon', quantity: 3 },
      ],
      timing: 'immediately',
    })
    expect(result.success).toBe(true)
  })
})

describe('subscriptionAdjustmentTimingSchema', () => {
  it('parses "immediately" as valid timing and returns the exact value', () => {
    const result =
      subscriptionAdjustmentTimingSchema.safeParse('immediately')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('immediately')
    }
  })

  it('parses "at_end_of_current_billing_period" as valid timing and returns the exact value', () => {
    const result = subscriptionAdjustmentTimingSchema.safeParse(
      'at_end_of_current_billing_period'
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('at_end_of_current_billing_period')
    }
  })

  it('parses "auto" as valid timing and returns the exact value', () => {
    const result =
      subscriptionAdjustmentTimingSchema.safeParse('auto')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('auto')
    }
  })

  it('rejects the old timing value "at_end_of_period" which was changed in a breaking update', () => {
    const result = subscriptionAdjustmentTimingSchema.safeParse(
      'at_end_of_period'
    )
    expect(result.success).toBe(false)
  })

  it('rejects arbitrary invalid timing strings', () => {
    const result =
      subscriptionAdjustmentTimingSchema.safeParse('next_week')
    expect(result.success).toBe(false)
  })

  it('rejects non-string values', () => {
    const resultNumber =
      subscriptionAdjustmentTimingSchema.safeParse(123)
    expect(resultNumber.success).toBe(false)

    const resultNull =
      subscriptionAdjustmentTimingSchema.safeParse(null)
    expect(resultNull.success).toBe(false)

    const resultObject = subscriptionAdjustmentTimingSchema.safeParse(
      {
        timing: 'immediately',
      }
    )
    expect(resultObject.success).toBe(false)
  })
})

describe('subscriptionAdjustmentTiming constant values', () => {
  it('Immediately equals "immediately"', () => {
    expect(subscriptionAdjustmentTiming.Immediately).toBe(
      'immediately'
    )
  })

  it('AtEndOfCurrentBillingPeriod equals "at_end_of_current_billing_period"', () => {
    expect(
      subscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
    ).toBe('at_end_of_current_billing_period')
  })

  it('Auto equals "auto"', () => {
    expect(subscriptionAdjustmentTiming.Auto).toBe('auto')
  })

  it('contains exactly three timing options', () => {
    const keys = Object.keys(subscriptionAdjustmentTiming)
    expect(keys).toHaveLength(3)
    expect(keys).toContain('Immediately')
    expect(keys).toContain('AtEndOfCurrentBillingPeriod')
    expect(keys).toContain('Auto')
  })
})
