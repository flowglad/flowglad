import { describe, expect, it } from 'bun:test'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { updatePayment } from '@/db/tableMethods/paymentMethods'
import { PaymentStatus } from '@/types'
import { retryPaymentTransaction } from './paymentHelpers'

describe('retryPaymentTransaction', () => {
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
    const failedPayment = await setupPayment({
      stripeChargeId: `ch_failed_${organization.id}`,
      status: PaymentStatus.Failed,
      amount: 1000,
      livemode: true,
      organizationId: organization.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      stripePaymentIntentId: `pi_retry_${organization.id}`,
    })

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
