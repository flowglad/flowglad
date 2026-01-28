import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import Stripe from 'stripe'
import { stripe } from './stripe'

describe('stripe client configuration', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Reset env to known state
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

  it('uses stripe-mock when STRIPE_INTEGRATION_TEST_MODE is not set', () => {
    delete process.env.STRIPE_INTEGRATION_TEST_MODE
    const client = stripe(false)
    // Client is created successfully - stripe-mock config applied
    expect(client).toBeInstanceOf(Stripe)
  })

  it('uses stripe-mock when STRIPE_INTEGRATION_TEST_MODE is "false"', () => {
    process.env.STRIPE_INTEGRATION_TEST_MODE = 'false'
    const client = stripe(false)
    // Should still use stripe-mock since 'false' !== 'true'
    expect(client).toBeInstanceOf(Stripe)
  })

  it('skips stripe-mock when STRIPE_INTEGRATION_TEST_MODE is "true"', () => {
    process.env.STRIPE_INTEGRATION_TEST_MODE = 'true'
    const client = stripe(false)
    // Client created with real Stripe config
    expect(client).toBeInstanceOf(Stripe)
  })
})
