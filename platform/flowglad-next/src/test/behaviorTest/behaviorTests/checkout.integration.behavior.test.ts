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
  PaymentStatus,
  PurchaseStatus,
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
import { CountryDep } from '../dependencies/countryDependencies'
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

    // Create payment intent for the checkout session (use updatedCheckoutSession which has billing address)
    const paymentIntent = await createPaymentIntentForCheckoutSession(
      {
        price: prev.price,
        organization: prev.organization,
        product: prev.product,
        checkoutSession: prev.updatedCheckoutSession,
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
        prev.updatedCheckoutSession.id,
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
    // Use expand to include charges in response for more robust charge retrieval
    const confirmedPaymentIntent =
      await stripe.paymentIntents.confirm(
        prev.stripePaymentIntentId,
        {
          payment_method: prev.stripePaymentMethodId,
          off_session: true,
          expand: ['charges'],
        }
      )

    // Handle payment intent statuses that require additional action
    if (confirmedPaymentIntent.status === 'requires_action') {
      throw new Error(
        `Payment intent ${prev.stripePaymentIntentId} requires additional action (e.g., 3DS authentication). ` +
          `This test uses off_session=true which should not trigger 3DS for test cards.`
      )
    }
    if (confirmedPaymentIntent.status === 'requires_payment_method') {
      throw new Error(
        `Payment intent ${prev.stripePaymentIntentId} requires a new payment method. ` +
          `The attached payment method may have been declined.`
      )
    }

    // Get the charge, preferring expanded charges data, falling back to latest_charge
    // The `charges` field is typed as potentially undefined, but is populated when expanded
    let charge: Stripe.Charge
    const expandedCharges = (
      confirmedPaymentIntent as unknown as {
        charges?: Stripe.ApiList<Stripe.Charge>
      }
    ).charges
    if (expandedCharges && expandedCharges.data.length > 0) {
      // Use expanded charges data (most reliable)
      charge = expandedCharges.data[0]
    } else if (confirmedPaymentIntent.latest_charge) {
      // Fallback to latest_charge
      const { latest_charge } = confirmedPaymentIntent
      const chargeId =
        typeof latest_charge === 'string'
          ? latest_charge
          : latest_charge.id
      charge = await stripe.charges.retrieve(chargeId)
    } else {
      throw new Error(
        `No charge found on payment intent ${prev.stripePaymentIntentId} after confirmation. ` +
          `Status: ${confirmedPaymentIntent.status}`
      )
    }

    // Process the charge through our bookkeeping
    const bookkeepingResult = await adminTransaction(
      async ({ transaction }) => {
        return processStripeChargeForCheckoutSession(
          {
            checkoutSessionId: prev.updatedCheckoutSession.id,
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
          { checkoutSessionId: prev.updatedCheckoutSession.id },
          transaction
        )

        // For a single payment checkout, there should be exactly one invoice and one payment
        if (!invoiceRecords || invoiceRecords.length !== 1) {
          throw new Error(
            `Expected exactly 1 invoice for purchase ${purchase.id}, found ${invoiceRecords?.length ?? 0}`
          )
        }
        if (!paymentRecords || paymentRecords.length !== 1) {
          throw new Error(
            `Expected exactly 1 payment for purchase ${purchase.id}, found ${paymentRecords?.length ?? 0}`
          )
        }

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
 *
 * Key invariants:
 * - Purchase, Invoice, and Payment records are created
 * - Fee calculation exists with tax calculation
 */
behaviorTest({
  describeFunction: describeIfStripeKey,
  only: [
    {
      ContractTypeDep: 'merchantOfRecord',
      CountryDep: 'us',
      CustomerResidencyDep: 'us-nyc',
    },
  ],
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
        // === Purchase created ===
        expect(result.purchase.organizationId).toBe(
          result.organization.id
        )
        expect(result.purchase.status).toBe(PurchaseStatus.Open)

        // === Invoice created ===
        expect(result.invoice.purchaseId).toBe(result.purchase.id)

        // === Payment succeeded ===
        expect(result.payment.status).toBe(PaymentStatus.Succeeded)

        // === Stripe charge succeeded ===
        expect(result.stripeCharge.status).toBe('succeeded')

        // === MoR: Fee calculation exists ===
        const fc = result.finalFeeCalculation
        if (!fc) {
          throw new Error(
            'Fee calculation should exist for MoR checkout but was null'
          )
        }

        expect(fc.type).toBe(
          FeeCalculationType.CheckoutSessionPayment
        )

        // Tax calculation was performed (NYC is a registered jurisdiction)
        expect(typeof fc.stripeTaxCalculationId).toBe('string')

        // Payment amount matches the calculated total
        const expectedTotal = calculateTotalDueAmount(fc)
        expect(result.payment.amount).toBe(expectedTotal)
      },
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
  only: [
    {
      ContractTypeDep: 'platform',
      CountryDep: 'us',
      CustomerResidencyDep: 'us-nyc',
    },
  ],
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
        expect(result.purchase.status).toBe(PurchaseStatus.Open)

        // === Invoice Assertions ===
        expect(result.invoice.purchaseId).toBe(result.purchase.id)

        // === Payment Assertions ===
        expect(result.payment.status).toBe(PaymentStatus.Succeeded)

        // === Platform-Specific: No fee calculation ===
        expect(result.finalFeeCalculation).toBe(null)
      },
    },
  ],
  testOptions: { timeout: 120000 },
  teardown: checkoutIntegrationTeardown,
})
