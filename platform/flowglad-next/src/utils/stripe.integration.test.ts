import { afterEach, describe, expect, it } from 'vitest'
import type { Customer } from '@/db/schema/customers'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import type { Organization } from '@/db/schema/organizations'
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
  StripeConnectContractType,
} from '@/types'
import core from '@/utils/core'
import {
  confirmPaymentIntentForBillingRun,
  createAndConfirmPaymentIntentForBillingRun,
  createCustomerSessionForCheckout,
  createPaymentIntentForBillingRun,
  getLatestChargeForPaymentIntent,
  IntentMetadataType,
  listRefundsForCharge,
  refundPayment,
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
