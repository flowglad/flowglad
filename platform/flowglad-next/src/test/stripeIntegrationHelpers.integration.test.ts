import { afterAll, expect, it } from 'vitest'
import {
  cleanupStripeTestData,
  createTestPaymentMethod,
  createTestStripeCustomer,
  describeIfStripeKey,
  getStripeTestClient,
} from './stripeIntegrationHelpers'

/**
 * Smoke tests for Stripe integration test infrastructure.
 * These tests verify that the helper functions work correctly
 * with real Stripe API calls in test mode.
 */
describeIfStripeKey('Stripe Integration Test Helpers', () => {
  let customerId: string | undefined

  afterAll(async () => {
    if (customerId) {
      await cleanupStripeTestData({ stripeCustomerId: customerId })
    }
  })

  it('creates a Stripe test client, customer, and payment method', async () => {
    const stripe = getStripeTestClient()

    // Verify the client is configured correctly
    expect(stripe).toBeDefined()

    // Create a test customer
    const customer = await createTestStripeCustomer({
      email: 'integration-test@flowglad-test.com',
      name: 'Integration Test Customer',
    })
    customerId = customer.id

    expect(customer.id).toMatch(/^cus_/)
    expect(customer.email).toBe('integration-test@flowglad-test.com')
    expect(customer.name).toBe('Integration Test Customer')
    expect(customer.metadata?.createdBy).toBe(
      'stripeIntegrationHelpers'
    )

    // Create and attach a payment method to the customer
    const paymentMethod = await createTestPaymentMethod({
      stripeCustomerId: customer.id,
      livemode: false,
    })

    expect(paymentMethod.id).toMatch(/^pm_/)
    expect(paymentMethod.type).toBe('card')
    expect(paymentMethod.card?.brand).toBe('visa')

    // Verify the payment method is attached to the customer
    // Note: The customer field on the returned payment method may be null
    // since we need to re-retrieve it to see the attached customer
    const attachedPaymentMethod =
      await stripe.paymentMethods.retrieve(paymentMethod.id)
    expect(attachedPaymentMethod.customer).toBe(customer.id)
  })
})
