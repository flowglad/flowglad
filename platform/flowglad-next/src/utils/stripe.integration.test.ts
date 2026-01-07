import { afterEach, describe, expect, it } from 'vitest'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import {
  type BillingAddress,
  type Organization,
} from '@/db/schema/organizations'
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
  FeeCalculationType,
  InvoiceStatus,
  InvoiceType,
  PaymentMethodType,
  PriceType,
  StripeConnectContractType,
  SubscriptionItemType,
} from '@/types'
import core from '@/utils/core'
import {
  confirmPaymentIntent,
  confirmPaymentIntentForBillingRun,
  createAndConfirmPaymentIntentForBillingRun,
  createCustomerSessionForCheckout,
  createPaymentIntentForBillingRun,
  createPaymentIntentForInvoiceCheckoutSession,
  createStripeCustomer,
  createStripeTaxCalculationByPrice,
  createStripeTaxTransactionFromCalculation,
  getLatestChargeForPaymentIntent,
  getPaymentIntent,
  IntentMetadataType,
  updatePaymentIntent,
} from '@/utils/stripe'

/**
 * Creates a minimal Organization record for test purposes.
 * For MoR test mode, stripeAccountId is null (no Connect needed).
 */
const createTestOrganization = (
  overrides?: Partial<Organization.Record>
): Organization.Record => {
  const orgId = `org_${core.nanoid()}`
  return {
    id: orgId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    name: `Test Organization ${orgId}`,
    stripeAccountId: null, // No Connect account for test mode
    subdomainSlug: `test-org-${core.nanoid()}`,
    domain: null,
    countryId: 'country_us',
    logoURL: null,
    tagline: null,
    payoutsEnabled: false,
    onboardingStatus: BusinessOnboardingStatus.PartiallyOnboarded,
    feePercentage: '0.65',
    stripeConnectContractType:
      StripeConnectContractType.MerchantOfRecord,
    defaultCurrency: CurrencyCode.USD,
    billingAddress: null,
    contactEmail: null,
    featureFlags: {},
    allowMultipleSubscriptionsPerCustomer: false,
    externalId: `ext_${core.nanoid()}`,
    createdByCommit: null,
    updatedByCommit: null,
    position: 0,
    securitySalt: core.nanoid(),
    monthlyBillingVolumeFreeTier: 100000,
    upfrontProcessingCredits: 0,
    codebaseMarkdownHash: null,
    ...overrides,
  }
}

/**
 * Creates a minimal FeeCalculation record for test purposes.
 * Uses SubscriptionPayment type for billing run tests.
 */
