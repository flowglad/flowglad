import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createCheckoutSessionInputSchema } from '@/db/schema/checkoutSessions'
import { CheckoutSessionType } from '@/types'

const successUrl = 'https://example.com/success'
const cancelUrl = 'https://example.com/cancel'

const wrap = (checkoutSession: Record<string, unknown>) => ({
  checkoutSession,
})

describe('createCheckoutSessionInputSchema – product anonymous discriminator', () => {
  it('parses known when anonymous is omitted and customerExternalId is provided', () => {
    const input = wrap({
      type: CheckoutSessionType.Product,
      priceId: 'price_123',
      successUrl,
      cancelUrl,
      customerExternalId: 'cust_ext_1',
    })
    const result = createCheckoutSessionInputSchema.parse(input)
    expect(result.checkoutSession.type).toBe(
      CheckoutSessionType.Product
    )
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
    const result = createCheckoutSessionInputSchema.parse(input)
    expect(result.checkoutSession.type).toBe(
      CheckoutSessionType.Product
    )
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
      expect(() =>
        createCheckoutSessionInputSchema.parse(input)
      ).toThrow(z.ZodError)
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
    const result = createCheckoutSessionInputSchema.parse(input)
    expect(result.checkoutSession.type).toBe(
      CheckoutSessionType.Product
    )
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
    const result = createCheckoutSessionInputSchema.parse(input)
    expect(result.checkoutSession.type).toBe(
      CheckoutSessionType.Product
    )
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
    expect(() =>
      createCheckoutSessionInputSchema.parse(input)
    ).toThrow(z.ZodError)
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
      const result = createCheckoutSessionInputSchema.parse(input)
      expect(result.checkoutSession.type).toBe(
        CheckoutSessionType.Product
      )
    }
  })
})

describe('createCheckoutSessionInputSchema – non-product shapes ignore anonymous', () => {
  it('add_payment_method parses even if anonymous=true is present', () => {
    const input = wrap({
      type: CheckoutSessionType.AddPaymentMethod,
      successUrl,
      cancelUrl,
      customerExternalId: 'cust_ext_1',
      anonymous: true, // extra field; should be ignored by this shape
    })
    const result = createCheckoutSessionInputSchema.parse(input)
    expect(result.checkoutSession.type).toBe(
      CheckoutSessionType.AddPaymentMethod
    )
  })

  it('activate_subscription parses even if anonymous=true is present', () => {
    const input = wrap({
      type: CheckoutSessionType.ActivateSubscription,
      successUrl,
      cancelUrl,
      customerExternalId: 'cust_ext_1',
      targetSubscriptionId: 'sub_123',
      anonymous: true, // extra field; should be ignored by this shape
    })
    const result = createCheckoutSessionInputSchema.parse(input)
    expect(result.checkoutSession.type).toBe(
      CheckoutSessionType.ActivateSubscription
    )
  })

  it('activate_subscription allows priceId to be omitted', () => {
    const input = wrap({
      type: CheckoutSessionType.ActivateSubscription,
      successUrl,
      cancelUrl,
      customerExternalId: 'cust_ext_1',
      targetSubscriptionId: 'sub_123',
    })
    const result = createCheckoutSessionInputSchema.parse(input)
    expect(result.checkoutSession.type).toBe(
      CheckoutSessionType.ActivateSubscription
    )
  })
})

