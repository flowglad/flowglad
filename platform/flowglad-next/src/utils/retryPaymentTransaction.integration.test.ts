/**
 * Integration tests for retryPaymentTransaction.
 *
 * These tests require real Stripe API calls to create and confirm payment intents
 * with charges attached, which stripe-mock cannot simulate.
 *
 * Run with: bun run test:integration src/utils/retryPaymentTransaction.integration.test.ts
 */
import { afterEach, beforeEach, expect, it } from 'bun:test'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Invoice } from '@/db/schema/invoices'
import type { Organization } from '@/db/schema/organizations'
import type { Payment } from '@/db/schema/payments'
import type { Price } from '@/db/schema/prices'
import { updatePayment } from '@/db/tableMethods/paymentMethods'
import {
  cleanupStripeTestData,
  createTestPaymentMethod,
  createTestStripeCustomer,
  describeIfStripeKey,
  getStripeTestClient,
} from '@/test/stripeIntegrationHelpers'
import { PaymentStatus } from '@/types'
import { retryPaymentTransaction } from './paymentHelpers'

describeIfStripeKey('retryPaymentTransaction', () => {
  let organization: Organization.Record
  let price: Price.Record
  let customer: Customer.Record
  let invoice: Invoice.Record
  let stripeCustomerId: string | undefined
  let stripePaymentIntentId: string | undefined

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    price = orgData.price

    // Create a real Stripe customer for integration testing
    const stripeCustomer = await createTestStripeCustomer({
      email: `retry-payment-test-${Date.now()}@flowglad-test.com`,
      name: 'Retry Payment Test Customer',
    })
    stripeCustomerId = stripeCustomer.id

    customer = await setupCustomer({
      organizationId: organization.id,
      stripeCustomerId: stripeCustomer.id,
    })

    invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
    })
  })

  afterEach(async () => {
    // Clean up Stripe resources
    if (stripeCustomerId || stripePaymentIntentId) {
      await cleanupStripeTestData({
        stripeCustomerId,
        stripePaymentIntentId,
      })
    }

    if (organization) {
      await teardownOrg({ organizationId: organization.id })
    }
  })

  it('propagates Stripe Tax fields to the new payment record', async () => {
    const stripe = getStripeTestClient()

    // Create a real payment method
    const paymentMethod = await createTestPaymentMethod({
      stripeCustomerId: stripeCustomerId!,
      livemode: false,
      tokenType: 'success',
    })

    // Create a real payment intent and confirm it to get a charge
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1000,
      currency: 'usd',
      customer: stripeCustomerId,
      payment_method: paymentMethod.id,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
    })
    stripePaymentIntentId = paymentIntent.id

    // Verify we have a charge attached
    expect(typeof paymentIntent.latest_charge).toBe('string')

    // Create a "failed" payment record pointing to the real payment intent
    // In reality this payment succeeded, but we're testing the retry logic
    // which copies tax fields from the original to the new payment
    const failedPayment = await setupPayment({
      stripeChargeId:
        typeof paymentIntent.latest_charge === 'string'
          ? paymentIntent.latest_charge
          : paymentIntent.latest_charge!.id,
      status: PaymentStatus.Failed,
      amount: 1000,
      livemode: false, // Use test mode
      organizationId: organization.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      stripePaymentIntentId: paymentIntent.id,
    })

    // Update with tax fields that should be propagated
    const updatedFailedPayment = await adminTransaction(
      async ({ transaction }) => {
        return updatePayment(
          {
            id: failedPayment.id,
            subtotal: 800,
            taxAmount: 123,
            stripeTaxCalculationId: 'txcalc_test_retry',
            stripeTaxTransactionId: 'tax_txn_test_retry',
          },
          transaction
        )
      }
    )

    // Retry the payment - this will re-confirm the payment intent
    const retriedPayment = (
      await adminTransaction(async ({ transaction }) => {
        return retryPaymentTransaction(
          { id: updatedFailedPayment.id },
          transaction
        )
      })
    ).unwrap()

    // Verify tax fields are propagated to the new payment
    expect(retriedPayment.id).not.toBe(updatedFailedPayment.id)
    expect(retriedPayment.subtotal).toBe(
      updatedFailedPayment.subtotal
    )
    expect(retriedPayment.taxAmount).toBe(
      updatedFailedPayment.taxAmount
    )
    expect(retriedPayment.stripeTaxCalculationId).toBe(
      updatedFailedPayment.stripeTaxCalculationId
    )
    expect(retriedPayment.stripeTaxTransactionId).toBe(
      updatedFailedPayment.stripeTaxTransactionId
    )
  })
})
