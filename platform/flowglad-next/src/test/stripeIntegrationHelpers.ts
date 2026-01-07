import Stripe from 'stripe'
import { describe, it } from 'vitest'
import core from '@/utils/core'

/**
 * Stripe integration test helpers.
 *
 * These helpers are designed for integration tests that make real API calls
 * to Stripe's test mode. They should NOT be used with mocks.
 */

/**
 * Gets the Stripe test mode secret key from environment variables.
 * Returns undefined if not set.
 */
export const getStripeTestModeSecretKey = (): string | undefined => {
  return process.env.STRIPE_TEST_MODE_SECRET_KEY
}

/**
 * Creates a Stripe client for integration tests using the test mode secret key.
 * Throws if STRIPE_TEST_MODE_SECRET_KEY is not set.
 */
export const getStripeTestClient = (): Stripe => {
  const key = getStripeTestModeSecretKey()
  if (!key) {
    throw new Error(
      'STRIPE_TEST_MODE_SECRET_KEY is not set. Stripe integration tests require this environment variable.'
    )
  }
  return new Stripe(key, {
    apiVersion: '2024-09-30.acacia',
  })
}

/**
 * Creates a describe block that only runs if Stripe credentials are available.
 * Use this to wrap integration test suites that require Stripe access.
 *
 * @example
 * ```ts
 * describeIfStripeKey('Stripe Customer API', () => {
 *   it('should create a customer', async () => {
 *     // test code...
 *   })
 * })
 * ```
 */
export const describeIfStripeKey = (
  name: string,
  fn: () => void
): void => {
  const hasKey = !!getStripeTestModeSecretKey()
  if (hasKey) {
    describe(name, fn)
  } else {
    describe.skip(name, fn)
  }
}

/**
 * Creates an it block that only runs if Stripe credentials are available.
 */
export const itIfStripeKey = (
  name: string,
  fn: () => Promise<void> | void
): void => {
  const hasKey = !!getStripeTestModeSecretKey()
  if (hasKey) {
    it(name, fn)
  } else {
    it.skip(name, fn)
  }
}

/**
 * Cleans up Stripe test data created during tests.
 * This should be called in afterEach or afterAll hooks.
 *
 * @param params - Object containing Stripe resource IDs to clean up
 */
export const cleanupStripeTestData = async (params: {
  stripeAccountId?: string
  stripeCustomerId?: string
  stripePaymentIntentId?: string
  stripeSetupIntentId?: string
}): Promise<void> => {
  const stripe = getStripeTestClient()

  // Cancel payment intent if exists
  if (params.stripePaymentIntentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(
        params.stripePaymentIntentId
      )
      if (pi.status !== 'succeeded' && pi.status !== 'canceled') {
        await stripe.paymentIntents.cancel(
          params.stripePaymentIntentId
        )
      }
    } catch {
      // Ignore errors - resource may already be cleaned up
    }
  }

  // Cancel setup intent if exists
  if (params.stripeSetupIntentId) {
    try {
      const si = await stripe.setupIntents.retrieve(
        params.stripeSetupIntentId
      )
      if (si.status !== 'succeeded' && si.status !== 'canceled') {
        await stripe.setupIntents.cancel(params.stripeSetupIntentId)
      }
    } catch {
      // Ignore errors - resource may already be cleaned up
    }
  }

  // Delete customer if exists (this will also delete associated payment methods)
  if (params.stripeCustomerId) {
    try {
      await stripe.customers.del(params.stripeCustomerId)
    } catch {
      // Ignore errors - resource may already be deleted
    }
  }

  // Note: Connected accounts are not deleted automatically due to compliance implications
  // They require manual deletion from the Stripe dashboard if needed
}

/**
 * Creates a test card payment method attached to a customer.
 * Uses Stripe's test card tokens for reliable test scenarios.
 *
 * @param params - Object containing customer ID and livemode flag
 * @returns The created PaymentMethod
 */
export const createTestPaymentMethod = async (params: {
  stripeCustomerId: string
  livemode: false
}): Promise<Stripe.PaymentMethod> => {
  if (params.livemode !== false) {
    throw new Error(
      'createTestPaymentMethod can only be used with livemode: false'
    )
  }

  const stripe = getStripeTestClient()

  // Create a payment method using Stripe's test card token
  const paymentMethod = await stripe.paymentMethods.create({
    type: 'card',
    card: {
      token: 'tok_visa', // Stripe's test Visa card token
    },
  })

  // Attach the payment method to the customer
  await stripe.paymentMethods.attach(paymentMethod.id, {
    customer: params.stripeCustomerId,
  })

  return paymentMethod
}

/**
 * Creates a test customer in Stripe's test mode.
 *
 * @param params - Optional customer creation parameters
 * @returns The created Stripe Customer
 */
export const createTestStripeCustomer = async (params?: {
  email?: string
  name?: string
  metadata?: Record<string, string>
}): Promise<Stripe.Customer> => {
  const stripe = getStripeTestClient()

  return stripe.customers.create({
    email: params?.email ?? `test+${core.nanoid()}@flowglad-test.com`,
    name: params?.name ?? `Test Customer ${core.nanoid()}`,
    metadata: {
      createdBy: 'stripeIntegrationHelpers',
      testRunId: core.nanoid(),
      ...params?.metadata,
    },
  })
}

/**
 * San Francisco, CA address for consistent tax calculation tests.
 * Tax calculations require specific addresses and vary by region.
 */
export const TEST_US_ADDRESS: Stripe.AddressParam = {
  line1: '354 Oyster Point Blvd',
  city: 'South San Francisco',
  state: 'CA',
  postal_code: '94080',
  country: 'US',
}

/**
 * Waits for a Stripe webhook event (optional utility).
 * Note: This is primarily useful for async operations where you need to wait
 * for Stripe to process something. For most sync operations, this is not needed.
 *
 * @param params - Event type and resource ID to wait for
 * @returns The event if found within timeout, null otherwise
 */
export const waitForStripeWebhook = async (params: {
  eventType: string
  resourceId: string
  timeout?: number
}): Promise<Stripe.Event | null> => {
  const stripe = getStripeTestClient()
  const timeout = params.timeout ?? 10000
  const pollInterval = 1000
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const events = await stripe.events.list({
      type: params.eventType,
      limit: 10,
    })

    const matchingEvent = events.data.find((event) => {
      const eventData = event.data.object as unknown as {
        id?: string
      }
      return eventData.id === params.resourceId
    })

    if (matchingEvent) {
      return matchingEvent
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  return null
}
