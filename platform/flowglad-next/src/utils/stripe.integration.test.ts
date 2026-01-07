import Stripe from 'stripe'
import { afterEach, describe, expect, it } from 'vitest'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import {
  type BillingAddress,
  type Organization,
} from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import type { Purchase } from '@/db/schema/purchases'
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
  PaymentMethodType,
  PriceType,
  StripeConnectContractType,
} from '@/types'
import core from '@/utils/core'
import {
  confirmPaymentIntentForBillingRun,
  createAndConfirmPaymentIntentForBillingRun,
  createCustomerSessionForCheckout,
  createPaymentIntentForBillingRun,
  createSetupIntentForCheckoutSession,
  createStripeCustomer,
  createStripeTaxCalculationByPrice,
  createStripeTaxTransactionFromCalculation,
  dateFromStripeTimestamp,
  getLatestChargeForPaymentIntent,
  getSetupIntent,
  getStripeCharge,
  getStripePaymentMethod,
  IntentMetadataType,
  listRefundsForCharge,
  paymentMethodFromStripeCharge,
  refundPayment,
  updateSetupIntent,
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

  describe('Setup Intents', () => {
    /**
     * Creates a minimal CheckoutSession record for setup intent tests.
     */
    const createTestCheckoutSessionForSetupIntent = (
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

    /**
     * Creates a minimal Purchase record for setup intent tests.
     * Only bankPaymentOnly is used by createSetupIntentForCheckoutSession.
     */
    const createTestPurchase = (overrides?: {
      bankPaymentOnly?: boolean
    }): Purchase.Record => {
      return {
        bankPaymentOnly: overrides?.bankPaymentOnly ?? false,
      } as Purchase.Record
    }

    /**
     * Creates a minimal Customer record for setup intent tests.
     */
    const createTestCustomerRecord = (
      overrides?: Partial<Customer.Record>
    ): Customer.Record => {
      return {
        id: `cust_${core.nanoid()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByCommit: null,
        updatedByCommit: null,
        position: 0,
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
        ...overrides,
      }
    }

    describe('createSetupIntentForCheckoutSession', () => {
      let createdSetupIntentId: string | undefined
      let createdCustomerId: string | undefined

      afterEach(async () => {
        if (createdSetupIntentId) {
          await cleanupStripeTestData({
            stripeSetupIntentId: createdSetupIntentId,
          })
          createdSetupIntentId = undefined
        }
        if (createdCustomerId) {
          await cleanupStripeTestData({
            stripeCustomerId: createdCustomerId,
          })
          createdCustomerId = undefined
        }
      })

      it('creates a setup intent with automatic_payment_methods for Platform organization', async () => {
        const organization = createTestOrganization({
          stripeConnectContractType:
            StripeConnectContractType.Platform,
        })
        const checkoutSession =
          createTestCheckoutSessionForSetupIntent()

        const setupIntent = await createSetupIntentForCheckoutSession(
          {
            organization,
            checkoutSession,
          }
        )

        createdSetupIntentId = setupIntent.id

        // Verify setup intent ID format
        expect(setupIntent.id).toMatch(/^seti_/)

        // Verify status is requires_payment_method
        expect(setupIntent.status).toBe('requires_payment_method')

        // Verify client_secret is present
        expect(typeof setupIntent.client_secret).toBe('string')
        expect(setupIntent.client_secret).toContain('_secret_')

        // Verify metadata contains checkoutSessionId and type
        expect(setupIntent.metadata?.checkoutSessionId).toBe(
          checkoutSession.id
        )
        expect(setupIntent.metadata?.type).toBe(
          IntentMetadataType.CheckoutSession
        )

        // Verify livemode is false
        expect(setupIntent.livemode).toBe(false)
      })

      it('creates a setup intent without explicit automatic_payment_methods for MoR organization', async () => {
        const organization = createTestOrganization({
          stripeConnectContractType:
            StripeConnectContractType.MerchantOfRecord,
        })
        const checkoutSession =
          createTestCheckoutSessionForSetupIntent()

        const setupIntent = await createSetupIntentForCheckoutSession(
          {
            organization,
            checkoutSession,
          }
        )

        createdSetupIntentId = setupIntent.id

        // Verify setup intent ID format
        expect(setupIntent.id).toMatch(/^seti_/)

        // Verify status is requires_payment_method (standard initial status)
        expect(setupIntent.status).toBe('requires_payment_method')

        // Verify metadata is correctly set
        expect(setupIntent.metadata?.checkoutSessionId).toBe(
          checkoutSession.id
        )
        expect(setupIntent.metadata?.type).toBe(
          IntentMetadataType.CheckoutSession
        )

        // Verify livemode is false
        expect(setupIntent.livemode).toBe(false)
      })

      it('creates a setup intent with bank-only payment methods when purchase.bankPaymentOnly is true', async () => {
        const organization = createTestOrganization()
        const checkoutSession =
          createTestCheckoutSessionForSetupIntent()
        const purchase = createTestPurchase({
          bankPaymentOnly: true,
        })

        const setupIntent = await createSetupIntentForCheckoutSession(
          {
            organization,
            checkoutSession,
            purchase,
          }
        )

        createdSetupIntentId = setupIntent.id

        // Verify setup intent ID format
        expect(setupIntent.id).toMatch(/^seti_/)

        // Verify payment_method_types includes us_bank_account
        expect(setupIntent.payment_method_types).toContain(
          'us_bank_account'
        )

        // Verify payment_method_types does NOT include card
        expect(setupIntent.payment_method_types).not.toContain('card')

        // Verify livemode is false
        expect(setupIntent.livemode).toBe(false)
      })

      it('creates a setup intent with customer when customer has stripeCustomerId', async () => {
        // Create a real Stripe customer first
        const stripeCustomer = await createTestStripeCustomer()
        createdCustomerId = stripeCustomer.id

        const organization = createTestOrganization()
        const checkoutSession =
          createTestCheckoutSessionForSetupIntent()
        const customer = createTestCustomerRecord({
          stripeCustomerId: stripeCustomer.id,
        })

        const setupIntent = await createSetupIntentForCheckoutSession(
          {
            organization,
            checkoutSession,
            customer,
          }
        )

        createdSetupIntentId = setupIntent.id

        // Verify setup intent ID format
        expect(setupIntent.id).toMatch(/^seti_/)

        // Verify customer is associated
        expect(setupIntent.customer).toBe(stripeCustomer.id)

        // Verify livemode is false
        expect(setupIntent.livemode).toBe(false)
      })
    })

    describe('getSetupIntent', () => {
      let createdSetupIntentId: string | undefined

      afterEach(async () => {
        if (createdSetupIntentId) {
          await cleanupStripeTestData({
            stripeSetupIntentId: createdSetupIntentId,
          })
          createdSetupIntentId = undefined
        }
      })

      it('retrieves setup intent by id, falling back to test mode', async () => {
        const organization = createTestOrganization()
        const checkoutSession =
          createTestCheckoutSessionForSetupIntent()

        // Create setup intent using the app function
        const setupIntent = await createSetupIntentForCheckoutSession(
          {
            organization,
            checkoutSession,
          }
        )
        createdSetupIntentId = setupIntent.id

        // Retrieve using the app function (which tries live then test)
        const retrievedSetupIntent = await getSetupIntent(
          setupIntent.id
        )

        // Verify the retrieved setup intent matches
        expect(retrievedSetupIntent.id).toBe(setupIntent.id)
        expect(retrievedSetupIntent.metadata?.checkoutSessionId).toBe(
          checkoutSession.id
        )
        expect(retrievedSetupIntent.livemode).toBe(false)
      })
    })

    describe('updateSetupIntent', () => {
      let createdSetupIntentId: string | undefined
      let createdCustomerId: string | undefined

      afterEach(async () => {
        if (createdSetupIntentId) {
          await cleanupStripeTestData({
            stripeSetupIntentId: createdSetupIntentId,
          })
          createdSetupIntentId = undefined
        }
        if (createdCustomerId) {
          await cleanupStripeTestData({
            stripeCustomerId: createdCustomerId,
          })
          createdCustomerId = undefined
        }
      })

      it('updates setup intent to associate with customer', async () => {
        const organization = createTestOrganization()
        const checkoutSession =
          createTestCheckoutSessionForSetupIntent()

        // Create setup intent without customer
        const setupIntent = await createSetupIntentForCheckoutSession(
          {
            organization,
            checkoutSession,
          }
        )
        createdSetupIntentId = setupIntent.id

        // Verify no customer initially
        expect(setupIntent.customer).toBeNull()

        // Create a real Stripe customer
        const stripeCustomer = await createTestStripeCustomer()
        createdCustomerId = stripeCustomer.id

        // Update the setup intent with the customer using the app function
        const updatedSetupIntent = await updateSetupIntent(
          setupIntent.id,
          { customer: stripeCustomer.id },
          false // livemode
        )

        // Verify customer is now associated
        expect(updatedSetupIntent.customer).toBe(stripeCustomer.id)
      })
    })
  })

  describe('Refunds', () => {
    /**
     * These tests verify refund business logic using application functions.
     * All assertions are against app functions (refundPayment, listRefundsForCharge).
     * Stripe API is only used for setup (creating customers/payment methods).
     */

    /**
     * Helper to create a succeeded payment using application functions.
     * Returns the payment intent and charge ID for refund testing.
     */
    const createSucceededBillingPayment = async (
      amount: number
    ): Promise<{
      paymentIntentId: string
      chargeId: string
      customerId: string
    }> => {
      const stripeCustomer = await createTestStripeCustomer()
      const paymentMethod = await createTestPaymentMethod({
        stripeCustomerId: stripeCustomer.id,
        livemode: false,
      })

      const organization = createTestOrganization()
      const feeCalculation = createTestFeeCalculation({
        baseAmount: amount,
      })

      // Use the application function to create and confirm payment
      const paymentIntent =
        await createAndConfirmPaymentIntentForBillingRun({
          amount,
          currency: CurrencyCode.USD,
          stripeCustomerId: stripeCustomer.id,
          stripePaymentMethodId: paymentMethod.id,
          billingPeriodId: `bp_${core.nanoid()}`,
          billingRunId: `br_${core.nanoid()}`,
          feeCalculation,
          organization,
          livemode: false,
        })

      const chargeId =
        typeof paymentIntent.latest_charge === 'string'
          ? paymentIntent.latest_charge
          : paymentIntent.latest_charge!.id

      return {
        paymentIntentId: paymentIntent.id,
        chargeId,
        customerId: stripeCustomer.id,
      }
    }

    describe('refundPayment', () => {
      let createdCustomerId: string | undefined

      afterEach(async () => {
        if (createdCustomerId) {
          await cleanupStripeTestData({
            stripeCustomerId: createdCustomerId,
          })
          createdCustomerId = undefined
        }
      })

      it('creates a full refund for a succeeded payment and returns refund with status succeeded and full amount', async () => {
        const amount = 5000

        // Setup: create a succeeded payment using app function
        const { paymentIntentId, customerId } =
          await createSucceededBillingPayment(amount)
        createdCustomerId = customerId

        // Action: refund using the application function
        const refund = await refundPayment(
          paymentIntentId,
          null, // full refund
          false // livemode
        )

        // Verify refund was created
        expect(refund.id).toMatch(/^re_/)
        expect(refund.status).toBe('succeeded')
        expect(refund.amount).toBe(amount)
      })

      it('creates a partial refund for a succeeded payment and returns refund with status succeeded and partial amount', async () => {
        const amount = 10000
        const partialRefundAmount = 3000

        // Setup: create a succeeded payment using app function
        const { paymentIntentId, customerId } =
          await createSucceededBillingPayment(amount)
        createdCustomerId = customerId

        // Action: partial refund using the application function
        const refund = await refundPayment(
          paymentIntentId,
          partialRefundAmount,
          false // livemode
        )

        // Verify partial refund was created
        expect(refund.id).toMatch(/^re_/)
        expect(refund.status).toBe('succeeded')
        expect(refund.amount).toBe(partialRefundAmount)
      })

      it('throws error when payment intent has no charge', async () => {
        // Setup: create an unconfirmed payment intent (no charge)
        const stripeCustomer = await createTestStripeCustomer()
        createdCustomerId = stripeCustomer.id

        const paymentMethod = await createTestPaymentMethod({
          stripeCustomerId: stripeCustomer.id,
          livemode: false,
        })

        const organization = createTestOrganization()
        const feeCalculation = createTestFeeCalculation({
          baseAmount: 5000,
        })

        // Create but don't confirm the payment intent
        const paymentIntent = await createPaymentIntentForBillingRun({
          amount: 5000,
          currency: CurrencyCode.USD,
          stripeCustomerId: stripeCustomer.id,
          stripePaymentMethodId: paymentMethod.id,
          billingPeriodId: `bp_${core.nanoid()}`,
          billingRunId: `br_${core.nanoid()}`,
          feeCalculation,
          organization,
          livemode: false,
        })

        // Action & Verify: attempting to refund should throw
        await expect(
          refundPayment(paymentIntent.id, null, false)
        ).rejects.toThrow('No charge found for payment intent')

        // Cleanup the unconfirmed payment intent
        await cleanupStripeTestData({
          stripePaymentIntentId: paymentIntent.id,
        })
      })
    })

    describe('listRefundsForCharge', () => {
      let createdCustomerId: string | undefined

      afterEach(async () => {
        if (createdCustomerId) {
          await cleanupStripeTestData({
            stripeCustomerId: createdCustomerId,
          })
          createdCustomerId = undefined
        }
      })

      it('returns empty list when charge has no refunds', async () => {
        const amount = 5000

        // Setup: create a succeeded payment (no refunds yet)
        const { chargeId, customerId } =
          await createSucceededBillingPayment(amount)
        createdCustomerId = customerId

        // Action: list refunds using application function
        const refunds = await listRefundsForCharge(chargeId, false)

        // Verify empty list
        expect(refunds.data).toHaveLength(0)
      })

      it('returns refund in list after refunding a charge', async () => {
        const amount = 7500

        // Setup: create a succeeded payment and refund it
        const { paymentIntentId, chargeId, customerId } =
          await createSucceededBillingPayment(amount)
        createdCustomerId = customerId

        // Refund the payment using app function
        const refund = await refundPayment(
          paymentIntentId,
          null, // full refund
          false
        )

        // Action: list refunds using application function
        const refunds = await listRefundsForCharge(chargeId, false)

        // Verify refund appears in list
        expect(refunds.data.length).toBeGreaterThanOrEqual(1)
        expect(refunds.data.some((r) => r.id === refund.id)).toBe(
          true
        )
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

const getChargeIdFromPaymentIntent = (
  paymentIntent: Stripe.PaymentIntent
): string | undefined =>
  typeof paymentIntent.latest_charge === 'string'
    ? paymentIntent.latest_charge
    : paymentIntent.latest_charge?.id

/**
 * Integration tests for Stripe utility functions.
 *
 * These tests make real API calls to Stripe's test mode.
 * They require STRIPE_TEST_MODE_SECRET_KEY to be set.
 */
describeIfStripeKey('Stripe Utility Functions', () => {
  describe('Utility Functions', () => {
    let testCustomerId: string | undefined
    let testPaymentIntentId: string | undefined

    afterEach(async () => {
      await cleanupStripeTestData({
        stripeCustomerId: testCustomerId,
        stripePaymentIntentId: testPaymentIntentId,
      })
      testCustomerId = undefined
      testPaymentIntentId = undefined
    })

    describe('getStripePaymentMethod', () => {
      it('retrieves payment method with id, type, billing_details, and card properties', async () => {
        // Setup: create customer, attach payment method
        const stripe = getStripeTestClient()
        const customer = await createTestStripeCustomer({
          email: 'payment-method-test@flowglad-test.com',
          name: 'Payment Method Test Customer',
        })
        testCustomerId = customer.id

        const paymentMethod = await createTestPaymentMethod({
          stripeCustomerId: customer.id,
          livemode: false,
        })

        // Action: retrieve payment method using the actual utility function
        const retrieved = await getStripePaymentMethod(
          paymentMethod.id,
          false // livemode
        )

        // Expectations
        expect(retrieved.id).toBe(paymentMethod.id)
        expect(retrieved.type).toBe('card')
        // Use toMatchObject since Stripe may add new fields to billing_details over time
        expect(retrieved.billing_details).toMatchObject({
          address: {
            city: null,
            country: null,
            line1: null,
            line2: null,
            postal_code: null,
            state: null,
          },
          email: null,
          name: null,
          phone: null,
        })
        expect(retrieved.card).toMatchObject({
          brand: 'visa',
          last4: '4242',
        })

        // Cleanup: detach payment method (customer deletion will also clean this up)
        await stripe.paymentMethods.detach(paymentMethod.id)
      })
    })

    describe('getStripeCharge', () => {
      it('retrieves charge with id, amount, currency, payment_method_details, and status', async () => {
        // Setup: create customer, attach payment method, create and confirm payment
        const stripe = getStripeTestClient()
        const customer = await createTestStripeCustomer({
          email: 'charge-test@flowglad-test.com',
          name: 'Charge Test Customer',
        })
        testCustomerId = customer.id

        const paymentMethod = await createTestPaymentMethod({
          stripeCustomerId: customer.id,
          livemode: false,
        })

        // Create and confirm a payment intent to generate a charge
        const paymentIntent = await stripe.paymentIntents.create({
          amount: 2500, // $25.00
          currency: 'usd',
          customer: customer.id,
          payment_method: paymentMethod.id,
          confirm: true,
          off_session: true,
        })
        testPaymentIntentId = paymentIntent.id

        // Get the charge ID from the payment intent
        const chargeId = getChargeIdFromPaymentIntent(paymentIntent)

        expect(chargeId).toMatch(/^ch_/)

        // Action: retrieve charge using the actual utility function
        const charge = await getStripeCharge(chargeId!)

        // Expectations
        expect(charge.id).toBe(chargeId)
        expect(charge.amount).toBe(2500)
        expect(charge.currency).toBe('usd')
        expect(charge.payment_method_details?.type).toBe('card')
        expect(charge.status).toBe('succeeded')
      })
    })

    describe('dateFromStripeTimestamp', () => {
      it('converts Stripe timestamp 1704067200 (2024-01-01 00:00:00 UTC) to corresponding JavaScript Date', () => {
        // Setup: use timestamp 1704067200 (2024-01-01 00:00:00 UTC)
        const timestamp = 1704067200

        // Action: convert timestamp to Date
        const result = dateFromStripeTimestamp(timestamp)

        // Expectations
        expect(result).toBeInstanceOf(Date)
        expect(result.getUTCFullYear()).toBe(2024)
        expect(result.getUTCMonth()).toBe(0) // January is month 0
        expect(result.getUTCDate()).toBe(1)
        expect(result.getUTCHours()).toBe(0)
        expect(result.getUTCMinutes()).toBe(0)
        expect(result.getUTCSeconds()).toBe(0)
        expect(result.getTime()).toBe(1704067200000) // Milliseconds
      })
    })

    describe('paymentMethodFromStripeCharge', () => {
      it('returns PaymentMethodType.Card for card payment method type', async () => {
        // Setup: create charge with card payment
        const stripe = getStripeTestClient()
        const customer = await createTestStripeCustomer({
          email: 'payment-method-type-test@flowglad-test.com',
          name: 'Payment Method Type Test Customer',
        })
        testCustomerId = customer.id

        const paymentMethod = await createTestPaymentMethod({
          stripeCustomerId: customer.id,
          livemode: false,
        })

        // Create and confirm a payment intent to generate a charge
        const paymentIntent = await stripe.paymentIntents.create({
          amount: 1000, // $10.00
          currency: 'usd',
          customer: customer.id,
          payment_method: paymentMethod.id,
          confirm: true,
          off_session: true,
        })
        testPaymentIntentId = paymentIntent.id

        // Retrieve the charge
        const chargeId = getChargeIdFromPaymentIntent(paymentIntent)

        const charge = await stripe.charges.retrieve(chargeId!)

        // Action: get payment method type from charge
        const result = paymentMethodFromStripeCharge(charge)

        // Expectation
        expect(result).toBe(PaymentMethodType.Card)
      })

      it('throws error "Unknown payment method type: unknown_type" for unrecognized payment method type', () => {
        // Setup: create a mock charge with an unknown payment method type
        const mockCharge = {
          id: 'ch_mock',
          payment_method_details: {
            type: 'unknown_type',
          },
        } as unknown as Stripe.Charge

        // Action & Expectation: should throw
        expect(() =>
          paymentMethodFromStripeCharge(mockCharge)
        ).toThrow('Unknown payment method type: unknown_type')
      })

      it('throws error when charge has no payment_method_details', () => {
        // Setup: create a mock charge without payment method details
        const mockCharge = {
          id: 'ch_mock',
          payment_method_details: null,
        } as unknown as Stripe.Charge

        // Action & Expectation: should throw
        expect(() =>
          paymentMethodFromStripeCharge(mockCharge)
        ).toThrow('No payment method details found for charge')
      })
    })
  })
})
