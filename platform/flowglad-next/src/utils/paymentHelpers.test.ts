import { describe, expect, it, vi } from 'vitest'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { updatePayment } from '@/db/tableMethods/paymentMethods'
import type { Payment } from '@/db/schema/payments'
import { PaymentStatus } from '@/types'
import {
  createMockPaymentIntentResponse,
  createMockPaymentIntent,
  createMockStripeCharge,
} from '@/test/helpers/stripeMocks'
import { getPaymentIntent, getStripeCharge } from '@/utils/stripe'
import { confirmPaymentIntent } from './stripe'
import {
  retryPaymentTransaction,
  sumNetTotalSettledPaymentsForPaymentSet,
} from './paymentHelpers'

vi.mock('@/utils/stripe', async () => {
  const actual = await vi.importActual<
    typeof import('@/utils/stripe')
  >('@/utils/stripe')
  return {
    ...actual,
    getPaymentIntent: vi.fn(),
    getStripeCharge: vi.fn(),
  }
})

vi.mock('./stripe', async () => {
  const actual = await vi.importActual<typeof import('./stripe')>(
    './stripe'
  )
  return {
    ...actual,
    confirmPaymentIntent: vi.fn(),
  }
})

describe('sumNetTotalSettledPaymentsForPaymentSet', () => {
  it('should sum only succeeded payments and refunded payments', () => {
    const payments: Pick<
      Payment.Record,
      'status' | 'amount' | 'refundedAmount'
    >[] = [
      {
        status: PaymentStatus.Succeeded,
        amount: 1000,
        refundedAmount: null,
      },
      {
        status: PaymentStatus.Failed,
        amount: 2000,
        refundedAmount: null,
      },
      {
        status: PaymentStatus.Succeeded,
        amount: 3000,
        refundedAmount: null,
      },
      {
        status: PaymentStatus.Processing,
        amount: 4000,
        refundedAmount: null,
      },
      {
        status: PaymentStatus.Refunded,
        amount: 5000,
        refundedAmount: 2500,
      },
      {
        status: PaymentStatus.Canceled,
        amount: 6000,
        refundedAmount: null,
      },
      {
        status: PaymentStatus.RequiresConfirmation,
        amount: 8000,
        refundedAmount: null,
      },
      {
        status: PaymentStatus.RequiresAction,
        amount: 9000,
        refundedAmount: null,
      },
    ]

    const total = sumNetTotalSettledPaymentsForPaymentSet(payments)
    expect(total).toBe(6500)
  })

  it('should handle refunded payments by subtracting refunded amount', () => {
    const payments: Pick<
      Payment.Record,
      'status' | 'amount' | 'refundedAmount'
    >[] = [
      {
        status: PaymentStatus.Succeeded,
        amount: 1000,
        refundedAmount: 0,
      },
      {
        status: PaymentStatus.Refunded,
        amount: 2000,
        refundedAmount: 2000,
      },
      {
        status: PaymentStatus.Refunded,
        amount: 3000,
        refundedAmount: 3000,
      },
    ]

    const total = sumNetTotalSettledPaymentsForPaymentSet(payments)
    expect(total).toBe(1000)
  })
})

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

    const latestChargeId = 'ch_retry___succeeded'
    vi.mocked(getPaymentIntent).mockResolvedValue(
      createMockPaymentIntent({
        id: updatedFailedPayment.stripePaymentIntentId,
        latest_charge: latestChargeId,
      })
    )
    vi.mocked(confirmPaymentIntent).mockResolvedValue(
      createMockPaymentIntentResponse({
        id: updatedFailedPayment.stripePaymentIntentId,
        latest_charge: latestChargeId,
      })
    )
    vi.mocked(getStripeCharge).mockResolvedValue(
      createMockStripeCharge({
        id: latestChargeId,
        status: 'succeeded',
      })
    )

    const retriedPayment = await adminTransaction(
      async ({ transaction }) => {
        return retryPaymentTransaction(
          { id: updatedFailedPayment.id },
          transaction
        )
      }
    )

    expect(retriedPayment.subtotal).toBe(updatedFailedPayment.subtotal)
    expect(retriedPayment.taxAmount).toBe(updatedFailedPayment.taxAmount)
    expect(retriedPayment.stripeTaxCalculationId).toBe(
      updatedFailedPayment.stripeTaxCalculationId
    )
    expect(retriedPayment.stripeTaxTransactionId).toBe(
      updatedFailedPayment.stripeTaxTransactionId
    )
  })
})
