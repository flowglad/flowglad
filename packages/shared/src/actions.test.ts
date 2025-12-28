import { describe, expect, it } from 'vitest'
import {
  billingAddressSchema,
  bulkCreateUsageEventsSchema,
  cancelSubscriptionSchema,
  createActivateSubscriptionCheckoutSessionSchema,
  createAddPaymentMethodCheckoutSessionSchema,
  createProductCheckoutSessionSchema,
  createSubscriptionSchema,
  createUsageEventSchema,
  flowgladActionValidators,
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
      trialEnd: Date.now() + 86400000, // 1 day from now
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

describe('flowgladActionValidators', () => {
  it('has validators for all FlowgladActionKey values', () => {
    const expectedKeys = [
      FlowgladActionKey.GetCustomerBilling,
      FlowgladActionKey.FindOrCreateCustomer,
      FlowgladActionKey.CreateAddPaymentMethodCheckoutSession,
      FlowgladActionKey.CreateActivateSubscriptionCheckoutSession,
      FlowgladActionKey.CreateCheckoutSession,
      FlowgladActionKey.CancelSubscription,
      FlowgladActionKey.CreateSubscription,
      FlowgladActionKey.UpdateCustomer,
    ]

    for (const key of expectedKeys) {
      expect(flowgladActionValidators[key]).toBeDefined()
      expect(flowgladActionValidators[key].method).toBeDefined()
      expect(
        flowgladActionValidators[key].inputValidator
      ).toBeDefined()
    }
  })

  it('all validators use POST method', () => {
    for (const key of Object.keys(
      flowgladActionValidators
    ) as FlowgladActionKey[]) {
      expect(flowgladActionValidators[key].method).toBe(
        HTTPMethod.POST
      )
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
})
