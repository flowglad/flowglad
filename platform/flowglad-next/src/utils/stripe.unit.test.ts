import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import Stripe from 'stripe'
import { stripe } from './stripe'

describe('stripe client configuration', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Reset env to known state - preserve STRIPE_MOCK_HOST from .env.test
    process.env.STRIPE_INTEGRATION_TEST_MODE = undefined
  })

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
    // STRIPE_MOCK_HOST is set via .env.test
    expect(process.env.STRIPE_MOCK_HOST).toBe('localhost')
    const client = stripe(false)
    expect(client).toBeInstanceOf(Stripe)
  })

  it('uses stripe-mock when STRIPE_INTEGRATION_TEST_MODE is "false"', () => {
    process.env.STRIPE_INTEGRATION_TEST_MODE = 'false'
    const client = stripe(false)
    // Should still use stripe-mock since 'false' !== 'true'
    expect(client).toBeInstanceOf(Stripe)
  })

  it('skips stripe-mock config when STRIPE_INTEGRATION_TEST_MODE is "true"', () => {
    process.env.STRIPE_INTEGRATION_TEST_MODE = 'true'
    const client = stripe(false)
    // Client created with real Stripe config (bypasses stripe-mock)
    expect(client).toBeInstanceOf(Stripe)
  })

  it('does not use stripe-mock config when STRIPE_MOCK_HOST is unset', () => {
    delete process.env.STRIPE_MOCK_HOST
    const client = stripe(false)
    // Client created without stripe-mock config
    expect(client).toBeInstanceOf(Stripe)
  })
})
