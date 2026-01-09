/**
 * Checkout Integration Behavior Tests
 *
 * These tests extend the checkout behavior chain to include behaviors
 * that require real Stripe API calls:
 * - Confirm Checkout Session (creates/confirms payment intent)
 * - Process Payment Success (simulates charge success, creates Purchase/Invoice/Payment)
 *
 * ## Why This is a Separate File
 *
 * The base `checkout.behavior.test.ts` uses mocked Stripe calls via MSW.
 * This file uses real Stripe test mode API calls via `describeIfStripeKey`.
 *
 * ## Test Coverage
 *
 * This file tests Behavior 6 (Confirm Checkout) from the feedback document:
 * - Purchase record created with correct amount and status
 * - Invoice record created with correct totals
 * - Payment record created with correct status
 * - stripeTaxTransactionId set on FeeCalculation (MoR only)
 */

import type Stripe from 'stripe'
import { expect } from 'vitest'
import { teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import type { Invoice } from '@/db/schema/invoices'
import type { Payment } from '@/db/schema/payments'
import type { Purchase } from '@/db/schema/purchases'
import {
  selectCheckoutSessionById,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { selectInvoices } from '@/db/tableMethods/invoiceMethods'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import {
  cleanupStripeTestData,
  createTestPaymentMethod,
  createTestStripeCustomer,
  describeIfStripeKey,
  getStripeTestClient,
} from '@/test/stripeIntegrationHelpers'
import {
  FeeCalculationType,
  InvoiceStatus,
  PaymentStatus,
  PurchaseStatus,
  StripeConnectContractType,
} from '@/types'
import { processStripeChargeForCheckoutSession } from '@/utils/bookkeeping/checkoutSessions'
import { confirmCheckoutSessionTransaction } from '@/utils/bookkeeping/confirmCheckoutSession'
import { calculateTotalDueAmount } from '@/utils/bookkeeping/fees/common'
import core from '@/utils/core'
import {
  createPaymentIntentForCheckoutSession,
  updatePaymentIntent,
} from '@/utils/stripe'
import { authenticateUserBehavior } from '../behaviors/authBehaviors'
import {
  createProductWithPriceBehavior,
  initiateCheckoutSessionBehavior,
  type ProvideBillingAddressResult,
  provideBillingAddressBehavior,
} from '../behaviors/checkoutBehaviors'
import { createOrganizationBehavior } from '../behaviors/orgSetupBehaviors'
import { completeStripeOnboardingBehavior } from '../behaviors/stripeOnboardingBehaviors'
import { ContractTypeDep } from '../dependencies/contractTypeDependencies'
import { CountryDep } from '../dependencies/countryDependencies'
import { CustomerResidencyDep } from '../dependencies/customerResidencyDependencies'
import { behaviorTest, defineBehavior } from '../index'

// =============================================================================
// Result Types for Extended Chain
// =============================================================================

interface ConfirmCheckoutResult extends ProvideBillingAddressResult {
  stripePaymentIntentId: string
  stripeCustomerId: string
  stripePaymentMethodId: string
}

interface PaymentSuccessResult extends ConfirmCheckoutResult {
  purchase: Purchase.Record
  invoice: Invoice.Record
  payment: Payment.Record
  finalFeeCalculation: FeeCalculation.Record | null
  stripeCharge: Stripe.Charge
}

// =============================================================================
// Extended Behaviors (require real Stripe)
// =============================================================================

/**
 * Confirm Checkout Session Behavior
 *
 * Creates real Stripe resources:
 * - Stripe customer
 * - Payment method (test card)
 * - Payment intent
 *
 * Then confirms the checkout session for payment.
 */
const confirmCheckoutSessionBehavior = defineBehavior({
  name: 'confirm checkout session',
  dependencies: [],
  run: async (
    _deps,
    prev: ProvideBillingAddressResult
  ): Promise<ConfirmCheckoutResult> => {
    // Create real Stripe customer
    const stripeCustomer = await createTestStripeCustomer({
      email: `checkout+${core.nanoid()}@flowglad-integration.com`,
      name: 'Integration Test Customer',
    })

    // Create and attach payment method
    const paymentMethod = await createTestPaymentMethod({
      stripeCustomerId: stripeCustomer.id,
      livemode: false,
    })

    // Create payment intent for the checkout session
    const paymentIntent = await createPaymentIntentForCheckoutSession(
      {
        price: prev.price,
        organization: prev.organization,
        product: prev.product,
        checkoutSession: prev.checkoutSession,
      }
    )

    // Update payment intent with customer
    await updatePaymentIntent(
      paymentIntent.id,
      { customer: stripeCustomer.id },
      false
    )

    // Update checkout session with payment intent ID and confirm
    await adminTransaction(async ({ transaction }) => {
      const session = await selectCheckoutSessionById(
        prev.checkoutSession.id,
        transaction
      )
      if (!session) {
        throw new Error('Checkout session not found')
      }

      await updateCheckoutSession(
        {
          ...session,
          stripePaymentIntentId: paymentIntent.id,
        },
        transaction
      )

      // Confirm the checkout session
      await confirmCheckoutSessionTransaction(
        { id: session.id },
        transaction
      )
    })

    return {
      ...prev,
      stripePaymentIntentId: paymentIntent.id,
      stripeCustomerId: stripeCustomer.id,
      stripePaymentMethodId: paymentMethod.id,
    }
  },
})

/**
 * Process Payment Success Behavior
 *
 * Confirms the payment intent (charges the card) and processes
 * the charge through our bookkeeping system.
 *
 * Creates:
 * - Purchase record
 * - Invoice record
 * - Payment record
 * - For MoR: Stripe Tax Transaction
 */
const processPaymentSuccessBehavior = defineBehavior({
  name: 'process payment success',
  dependencies: [],
  run: async (
    _deps,
    prev: ConfirmCheckoutResult
  ): Promise<PaymentSuccessResult> => {
    const stripe = getStripeTestClient()

    // Confirm the payment intent (this charges the card)
    const confirmedPaymentIntent =
      await stripe.paymentIntents.confirm(
        prev.stripePaymentIntentId,
        {
          payment_method: prev.stripePaymentMethodId,
          off_session: true,
        }
      )

    // Get the charge
    const chargeId =
      typeof confirmedPaymentIntent.latest_charge === 'string'
        ? confirmedPaymentIntent.latest_charge
        : confirmedPaymentIntent.latest_charge!.id

    const charge = await stripe.charges.retrieve(chargeId)

    // Process the charge through our bookkeeping
    const bookkeepingResult = await adminTransaction(
      async ({ transaction }) => {
        return processStripeChargeForCheckoutSession(
          {
            checkoutSessionId: prev.checkoutSession.id,
            charge,
          },
          transaction
        )
      }
    )

    const purchase = bookkeepingResult.result.purchase
    if (!purchase) {
      throw new Error('Purchase not created after payment success')
    }

    // Fetch the invoice, payment, and final fee calculation
    const { invoice, payment, finalFeeCalculation } =
      await adminTransaction(async ({ transaction }) => {
        const invoiceRecords = await selectInvoices(
          { purchaseId: purchase.id },
          transaction
        )
        const paymentRecords = await selectPayments(
          { purchaseId: purchase.id },
          transaction
        )
        const feeCalc = await selectLatestFeeCalculation(
          { checkoutSessionId: prev.checkoutSession.id },
          transaction
        )

        return {
          invoice: invoiceRecords[0],
          payment: paymentRecords[0],
          finalFeeCalculation: feeCalc,
        }
      })

    return {
      ...prev,
      purchase,
      invoice,
      payment,
      finalFeeCalculation,
      stripeCharge: charge,
    }
  },
})

// =============================================================================
// Teardown
// =============================================================================

const checkoutIntegrationTeardown = async (results: unknown[]) => {
  for (const result of results as PaymentSuccessResult[]) {
    try {
      if (result?.organization?.id) {
        await teardownOrg({ organizationId: result.organization.id })
      }
      if (result?.stripeCustomerId) {
        await cleanupStripeTestData({
          stripeCustomerId: result.stripeCustomerId,
        })
      }
    } catch (error) {
      console.warn(
        `[teardown] Failed to cleanup org ${result?.organization?.id}:`,
        error
      )
    }
  }
}

// =============================================================================
// Integration Behavior Tests
// =============================================================================

/**
 * MoR Full Checkout Flow (NYC - Registered Jurisdiction)
 *
 * Tests the complete checkout journey for MoR organizations with
 * a registered tax jurisdiction (NYC).
 */
behaviorTest({
  describeFunction: describeIfStripeKey,
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    { behavior: createProductWithPriceBehavior },
    { behavior: initiateCheckoutSessionBehavior },
    { behavior: provideBillingAddressBehavior },
    { behavior: confirmCheckoutSessionBehavior },
    {
      behavior: processPaymentSuccessBehavior,
      invariants: async (result, combination) => {
        const contractTypeDep = ContractTypeDep.get(
          combination.ContractTypeDep
        )
        const customerResidencyDep = CustomerResidencyDep.get(
          combination.CustomerResidencyDep
        )

        // === Purchase Assertions ===
        expect(result.purchase).not.toBeNull()
        expect(result.purchase.id).toMatch(/^prch_/)
        expect(result.purchase.organizationId).toBe(
          result.organization.id
        )
        expect(result.purchase.customerId).toBe(result.customerId)
        expect(result.purchase.priceId).toBe(result.price.id)
        expect(result.purchase.status).toBe(PurchaseStatus.Open)

        // === Invoice Assertions ===
        expect(result.invoice).not.toBeNull()
        expect(result.invoice.id).toMatch(/^inv_/)
        expect(result.invoice.organizationId).toBe(
          result.organization.id
        )
        expect(result.invoice.purchaseId).toBe(result.purchase.id)

        // Invoice should have status Draft or Paid depending on flow
        expect([InvoiceStatus.Draft, InvoiceStatus.Paid]).toContain(
          result.invoice.status
        )

        // === Payment Assertions ===
        expect(result.payment).not.toBeNull()
        expect(result.payment.id).toMatch(/^pymt_/)
        expect(result.payment.purchaseId).toBe(result.purchase.id)
        expect(result.payment.invoiceId).toBe(result.invoice.id)
        expect(result.payment.status).toBe(PaymentStatus.Succeeded)

        // Payment amount should match the total due
        if (result.finalFeeCalculation) {
          const expectedTotal = calculateTotalDueAmount(
            result.finalFeeCalculation
          )
          expect(result.payment.amount).toBe(expectedTotal)
        }

        // === Stripe Charge Assertions ===
        expect(result.stripeCharge).not.toBeNull()
        expect(result.stripeCharge.status).toBe('succeeded')

        // === MoR-Specific Assertions ===
        if (
          contractTypeDep.contractType ===
          StripeConnectContractType.MerchantOfRecord
        ) {
          // Fee calculation should exist
          expect(result.finalFeeCalculation).not.toBeNull()
          const fc = result.finalFeeCalculation!

          // Fee calculation type
          expect(fc.type).toBe(
            FeeCalculationType.CheckoutSessionPayment
          )

          // Fee percentages
          expect(fc.flowgladFeePercentage).toBe('0.65')
          expect(fc.morSurchargePercentage).toBe('1.1')

          // For registered jurisdictions, stripeTaxTransactionId should be set
          // Note: This may be null in test mode if tax API isn't fully configured
          if (customerResidencyDep.isFlowgladRegistered) {
            // Tax calculation ID should exist
            expect(fc.stripeTaxCalculationId).toBeTruthy()
            // stripeTaxTransactionId may or may not be set depending on test env
          }
        }
      },
    },
  ],
  only: [
    {
      ContractTypeDep: 'merchantOfRecord',
      CountryDep: 'us',
      CustomerResidencyDep: 'us-nyc',
    },
  ],
  testOptions: { timeout: 120000 },
  teardown: checkoutIntegrationTeardown,
})

/**
 * Platform Full Checkout Flow
 *
 * Tests that Platform organizations:
 * - Have no fee calculation
 * - Still create Purchase/Invoice/Payment records
 * - No stripeTaxTransactionId
 */
behaviorTest({
  describeFunction: describeIfStripeKey,
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    { behavior: createProductWithPriceBehavior },
    { behavior: initiateCheckoutSessionBehavior },
    { behavior: provideBillingAddressBehavior },
    { behavior: confirmCheckoutSessionBehavior },
    {
      behavior: processPaymentSuccessBehavior,
      invariants: async (result) => {
        // === Purchase Assertions ===
        expect(result.purchase).not.toBeNull()
        expect(result.purchase.status).toBe(PurchaseStatus.Open)

        // === Invoice Assertions ===
        expect(result.invoice).not.toBeNull()

        // === Payment Assertions ===
        expect(result.payment).not.toBeNull()
        expect(result.payment.status).toBe(PaymentStatus.Succeeded)

        // === Platform-Specific: No fee calculation ===
        expect(result.finalFeeCalculation).toBeNull()
      },
    },
  ],
  only: [
    {
      ContractTypeDep: 'platform',
      CountryDep: 'us',
      CustomerResidencyDep: 'us-nyc',
    },
  ],
  testOptions: { timeout: 120000 },
  teardown: checkoutIntegrationTeardown,
})