const createTestFeeCalculation = (
  overrides?: Partial<FeeCalculation.SubscriptionRecord>
): FeeCalculation.SubscriptionRecord => {
  return {
    id: `fee_${core.nanoid()}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdByCommit: null,
    updatedByCommit: null,
    position: 0,
    organizationId: `org_${core.nanoid()}`,
    pricingModelId: `pm_${core.nanoid()}`,
    checkoutSessionId: null,
    purchaseId: null,
    discountId: null,
    priceId: null,
    paymentMethodType: PaymentMethodType.Card,
    discountAmountFixed: 0,
    paymentMethodFeeFixed: 0,
    baseAmount: 10000,
    internationalFeePercentage: '0',
    flowgladFeePercentage: '0.65',
    morSurchargePercentage: '0',
    billingAddress: {
      name: null,
      firstName: null,
      lastName: null,
      email: null,
      address: {
        name: null,
        line1: '123 Test St',
        line2: null,
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94105',
        country: 'US',
      },
      phone: null,
    },
    taxAmountFixed: 0,
    pretaxTotal: 10000,
    stripeTaxCalculationId: null,
    stripeTaxTransactionId: null,
    billingPeriodId: `bp_${core.nanoid()}`,
    currency: CurrencyCode.USD,
    type: FeeCalculationType.SubscriptionPayment,
    internalNotes: null,
    livemode: false,
    ...overrides,
  }
}

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

      // Action: call the application function
      const stripeCustomer = await createStripeCustomer({
        email: testEmail,
        name: testName,
        organizationId: testOrgId,
        livemode: false,
        createdBy: 'createCustomerBookkeeping',
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

      // Verify customer can be retrieved from Stripe (use direct API for verification)
      const stripe = getStripeTestClient()
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

      // Setup: create a Stripe customer first (using direct API for setup)
      const stripeCustomer = await createTestStripeCustomer({
        email: testEmail,
        name: testName,
      })
      createdCustomerId = stripeCustomer.id

      // Create a Customer record with the stripeCustomerId
      const customerRecord: Customer.Record = {
        id: `cust_${core.nanoid()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByCommit: null,
        updatedByCommit: null,
        position: 1,
        organizationId: `org_${core.nanoid()}`,
        email: testEmail,
        name: testName,
        invoiceNumberBase: 'INV-TEST',
        archived: false,
        stripeCustomerId: stripeCustomer.id,
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

      // Action: call the application function
      const clientSecret =
        await createCustomerSessionForCheckout(customerRecord)

      // Verify the client_secret is returned correctly
      expect(typeof clientSecret).toBe('string')
      expect(clientSecret).toContain('_secret_')
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
     * These tests verify the payment intent business logic by calling
     * application functions. Stripe API is only used for setup/teardown.
     */

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

        // Setup: Create a payment intent without a customer (using direct API)
        const paymentIntent = await stripe.paymentIntents.create({
          amount: 1000,
          currency: 'usd',
        })
        createdPaymentIntentId = paymentIntent.id

        // Setup: Create a customer to associate
        const customer = await createTestStripeCustomer()
        createdCustomerId = customer.id

        // Action: Update using the application function
        const updatedPaymentIntent = await updatePaymentIntent(
          paymentIntent.id,
          { customer: customer.id },
          false // livemode
        )

        // Verify customer is now associated
        expect(updatedPaymentIntent.customer).toBe(customer.id)
      })

      it('updates payment intent amount', async () => {
        const stripe = getStripeTestClient()

        // Setup: Create a payment intent with initial amount (using direct API)
        const paymentIntent = await stripe.paymentIntents.create({
          amount: 1000,
          currency: 'usd',
        })
        createdPaymentIntentId = paymentIntent.id

        // Action: Update using the application function
        const updatedPaymentIntent = await updatePaymentIntent(
          paymentIntent.id,
          { amount: 2000 },
          false // livemode
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

      it('retrieves payment intent by id', async () => {
        const stripe = getStripeTestClient()

        // Setup: Create a payment intent in test mode (using direct API)
        const paymentIntent = await stripe.paymentIntents.create({
          amount: 1500,
          currency: 'usd',
          metadata: {
            testIdentifier: `integration-test-${core.nanoid()}`,
          },
        })
        createdPaymentIntentId = paymentIntent.id

        // Action: Retrieve using the application function
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

        // Setup: Create a customer
        const customer = await createTestStripeCustomer()
        createdCustomerId = customer.id

        // Setup: Create a payment method and attach it to the customer
        const paymentMethod = await createTestPaymentMethod({
          stripeCustomerId: customer.id,
          livemode: false,
        })

        // Setup: Create a payment intent with the customer and payment method
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

        // Action: Confirm the payment intent using the application function
        const confirmedPaymentIntent = await confirmPaymentIntent(
          paymentIntent.id,
          false // livemode
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

  describe('Billing Run Payment Intents', () => {
    /**
     * These tests verify the billing run payment flow business logic
     * by calling the actual application functions which use the stripe() client.
     * The stripe() client uses real Stripe test API keys via the
     * STRIPE_INTEGRATION_TEST_MODE environment variable.
     */

    describe('createPaymentIntentForBillingRun', () => {
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

      it('creates payment intent with billing run metadata without confirming', async () => {
        // Setup: create customer with payment method
        const stripeCustomer = await createTestStripeCustomer()
        createdCustomerId = stripeCustomer.id

        const paymentMethod = await createTestPaymentMethod({
          stripeCustomerId: stripeCustomer.id,
          livemode: false,
        })

        const billingRunId = `br_${core.nanoid()}`
        const billingPeriodId = `bp_${core.nanoid()}`
        const amount = 10000
        const organization = createTestOrganization()
        const feeCalculation = createTestFeeCalculation({
          baseAmount: amount,
        })

        // Action: call the actual application function
        const paymentIntent = await createPaymentIntentForBillingRun({
          amount,
          currency: CurrencyCode.USD,
          stripeCustomerId: stripeCustomer.id,
          stripePaymentMethodId: paymentMethod.id,
          billingPeriodId,
          billingRunId,
          feeCalculation,
          organization,
          livemode: false,
        })

        createdPaymentIntentId = paymentIntent.id

        // Verify payment intent ID format
        expect(paymentIntent.id).toMatch(/^pi_/)

        // Verify status - should NOT be confirmed yet
        expect([
          'requires_confirmation',
          'requires_payment_method',
        ]).toContain(paymentIntent.status)

        // Verify billing run metadata
        expect(paymentIntent.metadata?.billingRunId).toBe(
          billingRunId
        )
        expect(paymentIntent.metadata?.billingPeriodId).toBe(
          billingPeriodId
        )
        expect(paymentIntent.metadata?.type).toBe(
          IntentMetadataType.BillingRun
        )

        // Verify customer association
        expect(paymentIntent.customer).toBe(stripeCustomer.id)

        // Verify payment method association
        expect(paymentIntent.payment_method).toBe(paymentMethod.id)

        // Verify amount
        expect(paymentIntent.amount).toBe(amount)

        // Verify fee metadata fields are present (buildFeeMetadata adds these)
        expect(paymentIntent.metadata?.flowglad_fee_percentage).toBe(
          '0.65'
        )
        expect(paymentIntent.metadata?.mor_surcharge_percentage).toBe(
          '0'
        )
        expect(
          paymentIntent.metadata?.international_fee_percentage
        ).toBe('0')
      })
    })

    describe('createAndConfirmPaymentIntentForBillingRun', () => {
      let createdCustomerId: string | undefined

      afterEach(async () => {
        // Note: Successfully confirmed payments don't need cancellation
        if (createdCustomerId) {
          await cleanupStripeTestData({
            stripeCustomerId: createdCustomerId,
          })
          createdCustomerId = undefined
        }
      })

      it('creates and confirms payment intent in single call for off-session payment', async () => {
        // Setup: create customer with payment method (use tok_visa for auto-success)
        const stripeCustomer = await createTestStripeCustomer()
        createdCustomerId = stripeCustomer.id

        const paymentMethod = await createTestPaymentMethod({
          stripeCustomerId: stripeCustomer.id,
          livemode: false,
        })

        const billingRunId = `br_${core.nanoid()}`
        const billingPeriodId = `bp_${core.nanoid()}`
        const amount = 5000
        const organization = createTestOrganization()
        const feeCalculation = createTestFeeCalculation({
          baseAmount: amount,
        })

        // Action: call the actual application function
        const paymentIntent =
          await createAndConfirmPaymentIntentForBillingRun({
            amount,
            currency: CurrencyCode.USD,
            stripeCustomerId: stripeCustomer.id,
            stripePaymentMethodId: paymentMethod.id,
            billingPeriodId,
            billingRunId,
            feeCalculation,
            organization,
            livemode: false,
          })

        // Verify payment intent ID format
        expect(paymentIntent.id).toMatch(/^pi_/)

        // Verify status is succeeded or processing (payment was confirmed)
        expect(['succeeded', 'processing']).toContain(
          paymentIntent.status
        )

        // Verify latest_charge is present (charge was created)
        expect(paymentIntent.latest_charge).not.toBeNull()

        // Verify billing run metadata
        expect(paymentIntent.metadata?.billingRunId).toBe(
          billingRunId
        )
        expect(paymentIntent.metadata?.billingPeriodId).toBe(
          billingPeriodId
        )
        expect(paymentIntent.metadata?.type).toBe(
          IntentMetadataType.BillingRun
        )
      })
    })

    describe('confirmPaymentIntentForBillingRun', () => {
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

      it('confirms an existing payment intent with off_session flag', async () => {
        // Setup: create customer with payment method
        const stripeCustomer = await createTestStripeCustomer()
        createdCustomerId = stripeCustomer.id

        const paymentMethod = await createTestPaymentMethod({
          stripeCustomerId: stripeCustomer.id,
          livemode: false,
        })

        const billingRunId = `br_${core.nanoid()}`
        const billingPeriodId = `bp_${core.nanoid()}`
        const amount = 7500
        const organization = createTestOrganization()
        const feeCalculation = createTestFeeCalculation({
          baseAmount: amount,
        })

        // Create unconfirmed payment intent using the app function
        const paymentIntent = await createPaymentIntentForBillingRun({
          amount,
          currency: CurrencyCode.USD,
          stripeCustomerId: stripeCustomer.id,
          stripePaymentMethodId: paymentMethod.id,
          billingPeriodId,
          billingRunId,
          feeCalculation,
          organization,
          livemode: false,
        })

        createdPaymentIntentId = paymentIntent.id

        // Verify initial status is unconfirmed
        expect([
          'requires_confirmation',
          'requires_payment_method',
        ]).toContain(paymentIntent.status)

        // Action: confirm the payment intent using the app function
        const confirmedPaymentIntent =
          await confirmPaymentIntentForBillingRun(
            paymentIntent.id,
            false // livemode
          )

        // Verify status changed to succeeded or processing
        expect(['succeeded', 'processing']).toContain(
          confirmedPaymentIntent.status
        )

        // Verify latest_charge is present
        expect(confirmedPaymentIntent.latest_charge).not.toBeNull()
      })

      it('fails when payment intent is already confirmed', async () => {
        // Setup: create customer with payment method
        const stripeCustomer = await createTestStripeCustomer()
        createdCustomerId = stripeCustomer.id

        const paymentMethod = await createTestPaymentMethod({
          stripeCustomerId: stripeCustomer.id,
          livemode: false,
        })

        const billingRunId = `br_${core.nanoid()}`
        const billingPeriodId = `bp_${core.nanoid()}`
        const amount = 3000
        const organization = createTestOrganization()
        const feeCalculation = createTestFeeCalculation({
          baseAmount: amount,
        })

        // Create and immediately confirm using the app function
        const paymentIntent =
          await createAndConfirmPaymentIntentForBillingRun({
            amount,
            currency: CurrencyCode.USD,
            stripeCustomerId: stripeCustomer.id,
            stripePaymentMethodId: paymentMethod.id,
            billingPeriodId,
            billingRunId,
            feeCalculation,
            organization,
            livemode: false,
          })

        // Action & Expectation: attempting to confirm again should fail
        await expect(
          confirmPaymentIntentForBillingRun(paymentIntent.id, false)
        ).rejects.toThrow()
      })
    })

    describe('getLatestChargeForPaymentIntent', () => {
      let createdCustomerId: string | undefined

      afterEach(async () => {
        if (createdCustomerId) {
          await cleanupStripeTestData({
            stripeCustomerId: createdCustomerId,
          })
          createdCustomerId = undefined
        }
      })

      it('returns charge object when payment intent has been charged', async () => {
        // Setup: create and confirm payment intent
        const stripeCustomer = await createTestStripeCustomer()
        createdCustomerId = stripeCustomer.id

        const paymentMethod = await createTestPaymentMethod({
          stripeCustomerId: stripeCustomer.id,
          livemode: false,
        })

        const billingRunId = `br_${core.nanoid()}`
        const billingPeriodId = `bp_${core.nanoid()}`
        const amount = 8500
        const organization = createTestOrganization()
        const feeCalculation = createTestFeeCalculation({
          baseAmount: amount,
        })

        // Create and confirm payment intent using the app function
        const paymentIntent =
          await createAndConfirmPaymentIntentForBillingRun({
            amount,
            currency: CurrencyCode.USD,
            stripeCustomerId: stripeCustomer.id,
            stripePaymentMethodId: paymentMethod.id,
            billingPeriodId,
            billingRunId,
            feeCalculation,
            organization,
            livemode: false,
          })

        // Get the latest charge using the app function
        const charge = await getLatestChargeForPaymentIntent(
          paymentIntent,
          false // livemode
        )

        // Verify charge is present
        expect(charge).not.toBeNull()

        // Verify charge ID format
        expect(charge!.id).toMatch(/^ch_/)

        // Verify charge amount matches payment intent amount
        expect(charge!.amount).toBe(amount)

        // Verify charge status
        expect(charge!.status).toBe('succeeded')

        // Verify payment_method_details is present
        expect(charge!.payment_method_details).not.toBeNull()
      })

      it('returns null when payment intent has no charge', async () => {
        // Setup: create payment intent without confirming
        const stripeCustomer = await createTestStripeCustomer()
        createdCustomerId = stripeCustomer.id

        const paymentMethod = await createTestPaymentMethod({
          stripeCustomerId: stripeCustomer.id,
          livemode: false,
        })

        const billingRunId = `br_${core.nanoid()}`
        const billingPeriodId = `bp_${core.nanoid()}`
        const amount = 4000
        const organization = createTestOrganization()
        const feeCalculation = createTestFeeCalculation({
          baseAmount: amount,
        })

        // Create unconfirmed payment intent using the app function
        const paymentIntent = await createPaymentIntentForBillingRun({
          amount,
          currency: CurrencyCode.USD,
          stripeCustomerId: stripeCustomer.id,
          stripePaymentMethodId: paymentMethod.id,
          billingPeriodId,
          billingRunId,
          feeCalculation,
          organization,
          livemode: false,
        })

        // Cleanup the unconfirmed payment intent
        await cleanupStripeTestData({
          stripePaymentIntentId: paymentIntent.id,
        })

        // Get the latest charge - should be null for unconfirmed payment intent
        const charge = await getLatestChargeForPaymentIntent(
          paymentIntent,
          false // livemode
        )

        // Verify charge is null
        expect(charge).toBeNull()
      })

      it('retrieves expanded charge when latest_charge is a string id', async () => {
        const stripe = getStripeTestClient()

        // Setup: create and confirm payment intent
        const stripeCustomer = await createTestStripeCustomer()
        createdCustomerId = stripeCustomer.id

        const paymentMethod = await createTestPaymentMethod({
          stripeCustomerId: stripeCustomer.id,
          livemode: false,
        })

        const billingRunId = `br_${core.nanoid()}`
        const billingPeriodId = `bp_${core.nanoid()}`
        const amount = 6000
        const organization = createTestOrganization()
        const feeCalculation = createTestFeeCalculation({
          baseAmount: amount,
        })

        // Create and confirm payment intent using the app function
        const paymentIntent =
          await createAndConfirmPaymentIntentForBillingRun({
            amount,
            currency: CurrencyCode.USD,
            stripeCustomerId: stripeCustomer.id,
            stripePaymentMethodId: paymentMethod.id,
            billingPeriodId,
            billingRunId,
            feeCalculation,
            organization,
            livemode: false,
          })

        // Retrieve payment intent without expansion to get string charge id
        const retrievedPaymentIntent =
          await stripe.paymentIntents.retrieve(paymentIntent.id)

        // Verify latest_charge is a string (not expanded by default)
        expect(typeof retrievedPaymentIntent.latest_charge).toBe(
          'string'
        )

        // Use the app function to get the charge - it should handle the string id
        const charge = await getLatestChargeForPaymentIntent(
          retrievedPaymentIntent,
          false // livemode
        )

        // Verify we got a full Charge object
        expect(charge).not.toBeNull()
        expect(typeof charge).toBe('object')
        expect(charge!.id).toMatch(/^ch_/)

        // Verify payment_method_details is present (proves it's a full object)
        expect(charge!.payment_method_details).not.toBeNull()
      })
    })
  })

  describe('Invoice Payment Intents', () => {
    /**
     * Creates a minimal Invoice.StandaloneInvoiceRecord for test purposes.
     */
    const createTestInvoice = (
      overrides?: Partial<Invoice.StandaloneInvoiceRecord>
    ): Invoice.StandaloneInvoiceRecord => {
      const invoiceId = `inv_${core.nanoid()}`
      return {
        id: invoiceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByCommit: null,
        updatedByCommit: null,
        position: 0,
        organizationId: `org_${core.nanoid()}`,
        customerId: `cust_${core.nanoid()}`,
        invoiceNumber: `INV-${core.nanoid()}`,
        invoiceDate: Date.now(),
        dueDate: null,
        status: InvoiceStatus.Draft,
        type: InvoiceType.Standalone,
        purchaseId: null,
        billingPeriodId: null,
        subscriptionId: null,
        billingRunId: null,
        billingPeriodStartDate: null,
        billingPeriodEndDate: null,
        ownerMembershipId: null,
        pdfURL: null,
        receiptPdfURL: null,
        memo: null,
        bankPaymentOnly: false,
        currency: CurrencyCode.USD,
        stripePaymentIntentId: null,
        stripeTaxCalculationId: null,
        stripeTaxTransactionId: null,
        taxType: null,
        taxCountry: null,
        subtotal: null,
        taxAmount: null,
        taxState: null,
        taxRatePercentage: null,
        applicationFee: null,
        livemode: false,
        pricingModelId: `pm_${core.nanoid()}`,
        ...overrides,
      }
    }

    /**
     * Creates a minimal InvoiceLineItem.StaticRecord for test purposes.
     */
    const createTestInvoiceLineItem = (
      invoiceId: string,
      overrides?: Partial<InvoiceLineItem.StaticRecord>
    ): InvoiceLineItem.StaticRecord => {
      return {
        id: `inv_li_${core.nanoid()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByCommit: null,
        updatedByCommit: null,
        position: 0,
        invoiceId,
        quantity: 1,
        priceId: null,
        description: 'Test line item',
        price: 5000,
        billingRunId: null,
        ledgerAccountId: null,
        ledgerAccountCredit: null,
        type: SubscriptionItemType.Static,
        pricingModelId: `pm_${core.nanoid()}`,
        livemode: false,
        ...overrides,
      }
    }

    /**
     * Creates a minimal CheckoutSession.InvoiceRecord for test purposes.
     */
    const createTestInvoiceCheckoutSession = (
      invoiceId: string,
      organizationId: string,
      overrides?: Partial<CheckoutSession.InvoiceRecord>
    ): CheckoutSession.InvoiceRecord => {
      const sessionId = `chckt_session_${core.nanoid()}`
      return {
        id: sessionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByCommit: null,
        updatedByCommit: null,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Invoice,
        organizationId,
        priceId: null,
        quantity: 1,
        purchaseId: null,
        invoiceId,
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

    /**
     * Creates a FeeCalculation.CheckoutSessionRecord for test purposes.
     */
    const createTestCheckoutSessionFeeCalculation = (
      overrides?: Partial<FeeCalculation.CheckoutSessionRecord>
    ): FeeCalculation.CheckoutSessionRecord => {
      return {
        id: `fee_${core.nanoid()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByCommit: null,
        updatedByCommit: null,
        position: 0,
        organizationId: `org_${core.nanoid()}`,
        pricingModelId: `pm_${core.nanoid()}`,
        checkoutSessionId: `chckt_session_${core.nanoid()}`,
        purchaseId: null,
        discountId: null,
        priceId: null,
        paymentMethodType: PaymentMethodType.Card,
        discountAmountFixed: 0,
        paymentMethodFeeFixed: 0,
        baseAmount: 10000,
        internationalFeePercentage: '0',
        flowgladFeePercentage: '0.65',
        morSurchargePercentage: '0',
        billingAddress: {
          name: null,
          firstName: null,
          lastName: null,
          email: null,
          address: {
            name: null,
            line1: '123 Test St',
            line2: null,
            city: 'San Francisco',
            state: 'CA',
            postal_code: '94105',
            country: 'US',
          },
          phone: null,
        },
        taxAmountFixed: 0,
        pretaxTotal: 10000,
        stripeTaxCalculationId: null,
        stripeTaxTransactionId: null,
        billingPeriodId: null,
        currency: CurrencyCode.USD,
        type: FeeCalculationType.CheckoutSessionPayment,
        internalNotes: null,
        livemode: false,
        ...overrides,
      }
    }

    describe('createPaymentIntentForInvoiceCheckoutSession', () => {
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

      it('creates payment intent with correct total from line items, metadata includes checkoutSessionId and type', async () => {
        // Setup: create Stripe customer
        const stripeCustomer = await createTestStripeCustomer({
          email: `test+${core.nanoid()}@flowglad-integration.com`,
          name: `Invoice Test Customer ${core.nanoid()}`,
        })
        createdCustomerId = stripeCustomer.id

        // Setup: create test data
        const organization = createTestOrganization()
        const invoice = createTestInvoice({
          organizationId: organization.id,
        })
        const checkoutSession = createTestInvoiceCheckoutSession(
          invoice.id,
          organization.id
        )

        // Define invoice line items with different prices and quantities
        const lineItem1 = createTestInvoiceLineItem(invoice.id, {
          price: 5000, // $50.00
          quantity: 2,
        })
        const lineItem2 = createTestInvoiceLineItem(invoice.id, {
          price: 3000, // $30.00
          quantity: 1,
        })
        const invoiceLineItems = [lineItem1, lineItem2]
        const expectedTotal =
          lineItem1.price * lineItem1.quantity +
          lineItem2.price * lineItem2.quantity // $130.00 = 13000 cents

        // Action: call the application function
        const paymentIntent =
          await createPaymentIntentForInvoiceCheckoutSession({
            invoice,
            invoiceLineItems,
            organization,
            stripeCustomerId: stripeCustomer.id,
            checkoutSession,
          })

        createdPaymentIntentId = paymentIntent.id

        // Verify payment intent ID format
        expect(paymentIntent.id).toMatch(/^pi_/)

        // Verify amount equals sum of (lineItem.price * lineItem.quantity)
        expect(paymentIntent.amount).toBe(expectedTotal)

        // Verify currency matches invoice currency
        expect(paymentIntent.currency).toBe('usd')

        // Verify customer equals stripeCustomerId
        expect(paymentIntent.customer).toBe(stripeCustomer.id)

        // Verify metadata.checkoutSessionId matches checkoutSession.id
        expect(paymentIntent.metadata?.checkoutSessionId).toBe(
          checkoutSession.id
        )

        // Verify metadata.type is 'checkout_session'
        expect(paymentIntent.metadata?.type).toBe(
          IntentMetadataType.CheckoutSession
        )

        // Verify livemode is false
        expect(paymentIntent.livemode).toBe(false)
      })

      it('creates payment intent with feeCalculation metadata fields when feeCalculation is provided', async () => {
        // Setup: create Stripe customer
        const stripeCustomer = await createTestStripeCustomer({
          email: `test+${core.nanoid()}@flowglad-integration.com`,
          name: `Invoice Fee Test Customer ${core.nanoid()}`,
        })
        createdCustomerId = stripeCustomer.id

        // Setup: create test data with fee calculation
        const organization = createTestOrganization()
        const invoice = createTestInvoice({
          organizationId: organization.id,
        })
        const checkoutSession = createTestInvoiceCheckoutSession(
          invoice.id,
          organization.id
        )

        // Fee calculation values
        const baseAmount = 10000 // $100.00
        const discountAmountFixed = 1000 // $10.00 discount
        const paymentMethodFeeFixed = 300 // $3.00 payment method fee
        const taxAmountFixed = 800 // $8.00 tax

        // Total due = baseAmount - discount + tax
        // (paymentMethodFeeFixed is NOT included in total due)
        // = 10000 - 1000 + 800 = 9800 cents
        const expectedTotalDue =
          baseAmount - discountAmountFixed + taxAmountFixed

        const feeCalculation =
          createTestCheckoutSessionFeeCalculation({
            organizationId: organization.id,
            checkoutSessionId: checkoutSession.id,
            baseAmount,
            discountAmountFixed,
            paymentMethodFeeFixed,
            taxAmountFixed,
            pretaxTotal:
              baseAmount -
              discountAmountFixed +
              paymentMethodFeeFixed,
          })

        // Line items are ignored when feeCalculation is provided
        const invoiceLineItems: InvoiceLineItem.Record[] = []

        // Action: call the application function with feeCalculation
        const paymentIntent =
          await createPaymentIntentForInvoiceCheckoutSession({
            invoice,
            invoiceLineItems,
            organization,
            stripeCustomerId: stripeCustomer.id,
            checkoutSession,
            feeCalculation,
          })

        createdPaymentIntentId = paymentIntent.id

        // Verify payment intent ID format
        expect(paymentIntent.id).toMatch(/^pi_/)

        // Verify amount equals calculateTotalDueAmount(feeCalculation)
        expect(paymentIntent.amount).toBe(expectedTotalDue)

        // Verify fee metadata fields are present (buildFeeMetadata adds these)
        // Note: buildFeeMetadata only includes fee percentages and tax amount, not base amounts
        expect(paymentIntent.metadata?.flowglad_fee_percentage).toBe(
          '0.65'
        )
        expect(
          paymentIntent.metadata?.international_fee_percentage
        ).toBe('0')
        expect(paymentIntent.metadata?.mor_surcharge_percentage).toBe(
          '0'
        )
        expect(paymentIntent.metadata?.tax_amount).toBe(
          String(taxAmountFixed)
        )

        // application_fee_amount is only set in livemode, so it should be null in test mode
        expect(paymentIntent.application_fee_amount).toBeNull()

        // Verify livemode is false
        expect(paymentIntent.livemode).toBe(false)
      })

      it('applies bank-only payment methods when invoice.bankPaymentOnly is true, resulting in us_bank_account in payment_method_types', async () => {
        // Setup: create Stripe customer
        const stripeCustomer = await createTestStripeCustomer({
          email: `test+${core.nanoid()}@flowglad-integration.com`,
          name: `Bank Only Test Customer ${core.nanoid()}`,
        })
        createdCustomerId = stripeCustomer.id

        // Setup: create test data with bankPaymentOnly = true
        const organization = createTestOrganization()
        const invoice = createTestInvoice({
          organizationId: organization.id,
          bankPaymentOnly: true,
        })
        const checkoutSession = createTestInvoiceCheckoutSession(
          invoice.id,
          organization.id
        )

        const invoiceTotal = 10000 // $100.00
        const lineItem = createTestInvoiceLineItem(invoice.id, {
          price: invoiceTotal,
          quantity: 1,
        })
        const invoiceLineItems = [lineItem]

        // Action: call the application function
        const paymentIntent =
          await createPaymentIntentForInvoiceCheckoutSession({
            invoice,
            invoiceLineItems,
            organization,
            stripeCustomerId: stripeCustomer.id,
            checkoutSession,
          })

        createdPaymentIntentId = paymentIntent.id

        // Verify payment intent ID format
        expect(paymentIntent.id).toMatch(/^pi_/)

        // Verify payment_method_types includes 'us_bank_account'
        expect(paymentIntent.payment_method_types).toContain(
          'us_bank_account'
        )

        // Verify amount is correct
        expect(paymentIntent.amount).toBe(invoiceTotal)

        // Verify customer is correct
        expect(paymentIntent.customer).toBe(stripeCustomer.id)

        // Verify metadata
        expect(paymentIntent.metadata?.checkoutSessionId).toBe(
          checkoutSession.id
        )
        expect(paymentIntent.metadata?.type).toBe(
          IntentMetadataType.CheckoutSession
        )

        // Verify livemode is false
        expect(paymentIntent.livemode).toBe(false)
      })
    })
  })
})

/**
 * Creates a minimal Price record for test purposes.
 * Uses SinglePaymentRecord since that's the simplest type.
 */
const createTestPrice = (
  overrides?: Partial<Price.SinglePaymentRecord>
): Price.SinglePaymentRecord => {
  return {
    id: `price_${core.nanoid()}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdByCommit: null,
    updatedByCommit: null,
    position: 0,
    productId: `prod_${core.nanoid()}`,
    pricingModelId: `pm_${core.nanoid()}`,
    name: 'Test Price',
    type: PriceType.SinglePayment,
    unitPrice: 10000,
    currency: CurrencyCode.USD,
    isDefault: true,
    active: true,
    externalId: `ext_${core.nanoid()}`,
    livemode: false,
    slug: null,
    ...overrides,
  }
}

/**
 * Creates a minimal Product record for test purposes.
 */
const createTestProduct = (
  overrides?: Partial<Product.Record>
): Product.Record => {
  return {
    id: `prod_${core.nanoid()}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdByCommit: null,
    updatedByCommit: null,
    position: 0,
    organizationId: `org_${core.nanoid()}`,
    name: 'Test Product',
    description: 'A test product',
    singularQuantityLabel: null,
    pluralQuantityLabel: null,
    active: true,
    imageURL: null,
    externalId: `ext_${core.nanoid()}`,
    livemode: false,
    default: false,
    slug: null,
    pricingModelId: `pm_${core.nanoid()}`,
    ...overrides,
  }
}

/**
 * Creates a test BillingAddress for US-based tax calculations.
 */
const createTestBillingAddress = (): BillingAddress => {
  return {
    name: 'Test Customer',
    firstName: 'Test',
    lastName: 'Customer',
    email: 'test@example.com',
    address: {
      name: 'Test Customer',
      line1: '354 Oyster Point Blvd',
      line2: null,
      city: 'South San Francisco',
      state: 'CA',
      postal_code: '94080',
      country: 'US',
    },
    phone: null,
  }
}

describeIfStripeKey('Tax Calculations', () => {
  describe('createStripeTaxCalculationByPrice', () => {
    it('creates a tax calculation for a US address and returns calculation id and tax amount', async () => {
      const price = createTestPrice({
        unitPrice: 10000, // $100.00
        currency: CurrencyCode.USD,
      })
      const product = createTestProduct()
      const billingAddress = createTestBillingAddress()

      // Action: call the application function
      const result = await createStripeTaxCalculationByPrice({
        price,
        billingAddress,
        discountInclusiveAmount: 10000,
        product,
        livemode: false,
      })

      // Verify we got a real Stripe tax calculation ID (not the test prefix)
      expect(result.id).toMatch(/^taxcalc_/)

      // Verify tax_amount_exclusive is a number (could be 0 or positive depending on Stripe Tax settings)
      expect(typeof result.tax_amount_exclusive).toBe('number')
      expect(result.tax_amount_exclusive).toBeGreaterThanOrEqual(0)
    })
  })

  describe('createStripeTaxTransactionFromCalculation', () => {
    it('returns null when stripeTaxCalculationId is null', async () => {
      // Action: call the application function with null
      const result = await createStripeTaxTransactionFromCalculation({
        stripeTaxCalculationId: null,
        reference: `test_reference_${core.nanoid()}`,
        livemode: false,
      })

      // Verify null is returned (business logic guard)
      expect(result).toBeNull()
    })

    it('returns null when stripeTaxCalculationId starts with notaxoverride_', async () => {
      // Action: call the application function with notaxoverride prefix
      const result = await createStripeTaxTransactionFromCalculation({
        stripeTaxCalculationId: 'notaxoverride_xyz',
        reference: `test_reference_${core.nanoid()}`,
        livemode: false,
      })

      // Verify null is returned (business logic guard for tax-exempt scenarios)
      expect(result).toBeNull()
    })

    it('creates a tax transaction from a valid calculation', async () => {
      // Setup: first create a tax calculation
      const price = createTestPrice({
        unitPrice: 5000, // $50.00
        currency: CurrencyCode.USD,
      })
      const product = createTestProduct()
      const billingAddress = createTestBillingAddress()

      const calculation = await createStripeTaxCalculationByPrice({
        price,
        billingAddress,
        discountInclusiveAmount: 5000,
        product,
        livemode: false,
      })

      // Action: create a tax transaction from the calculation
      const reference = `test_txn_${core.nanoid()}`
      const result = await createStripeTaxTransactionFromCalculation({
        stripeTaxCalculationId: calculation.id,
        reference,
        livemode: false,
      })

      // Verify we got a real tax transaction
      expect(result).not.toBeNull()
      expect(result!.id).toMatch(/^tax_/)
      expect(result!.reference).toBe(reference)
    })
  })
})
