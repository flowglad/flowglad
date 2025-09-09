import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createCheckoutSessionSchema } from '@/db/schema/checkoutSessions'
import { CheckoutSessionType } from '@/types'

const successUrl = 'https://example.com/success'
const cancelUrl = 'https://example.com/cancel'

const wrap = (checkoutSession: Record<string, unknown>) => ({
  checkoutSession,
})

describe('createCheckoutSessionSchema – product anonymous discriminator', () => {
  it('parses known when anonymous is omitted and customerExternalId is provided', () => {
    const input = wrap({
      type: CheckoutSessionType.Product,
      priceId: 'price_123',
      successUrl,
      cancelUrl,
      customerExternalId: 'cust_ext_1',
    })
    const result = createCheckoutSessionSchema.parse(input)
    expect(result.checkoutSession).toBeDefined()
  })

  it('parses known when anonymous=false and customerExternalId is provided', () => {
    const input = wrap({
      type: CheckoutSessionType.Product,
      priceId: 'price_123',
      successUrl,
      cancelUrl,
      anonymous: false,
      customerExternalId: 'cust_ext_1',
    })
    const result = createCheckoutSessionSchema.parse(input)
    expect(result.checkoutSession).toBeDefined()
  })

  it('fails when anonymous omitted/false and customerExternalId is missing', () => {
    const inputs = [
      wrap({
        type: CheckoutSessionType.Product,
        priceId: 'price_123',
        successUrl,
        cancelUrl,
      }),
      wrap({
        type: CheckoutSessionType.Product,
        priceId: 'price_123',
        successUrl,
        cancelUrl,
        anonymous: false,
      }),
    ]
    for (const input of inputs) {
      expect(() => createCheckoutSessionSchema.parse(input)).toThrow(
        z.ZodError
      )
    }
  })

  it('parses anonymous when anonymous=true and customerExternalId is undefined', () => {
    const input = wrap({
      type: CheckoutSessionType.Product,
      priceId: 'price_123',
      successUrl,
      cancelUrl,
      anonymous: true,
      // no customerExternalId provided
    })
    const result = createCheckoutSessionSchema.parse(input)
    expect(result.checkoutSession).toBeDefined()
  })

  it('parses anonymous when anonymous=true and customerExternalId=null', () => {
    const input = wrap({
      type: CheckoutSessionType.Product,
      priceId: 'price_123',
      successUrl,
      cancelUrl,
      anonymous: true,
      customerExternalId: null,
    })
    const result = createCheckoutSessionSchema.parse(input)
    expect(result.checkoutSession).toBeDefined()
  })

  it('fails when anonymous=true and customerExternalId is a string', () => {
    const input = wrap({
      type: CheckoutSessionType.Product,
      priceId: 'price_123',
      successUrl,
      cancelUrl,
      anonymous: true,
      customerExternalId: 'cust_ext_should_not_be_here',
    })
    expect(() => createCheckoutSessionSchema.parse(input)).toThrow(
      z.ZodError
    )
  })

  it('parses with quantity variants (omitted, 1, 3)', () => {
    const base = {
      type: CheckoutSessionType.Product as const,
      priceId: 'price_123',
      successUrl,
      cancelUrl,
      customerExternalId: 'cust_ext_1',
    }
    const inputs = [
      wrap(base),
      wrap({ ...base, quantity: 1 }),
      wrap({ ...base, quantity: 3 }),
    ]
    for (const input of inputs) {
      const result = createCheckoutSessionSchema.parse(input)
      expect(result.checkoutSession).toBeDefined()
    }
  })
})

describe('createCheckoutSessionSchema – non-product shapes ignore anonymous', () => {
  it('add_payment_method parses even if anonymous=true is present', () => {
    const input = wrap({
      type: CheckoutSessionType.AddPaymentMethod,
      successUrl,
      cancelUrl,
      customerExternalId: 'cust_ext_1',
      anonymous: true, // extra field; should be ignored by this shape
    })
    const result = createCheckoutSessionSchema.parse(input)
    expect(result.checkoutSession).toBeDefined()
  })

  it('activate_subscription parses even if anonymous=true is present', () => {
    const input = wrap({
      type: CheckoutSessionType.ActivateSubscription,
      successUrl,
      cancelUrl,
      customerExternalId: 'cust_ext_1',
      priceId: 'price_123',
      targetSubscriptionId: 'sub_123',
      anonymous: true, // extra field; should be ignored by this shape
    })
    const result = createCheckoutSessionSchema.parse(input)
    expect(result.checkoutSession).toBeDefined()
  })
})
