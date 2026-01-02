import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Invoice } from '@/db/schema/invoices'
import type { Organization } from '@/db/schema/organizations'
import type { Payment } from '@/db/schema/payments'
import { PaymentMethodType, PaymentStatus } from '@/types'
import { nanoid } from '@/utils/core'
import {
  refundPaymentTransaction,
  sumNetTotalSettledPaymentsForPaymentSet,
} from './paymentHelpers'
import * as stripeUtils from './stripe'

// Mock the stripe utils
vi.mock('./stripe', async () => {
  const actual = await vi.importActual('./stripe')
  return {
    ...actual,
    refundPayment: vi.fn(),
    getPaymentIntent: vi.fn(),
    getStripeCharge: vi.fn(),
    listRefundsForCharge: vi.fn(),
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

  it('should handle partial refunds on succeeded payments by subtracting partial refund amount', () => {
    const payments: Pick<
      Payment.Record,
      'status' | 'amount' | 'refundedAmount'
    >[] = [
      {
        // $100 payment with $30 partial refund = $70 net revenue
        status: PaymentStatus.Succeeded,
        amount: 10000,
        refundedAmount: 3000,
      },
      {
        // $50 payment with no refund = $50 net revenue
        status: PaymentStatus.Succeeded,
        amount: 5000,
        refundedAmount: 0,
      },
      {
        // $200 payment fully refunded = $0 net revenue
        status: PaymentStatus.Refunded,
        amount: 20000,
        refundedAmount: 20000,
      },
    ]

    // Total: $70 + $50 + $0 = $120 = 12000 cents
    const total = sumNetTotalSettledPaymentsForPaymentSet(payments)
    expect(total).toBe(12000)
  })

  it('should correctly calculate net revenue with multiple partial refunds', () => {
    const payments: Pick<
      Payment.Record,
      'status' | 'amount' | 'refundedAmount'
    >[] = [
      {
        // $100 payment with $25 partial refund = $75 net
        status: PaymentStatus.Succeeded,
        amount: 10000,
        refundedAmount: 2500,
      },
      {
        // $80 payment with $40 partial refund = $40 net
        status: PaymentStatus.Succeeded,
        amount: 8000,
        refundedAmount: 4000,
      },
      {
        // $60 payment with $60 full refund (still Succeeded) = $0 net
        status: PaymentStatus.Succeeded,
        amount: 6000,
        refundedAmount: 6000,
      },
    ]

    // Total: $75 + $40 + $0 = $115 = 11500 cents
    const total = sumNetTotalSettledPaymentsForPaymentSet(payments)
    expect(total).toBe(11500)
  })
})

describe('refundPaymentTransaction', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let invoice: Invoice.Record
  let payment: Payment.Record

  beforeEach(async () => {
    vi.clearAllMocks()

    const setup = await setupOrg()
    organization = setup.organization

    customer = await setupCustomer({
      organizationId: organization.id,
      livemode: true,
    })

    invoice = await setupInvoice({
      customerId: customer.id,
      organizationId: organization.id,
      priceId: setup.price.id,
      livemode: true,
    })

    payment = await setupPayment({
      stripeChargeId: `ch_${nanoid()}`,
      stripePaymentIntentId: `pi_${nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 10000, // $100.00
      livemode: true,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
      paymentMethod: PaymentMethodType.Card,
    })
  })

  describe('partial refunds', () => {
    it('should process a partial refund and keep payment status as Succeeded', async () => {
      const partialRefundAmount = 3000 // $30.00
      const refundCreatedTimestamp = Math.floor(Date.now() / 1000)

      vi.mocked(stripeUtils.refundPayment).mockResolvedValue({
        id: `re_${nanoid()}`,
        object: 'refund',
        amount: partialRefundAmount,
        created: refundCreatedTimestamp,
        currency: 'usd',
        status: 'succeeded',
      } as any)

      await adminTransaction(async ({ transaction }) => {
        const updatedPayment = await refundPaymentTransaction(
          { id: payment.id, partialAmount: partialRefundAmount },
          transaction
        )

        // Payment should remain Succeeded for partial refunds
        expect(updatedPayment.status).toBe(PaymentStatus.Succeeded)
        expect(updatedPayment.refunded).toBe(false)
        expect(updatedPayment.refundedAmount).toBe(
          partialRefundAmount
        )
        expect(updatedPayment.refundedAt).not.toBeNull()
      })

      expect(stripeUtils.refundPayment).toHaveBeenCalledWith(
        payment.stripePaymentIntentId,
        partialRefundAmount,
        payment.livemode
      )
    })

    it('should process a full refund and set payment status to Refunded', async () => {
      const fullRefundAmount = 10000 // $100.00 (full amount)
      const refundCreatedTimestamp = Math.floor(Date.now() / 1000)

      vi.mocked(stripeUtils.refundPayment).mockResolvedValue({
        id: `re_${nanoid()}`,
        object: 'refund',
        amount: fullRefundAmount,
        created: refundCreatedTimestamp,
        currency: 'usd',
        status: 'succeeded',
      } as any)

      await adminTransaction(async ({ transaction }) => {
        const updatedPayment = await refundPaymentTransaction(
          { id: payment.id, partialAmount: null },
          transaction
        )

        // Payment should be Refunded for full refunds
        expect(updatedPayment.status).toBe(PaymentStatus.Refunded)
        expect(updatedPayment.refunded).toBe(true)
        expect(updatedPayment.refundedAmount).toBe(fullRefundAmount)
        expect(updatedPayment.refundedAt).not.toBeNull()
      })
    })

    it('should use actual refund amount from Stripe, not the payment amount', async () => {
      // This test verifies the bug fix: we should use refund.amount, not payment.amount
      const requestedPartialAmount = 3000 // $30.00
      const stripeRefundAmount = 3000 // Stripe confirms $30.00
      const refundCreatedTimestamp = Math.floor(Date.now() / 1000)

      vi.mocked(stripeUtils.refundPayment).mockResolvedValue({
        id: `re_${nanoid()}`,
        object: 'refund',
        amount: stripeRefundAmount, // This is what Stripe actually refunded
        created: refundCreatedTimestamp,
        currency: 'usd',
        status: 'succeeded',
      } as any)

      await adminTransaction(async ({ transaction }) => {
        const updatedPayment = await refundPaymentTransaction(
          { id: payment.id, partialAmount: requestedPartialAmount },
          transaction
        )

        // Should record the actual Stripe refund amount, NOT payment.amount (10000)
        expect(updatedPayment.refundedAmount).toBe(stripeRefundAmount)
        expect(updatedPayment.refundedAmount).not.toBe(payment.amount)
      })
    })

    it('should correctly handle edge case where refund equals payment amount', async () => {
      const refundCreatedTimestamp = Math.floor(Date.now() / 1000)

      vi.mocked(stripeUtils.refundPayment).mockResolvedValue({
        id: `re_${nanoid()}`,
        object: 'refund',
        amount: payment.amount, // Exact match
        created: refundCreatedTimestamp,
        currency: 'usd',
        status: 'succeeded',
      } as any)

      await adminTransaction(async ({ transaction }) => {
        const updatedPayment = await refundPaymentTransaction(
          { id: payment.id, partialAmount: payment.amount },
          transaction
        )

        // When refund equals payment, it's a full refund
        expect(updatedPayment.status).toBe(PaymentStatus.Refunded)
        expect(updatedPayment.refunded).toBe(true)
        expect(updatedPayment.refundedAmount).toBe(payment.amount)
      })
    })
  })

  describe('validation errors', () => {
    it('should throw error when payment is not found', async () => {
      await adminTransaction(async ({ transaction }) => {
        await expect(
          refundPaymentTransaction(
            { id: 'non_existent_id', partialAmount: null },
            transaction
          )
        ).rejects.toThrow(
          'No payments found with id: non_existent_id'
        )
      })
    })

    it('should throw error when payment is already refunded', async () => {
      const refundedPayment = await setupPayment({
        stripeChargeId: `ch_${nanoid()}`,
        stripePaymentIntentId: `pi_${nanoid()}`,
        status: PaymentStatus.Refunded,
        amount: 10000,
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
        refunded: true,
        refundedAmount: 10000,
        refundedAt: Date.now(),
      })

      await adminTransaction(async ({ transaction }) => {
        await expect(
          refundPaymentTransaction(
            { id: refundedPayment.id, partialAmount: null },
            transaction
          )
        ).rejects.toThrow('Payment has already been refunded')
      })
    })

    it('should throw error when payment is still processing', async () => {
      const processingPayment = await setupPayment({
        stripeChargeId: `ch_${nanoid()}`,
        stripePaymentIntentId: `pi_${nanoid()}`,
        status: PaymentStatus.Processing,
        amount: 10000,
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
      })

      await adminTransaction(async ({ transaction }) => {
        await expect(
          refundPaymentTransaction(
            { id: processingPayment.id, partialAmount: null },
            transaction
          )
        ).rejects.toThrow(
          'Cannot refund a payment that is still processing'
        )
      })
    })

    it('should throw error when partial amount exceeds payment amount', async () => {
      await adminTransaction(async ({ transaction }) => {
        await expect(
          refundPaymentTransaction(
            { id: payment.id, partialAmount: 15000 }, // $150 > $100
            transaction
          )
        ).rejects.toThrow(
          'Partial amount cannot be greater than the payment amount'
        )
      })
    })
  })
})
