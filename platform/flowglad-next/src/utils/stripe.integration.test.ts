import { afterEach, describe, expect, it } from 'vitest'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import {
  cleanupStripeTestData,
  createTestPaymentMethod,
  createTestStripeCustomer,
  describeIfStripeKey,
  getStripeTestClient,
} from '@/test/stripeIntegrationHelpers'
import {
  BusinessOnboardingStatus,
  CheckoutSessionStatus,
  CheckoutSessionType,
  CurrencyCode,
  PriceType,
  StripeConnectContractType,
} from '@/types'
import core from '@/utils/core'
import {
  confirmPaymentIntent,
  createCustomerSessionForCheckout,
  createPaymentIntentForCheckoutSession,
  getPaymentIntent,
  IntentMetadataType,
  updatePaymentIntent,
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
     * Creates a minimal Organization record for test purposes.
     * For MoR organizations in test mode, stripeAccountId is not required.
     */
    const createTestOrganization = (
      overrides?: Partial<Organization.Record>
    ): Organization.Record => {
      const orgId = `org_${core.nanoid()}`
      return {
        id: orgId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByCommit: null,
        updatedByCommit: null,
        position: 0,
        name: `Test Organization ${core.nanoid()}`,
        stripeAccountId: null,
        stripeConnectContractType:
          StripeConnectContractType.MerchantOfRecord,
        countryId: `country_${core.nanoid()}`,
        feePercentage: '2.9',
        payoutsEnabled: false,
        logoURL: null,
        tagline: null,
        subdomainSlug: null,
        onboardingStatus: BusinessOnboardingStatus.PartiallyOnboarded,
        defaultCurrency: CurrencyCode.USD,
        domain: null,
        billingAddress: null,
        contactEmail: null,
        allowMultipleSubscriptionsPerCustomer: false,
        featureFlags: {},
        externalId: null,
        securitySalt: core.nanoid(),
        monthlyBillingVolumeFreeTier: 100000,
        upfrontProcessingCredits: 0,
        codebaseMarkdownHash: null,
        ...overrides,
      }
    }

    /**
     * Creates a minimal SinglePayment Price record for test purposes.
     */
    const createTestPrice = (
      overrides?: Partial<Price.SinglePaymentRecord>
    ): Price.SinglePaymentRecord => {
      const priceId = `price_${core.nanoid()}`
      return {
        id: priceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByCommit: null,
        updatedByCommit: null,
        position: 0,
        name: `Test Price ${core.nanoid()}`,
        unitPrice: 5000,
        currency: CurrencyCode.USD,
        productId: `prod_${core.nanoid()}`,
        isDefault: true,
        active: true,
        livemode: false,
        type: PriceType.SinglePayment,
        slug: `test-price-${core.nanoid()}`,
        externalId: null,
        pricingModelId: `pm_${core.nanoid()}`,
        ...overrides,
      }
    }

    /**
     * Creates a minimal Product record for test purposes.
     */
    const createTestProduct = (
      overrides?: Partial<Product.Record>
    ): Product.Record => {
      const productId = `prod_${core.nanoid()}`
      return {
        id: productId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByCommit: null,
        updatedByCommit: null,
        position: 0,
        name: `Test Product ${core.nanoid()}`,
        description: 'A test product for integration tests',
        organizationId: `org_${core.nanoid()}`,
        active: true,
        livemode: false,
        singularQuantityLabel: null,
        pluralQuantityLabel: null,
        slug: `test-product-${core.nanoid()}`,
        externalId: null,
        imageURL: null,
        default: false,
        pricingModelId: `pm_${core.nanoid()}`,
        ...overrides,
      }
    }

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

    describe('createPaymentIntentForCheckoutSession', () => {
      let createdPaymentIntentId: string | undefined

      afterEach(async () => {
        if (createdPaymentIntentId) {
          await cleanupStripeTestData({
            stripePaymentIntentId: createdPaymentIntentId,
          })
          createdPaymentIntentId = undefined
        }
      })

      it('creates a payment intent with correct amount, currency, and metadata for MoR organization in test mode', async () => {
        const organization = createTestOrganization()
        const price = createTestPrice({ unitPrice: 5000 })
        const product = createTestProduct({
          organizationId: organization.id,
        })
        const checkoutSession = createTestCheckoutSession({
          organizationId: organization.id,
          priceId: price.id,
          quantity: 2,
        })

        const paymentIntent =
          await createPaymentIntentForCheckoutSession({
            price,
            organization,
            product,
            checkoutSession,
          })

        createdPaymentIntentId = paymentIntent.id

        // Verify payment intent ID format
        expect(paymentIntent.id).toMatch(/^pi_/)

        // Verify amount equals price * quantity (5000 * 2 = 10000 cents)
        expect(paymentIntent.amount).toBe(10000)

        // Verify currency matches price currency
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
        expect(paymentIntent.metadata?.type).toBe(
          IntentMetadataType.CheckoutSession
        )

        // Verify livemode is false
        expect(paymentIntent.livemode).toBe(false)

        // Verify no transfer_data or application_fee in test mode
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

        // Update the payment intent with the customer
        const updatedPaymentIntent = await updatePaymentIntent(
          paymentIntent.id,
          { customer: customer.id },
          false
        )

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

        // Update the payment intent with new amount
        const updatedPaymentIntent = await updatePaymentIntent(
          paymentIntent.id,
          { amount: 2000 },
          false
        )

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

      it('retrieves payment intent by id, falling back to test mode', async () => {
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

        // Retrieve using getPaymentIntent (which tries live then test)
        const retrievedPaymentIntent = await getPaymentIntent(
          paymentIntent.id
        )

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
        const paymentIntent = await stripe.paymentIntents.create({
          amount: 2500,
          currency: 'usd',
          customer: customer.id,
          payment_method: paymentMethod.id,
        })
        createdPaymentIntentId = paymentIntent.id

        // Verify initial status
        expect(paymentIntent.status).toBe('requires_confirmation')

        // Confirm the payment intent
        const confirmedPaymentIntent = await confirmPaymentIntent(
          paymentIntent.id,
          false
        )

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
