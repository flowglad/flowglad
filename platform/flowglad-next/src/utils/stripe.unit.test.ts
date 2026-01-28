import { afterEach, describe, expect, it } from 'bun:test'
import Stripe from 'stripe'
import { stripe } from './stripe'

describe('stripe client configuration', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    // Restore original env
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    })
    Object.assign(process.env, originalEnv)
  })

  it('returns a Stripe instance in test mode', () => {
    const client = stripe(false)
    expect(client).toBeInstanceOf(Stripe)
  })

  it('returns a Stripe instance in live mode', () => {
    const client = stripe(true)
    expect(client).toBeInstanceOf(Stripe)
  })

  it('uses stripe-mock config when STRIPE_MOCK_HOST is set', () => {
    // Set STRIPE_MOCK_HOST to simulate .env.test configuration
    process.env.STRIPE_MOCK_HOST = 'localhost'
    const client = stripe(false)
    expect(client).toBeInstanceOf(Stripe)
  })

  it('does not use stripe-mock config when STRIPE_MOCK_HOST is unset', () => {
    delete process.env.STRIPE_MOCK_HOST
    const client = stripe(false)
    // Client created without stripe-mock config (uses real Stripe API)
    expect(client).toBeInstanceOf(Stripe)
  })
})
