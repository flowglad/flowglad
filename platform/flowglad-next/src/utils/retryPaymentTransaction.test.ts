import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type Stripe from 'stripe'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { updatePayment } from '@/db/tableMethods/paymentMethods'
import { PaymentStatus } from '@/types'
import { nanoid } from '@/utils/core'

// Import actual stripe module functions we want to keep
import * as actualStripe from './stripe'

// Create mocks for specific functions
const mockGetPaymentIntent =
  mock<typeof actualStripe.getPaymentIntent>()
const mockConfirmPaymentIntent =
  mock<typeof actualStripe.confirmPaymentIntent>()
const mockGetStripeCharge =
  mock<typeof actualStripe.getStripeCharge>()

// Mock the stripe utils
mock.module('./stripe', () => ({
  ...actualStripe,
  getPaymentIntent: mockGetPaymentIntent,
  confirmPaymentIntent: mockConfirmPaymentIntent,
  getStripeCharge: mockGetStripeCharge,
}))

import { retryPaymentTransaction } from './paymentHelpers'

describe('retryPaymentTransaction', () => {
  beforeEach(() => {
    mock.clearAllMocks()
  })

  it('propagates Stripe Tax fields to the new payment record', async () => {
    const { organization, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
    })

    const stripePaymentIntentId = `pi_retry_${nanoid()}`
    const newChargeId = `ch_new_${nanoid()}`

    const failedPayment = await setupPayment({
      stripeChargeId: `ch_failed_${organization.id}`,
      status: PaymentStatus.Failed,
      amount: 1000,
      livemode: true,
      organizationId: organization.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      stripePaymentIntentId,
    })

    // Mock getPaymentIntent to return a valid payment intent with a charge
    mockGetPaymentIntent.mockResolvedValue({
      id: stripePaymentIntentId,
      object: 'payment_intent',
      latest_charge: `ch_original_${nanoid()}`,
      status: 'requires_confirmation',
      amount: 1000,
      currency: 'usd',
    } as unknown as Stripe.Response<Stripe.PaymentIntent>)

    // Mock confirmPaymentIntent to return a succeeded payment intent
    mockConfirmPaymentIntent.mockResolvedValue({
      id: stripePaymentIntentId,
      object: 'payment_intent',
      latest_charge: newChargeId,
      status: 'succeeded',
      amount: 1000,
      currency: 'usd',
    } as unknown as Stripe.Response<Stripe.PaymentIntent>)

    // Mock getStripeCharge to return a succeeded charge
    mockGetStripeCharge.mockResolvedValue({
      id: newChargeId,
      object: 'charge',
      status: 'succeeded',
      amount: 1000,
      currency: 'usd',
    } as unknown as Stripe.Response<Stripe.Charge>)

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

    const retriedPayment = await adminTransaction(
      async ({ transaction }) => {
        return retryPaymentTransaction(
          { id: updatedFailedPayment.id },
          transaction
        )
      }
    )

    expect(retriedPayment.id).not.toBe(updatedFailedPayment.id)
    expect(retriedPayment.stripeChargeId).not.toBe(
      updatedFailedPayment.stripeChargeId
    )
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