describe('createCheckoutSessionInputSchema – price slug support', () => {
  describe('identified product checkout (anonymous=false)', () => {
    it('accepts priceId', () => {
      const input = wrap({
        type: CheckoutSessionType.Product,
        priceId: 'price_123',
        successUrl,
        cancelUrl,
        customerExternalId: 'cust_ext_1',
        anonymous: false,
      })
      const result = createCheckoutSessionInputSchema.parse(input)
      expect(result.checkoutSession.type).toBe(
        CheckoutSessionType.Product
      )
      if (
        result.checkoutSession.type === CheckoutSessionType.Product
      ) {
        expect(result.checkoutSession.priceId).toBe('price_123')
        expect(result.checkoutSession.priceSlug).toBeUndefined()
      }
    })

    it('accepts priceSlug', () => {
      const input = wrap({
        type: CheckoutSessionType.Product,
        priceSlug: 'basic-plan',
        successUrl,
        cancelUrl,
        customerExternalId: 'cust_ext_1',
        anonymous: false,
      })
      const result = createCheckoutSessionInputSchema.parse(input)
      expect(result.checkoutSession.type).toBe(
        CheckoutSessionType.Product
      )
      if (
        result.checkoutSession.type === CheckoutSessionType.Product
      ) {
        expect(result.checkoutSession.priceSlug).toBe('basic-plan')
        expect(result.checkoutSession.priceId).toBeUndefined()
      }
    })

    it('should reject when both priceId and priceSlug are provided', () => {
      const input = wrap({
        type: CheckoutSessionType.Product,
        priceId: 'price_123',
        priceSlug: 'basic-plan',
        successUrl,
        cancelUrl,
        customerExternalId: 'cust_ext_1',
        anonymous: false,
      })
      expect(() =>
        createCheckoutSessionInputSchema.parse(input)
      ).toThrow(
        'Either priceId or priceSlug must be provided, but not both'
      )
    })

    it('should reject when neither priceId nor priceSlug is provided', () => {
      const input = wrap({
        type: CheckoutSessionType.Product,
        successUrl,
        cancelUrl,
        customerExternalId: 'cust_ext_1',
        anonymous: false,
      })
      expect(() =>
        createCheckoutSessionInputSchema.parse(input)
      ).toThrow(
        'Either priceId or priceSlug must be provided, but not both'
      )
    })
  })

  describe('anonymous product checkout (anonymous=true)', () => {
    it('accepts priceId', () => {
      const input = wrap({
        type: CheckoutSessionType.Product,
        priceId: 'price_123',
        successUrl,
        cancelUrl,
        anonymous: true,
      })
      const result = createCheckoutSessionInputSchema.parse(input)
      expect(result.checkoutSession.type).toBe(
        CheckoutSessionType.Product
      )
      if (
        result.checkoutSession.type === CheckoutSessionType.Product
      ) {
        expect(result.checkoutSession.priceId).toBe('price_123')
        expect(result.checkoutSession.priceSlug).toBeUndefined()
      }
    })

    it('accepts priceSlug', () => {
      const input = wrap({
        type: CheckoutSessionType.Product,
        priceSlug: 'basic-plan',
        successUrl,
        cancelUrl,
        anonymous: true,
      })
      const result = createCheckoutSessionInputSchema.parse(input)
      expect(result.checkoutSession.type).toBe(
        CheckoutSessionType.Product
      )
      if (
        result.checkoutSession.type === CheckoutSessionType.Product
      ) {
        expect(result.checkoutSession.priceSlug).toBe('basic-plan')
        expect(result.checkoutSession.priceId).toBeUndefined()
      }
    })

    it('should reject when both priceId and priceSlug are provided', () => {
      const input = wrap({
        type: CheckoutSessionType.Product,
        priceId: 'price_123',
        priceSlug: 'basic-plan',
        successUrl,
        cancelUrl,
        anonymous: true,
      })
      expect(() =>
        createCheckoutSessionInputSchema.parse(input)
      ).toThrow(
        'Either priceId or priceSlug must be provided, but not both'
      )
    })

    it('should reject when neither priceId nor priceSlug is provided', () => {
      const input = wrap({
        type: CheckoutSessionType.Product,
        successUrl,
        cancelUrl,
        anonymous: true,
      })
      expect(() =>
        createCheckoutSessionInputSchema.parse(input)
      ).toThrow(
        'Either priceId or priceSlug must be provided, but not both'
      )
    })
  })
})
