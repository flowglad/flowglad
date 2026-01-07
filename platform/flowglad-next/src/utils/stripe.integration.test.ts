import { afterEach, describe, expect, it } from 'vitest'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import {
  cleanupStripeTestData,
  createTestPaymentMethod,
  createTestStripeCustomer,
  describeIfStripeKey,
  getStripeTestClient,
} from '@/test/stripeIntegrationHelpers'
import { CheckoutSessionStatus, CheckoutSessionType } from '@/types'
import core from '@/utils/core'
import {
  createCustomerSessionForCheckout,
  createStripeTaxCalculationByPrice,
  createStripeTaxTransactionFromCalculation,
} from '@/utils/stripe'

describeIfStripeKey('Stripe Integration Tests', () => {
  describe('createStripeCustomer', () => {
    let createdCustomerId: string | undefined

    afterEach(async () => {
      if (createdCustomerId) {
        await cleanupStripeTestData({
          stripeCustomerId: createdCustomerId,
        })
        createdCustomerId = undefined
      }
    })

    it('creates a customer with email, name, and metadata, returns valid Stripe customer object that can be retrieved', async () => {
      const testEmail = `test+${core.nanoid()}@flowglad-integration.com`
      const testName = `Integration Test Customer ${core.nanoid()}`
      const testOrgId = `org_${core.nanoid()}`

      const stripe = getStripeTestClient()
      const stripeCustomer = await stripe.customers.create({
        email: testEmail,
        name: testName,
        metadata: {
          organizationId: testOrgId,
          createdBy: 'createCustomerBookkeeping',
        },
      })

      createdCustomerId = stripeCustomer.id

      // Verify customer ID format and basic properties
      expect(stripeCustomer.id).toMatch(/^cus_/)
      expect(stripeCustomer.email).toBe(testEmail)
      expect(stripeCustomer.name).toBe(testName)
      expect(stripeCustomer.livemode).toBe(false)

      // Verify metadata is stored correctly
      expect(stripeCustomer.metadata?.organizationId).toBe(testOrgId)
      expect(stripeCustomer.metadata?.createdBy).toBe(
        'createCustomerBookkeeping'
      )

      // Verify customer can be retrieved from Stripe
      const retrievedCustomer = await stripe.customers.retrieve(
        stripeCustomer.id
      )
      expect(retrievedCustomer.id).toBe(stripeCustomer.id)
      expect(retrievedCustomer.deleted).not.toBe(true)
    })
  })

  describe('createCustomerSessionForCheckout', () => {
    let createdCustomerId: string | undefined

    afterEach(async () => {
      if (createdCustomerId) {
        await cleanupStripeTestData({
          stripeCustomerId: createdCustomerId,
        })
        createdCustomerId = undefined
      }
    })

    it('creates a customer session for an existing customer, returns client_secret', async () => {
      const testEmail = `test+${core.nanoid()}@flowglad-integration.com`
      const testName = `Integration Test Customer ${core.nanoid()}`

      const stripeCustomer = await createTestStripeCustomer({
        email: testEmail,
        name: testName,
      })
      createdCustomerId = stripeCustomer.id

      const stripe = getStripeTestClient()
      const customerSession = await stripe.customerSessions.create({
        customer: stripeCustomer.id,
        components: {
          payment_element: {
            enabled: true,
            features: {
              payment_method_redisplay: 'enabled',
            },
          },
        },
      })

      expect(typeof customerSession.client_secret).toBe('string')
      expect(customerSession.client_secret).toContain('_secret_')
    })

    it('throws error when customer has no stripeCustomerId', async () => {
      const customerRecord: Customer.Record = {
        id: `cust_${core.nanoid()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByCommit: null,
        updatedByCommit: null,
        position: 1,
        organizationId: `org_${core.nanoid()}`,
        email: `test+${core.nanoid()}@flowglad-integration.com`,
        name: `Test Customer ${core.nanoid()}`,
        invoiceNumberBase: 'INV-TEST',
        archived: false,
        stripeCustomerId: null,
        taxId: null,
        logoURL: null,
        iconURL: null,
        domain: null,
        billingAddress: null,
        externalId: `ext_${core.nanoid()}`,
        userId: null,
        pricingModelId: null,
        stackAuthHostedBillingUserId: null,
        livemode: false,
      }

      await expect(
        createCustomerSessionForCheckout(customerRecord)
      ).rejects.toThrow(
        'Missing stripeCustomerId for customer session creation'
      )
    })
  })

  describe('Payment Intents', () => {
    /**
     * Creates a minimal CheckoutSession record for test purposes.
     */
    const createTestCheckoutSession = (
      overrides?: Partial<CheckoutSession.ProductRecord>
    ): CheckoutSession.ProductRecord => {
      const sessionId = `chckt_session_${core.nanoid()}`
      return {
        id: sessionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByCommit: null,
        updatedByCommit: null,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        organizationId: `org_${core.nanoid()}`,
        priceId: `price_${core.nanoid()}`,
        quantity: 1,
        purchaseId: null,
        invoiceId: null,
        customerId: null,
        customerName: null,
        customerEmail: null,
        stripeSetupIntentId: null,
        stripePaymentIntentId: null,
        billingAddress: null,
        paymentMethodType: null,
        discountId: null,
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        expires: Date.now() + 1000 * 60 * 60 * 24,
        livemode: false,
        pricingModelId: `pm_${core.nanoid()}`,
        preserveBillingCycleAnchor: false,
        outputMetadata: null,
        outputName: null,
        targetSubscriptionId: null,
        automaticallyUpdateSubscriptions: null,
        position: 0,
        ...overrides,
      }
    }

    describe('createPaymentIntent', () => {
      let createdPaymentIntentId: string | undefined

      afterEach(async () => {
        if (createdPaymentIntentId) {
          await cleanupStripeTestData({
            stripePaymentIntentId: createdPaymentIntentId,
          })
          createdPaymentIntentId = undefined
        }
      })

      it('creates a payment intent with correct amount, currency, and metadata', async () => {
        const stripe = getStripeTestClient()
        const checkoutSession = createTestCheckoutSession({
          quantity: 2,
        })
        const unitPrice = 5000
        const quantity = checkoutSession.quantity

        // Create payment intent directly with Stripe API
        // This mirrors what createPaymentIntentForCheckoutSession does internally
        const paymentIntent = await stripe.paymentIntents.create({
          amount: unitPrice * quantity,
          currency: 'usd',
          metadata: {
            checkoutSessionId: checkoutSession.id,
            type: 'checkout_session',
          },
        })

        createdPaymentIntentId = paymentIntent.id

        // Verify payment intent ID format
        expect(paymentIntent.id).toMatch(/^pi_/)

        // Verify amount equals price * quantity (5000 * 2 = 10000 cents)
        expect(paymentIntent.amount).toBe(10000)

        // Verify currency matches expected currency
        expect(paymentIntent.currency).toBe('usd')

        // Verify status is appropriate for a new payment intent
        expect([
          'requires_payment_method',
          'requires_confirmation',
        ]).toContain(paymentIntent.status)

        // Verify metadata contains checkoutSessionId and type
        expect(paymentIntent.metadata?.checkoutSessionId).toBe(
          checkoutSession.id
        )
        expect(paymentIntent.metadata?.type).toBe('checkout_session')

        // Verify livemode is false
        expect(paymentIntent.livemode).toBe(false)

        // Verify no transfer_data or application_fee (not set)
        expect(paymentIntent.transfer_data).toBeNull()
        expect(paymentIntent.application_fee_amount).toBeNull()
      })
    })

    describe('updatePaymentIntent', () => {
      let createdPaymentIntentId: string | undefined
      let createdCustomerId: string | undefined

      afterEach(async () => {
        if (createdPaymentIntentId) {
          await cleanupStripeTestData({
            stripePaymentIntentId: createdPaymentIntentId,
          })
          createdPaymentIntentId = undefined
        }
        if (createdCustomerId) {
          await cleanupStripeTestData({
            stripeCustomerId: createdCustomerId,
          })
          createdCustomerId = undefined
        }
      })

      it('updates payment intent customer association', async () => {
        const stripe = getStripeTestClient()

        // Create a payment intent without a customer
        const paymentIntent = await stripe.paymentIntents.create({
          amount: 1000,
          currency: 'usd',
        })
        createdPaymentIntentId = paymentIntent.id

        // Create a customer to associate
        const customer = await createTestStripeCustomer()
        createdCustomerId = customer.id

        // Update the payment intent with the customer using Stripe API directly
        const updatedPaymentIntent =
          await stripe.paymentIntents.update(paymentIntent.id, {
            customer: customer.id,
          })

        // Verify customer is now associated
        expect(updatedPaymentIntent.customer).toBe(customer.id)
      })

      it('updates payment intent amount', async () => {
        const stripe = getStripeTestClient()

        // Create a payment intent with initial amount
        const paymentIntent = await stripe.paymentIntents.create({
          amount: 1000,
          currency: 'usd',
        })
        createdPaymentIntentId = paymentIntent.id

        // Update the payment intent with new amount using Stripe API directly
        const updatedPaymentIntent =
          await stripe.paymentIntents.update(paymentIntent.id, {
            amount: 2000,
          })

        // Verify amount is updated
        expect(updatedPaymentIntent.amount).toBe(2000)
      })
    })

    describe('getPaymentIntent', () => {
      let createdPaymentIntentId: string | undefined

      afterEach(async () => {
        if (createdPaymentIntentId) {
          await cleanupStripeTestData({
            stripePaymentIntentId: createdPaymentIntentId,
          })
          createdPaymentIntentId = undefined
        }
      })

      it('retrieves payment intent by id', async () => {
        const stripe = getStripeTestClient()

        // Create a payment intent in test mode
        const paymentIntent = await stripe.paymentIntents.create({
          amount: 1500,
          currency: 'usd',
          metadata: {
            testIdentifier: `integration-test-${core.nanoid()}`,
          },
        })
        createdPaymentIntentId = paymentIntent.id

        // Retrieve using Stripe API directly
        const retrievedPaymentIntent =
          await stripe.paymentIntents.retrieve(paymentIntent.id)

        // Verify the retrieved payment intent matches
        expect(retrievedPaymentIntent.id).toBe(paymentIntent.id)
        expect(retrievedPaymentIntent.amount).toBe(1500)
        expect(retrievedPaymentIntent.currency).toBe('usd')
        expect(retrievedPaymentIntent.livemode).toBe(false)
      })
    })

    describe('confirmPaymentIntent', () => {
      let createdPaymentIntentId: string | undefined
      let createdCustomerId: string | undefined

      afterEach(async () => {
        if (createdPaymentIntentId) {
          await cleanupStripeTestData({
            stripePaymentIntentId: createdPaymentIntentId,
          })
          createdPaymentIntentId = undefined
        }
        if (createdCustomerId) {
          await cleanupStripeTestData({
            stripeCustomerId: createdCustomerId,
          })
          createdCustomerId = undefined
        }
      })

      it('confirms a payment intent that has a payment method attached', async () => {
        const stripe = getStripeTestClient()

        // Create a customer
        const customer = await createTestStripeCustomer()
        createdCustomerId = customer.id

        // Create a payment method and attach it to the customer
        const paymentMethod = await createTestPaymentMethod({
          stripeCustomerId: customer.id,
          livemode: false,
        })

        // Create a payment intent with the customer and payment method
        // Use automatic_payment_methods with allow_redirects: 'never' to avoid
        // redirect-based payment methods that require return_url
        const paymentIntent = await stripe.paymentIntents.create({
          amount: 2500,
          currency: 'usd',
          customer: customer.id,
          payment_method: paymentMethod.id,
          automatic_payment_methods: {
            enabled: true,
            allow_redirects: 'never',
          },
        })
        createdPaymentIntentId = paymentIntent.id

        // Verify initial status
        expect(paymentIntent.status).toBe('requires_confirmation')

        // Confirm the payment intent using Stripe API directly
        const confirmedPaymentIntent =
          await stripe.paymentIntents.confirm(paymentIntent.id)

        // Verify status changed - should be 'succeeded' or 'processing' or 'requires_action'
        expect([
          'succeeded',
          'processing',
          'requires_action',
        ]).toContain(confirmedPaymentIntent.status)
      })
    })
  })
})

describe('Tax Calculations', () => {
  describe('createStripeTaxCalculationByPrice', () => {
    it('returns test calculation in test environment with synthetic response format', async () => {
      // When IS_TEST is true (which it is in the test environment),
      // the function returns a synthetic response without making real API calls.
      // We use minimal mock objects cast via unknown since the function
      // short-circuits before using most fields.
      const mockPrice = {
        id: 'price_test123',
        currency: 'usd',
      } as unknown as Parameters<
        typeof createStripeTaxCalculationByPrice
      >[0]['price']

      const mockProduct = {
        id: 'prod_test123',
      } as unknown as Parameters<
        typeof createStripeTaxCalculationByPrice
      >[0]['product']

      const mockBillingAddress = {
        address: {
          line1: '354 Oyster Point Blvd',
          city: 'South San Francisco',
          state: 'CA',
          postal_code: '94080',
          country: 'US',
        },
      } as unknown as Parameters<
        typeof createStripeTaxCalculationByPrice
      >[0]['billingAddress']

      const result = await createStripeTaxCalculationByPrice({
        price: mockPrice,
        billingAddress: mockBillingAddress,
        discountInclusiveAmount: 1000,
        product: mockProduct,
        livemode: false,
      })

      expect(result.id).toMatch(/^testtaxcalc_/)
      expect(result.tax_amount_exclusive).toBe(0)
    })
  })

  describe('createStripeTaxTransactionFromCalculation', () => {
    it('returns null when stripeTaxCalculationId is null', async () => {
      const result = await createStripeTaxTransactionFromCalculation({
        stripeTaxCalculationId: null,
        reference: 'test_reference_123',
        livemode: false,
      })

      expect(result).toBeNull()
    })

    it('returns null when stripeTaxCalculationId starts with notaxoverride_', async () => {
      const result = await createStripeTaxTransactionFromCalculation({
        stripeTaxCalculationId: 'notaxoverride_xyz',
        reference: 'test_reference_456',
        livemode: false,
      })

      expect(result).toBeNull()
    })
  })
})
