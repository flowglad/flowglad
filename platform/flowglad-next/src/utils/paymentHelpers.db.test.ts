import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Result } from 'better-result'
import type Stripe from 'stripe'
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
import { NotFoundError, ValidationError } from '@/errors'
import {
  PaymentMethodType,
  PaymentStatus,
  StripeConnectContractType,
} from '@/types'
import { nanoid } from '@/utils/core'
import {
  refundPaymentTransaction,
  sumNetTotalSettledPaymentsForPaymentSet,
} from './paymentHelpers'

// Use global mocks from bun.db.mocks.ts
const mockRefundPayment = globalThis.__mockRefundPayment
const mockGetPaymentIntent = globalThis.__mockGetPaymentIntent
const mockGetStripeCharge = globalThis.__mockGetStripeCharge
const mockListRefundsForCharge = globalThis.__mockListRefundsForCharge
const mockReverseStripeTaxTransaction =
  globalThis.__mockReverseStripeTaxTransaction

const makeStripeRefundResponse = ({
  amount,
  created,
  currency = 'usd',
}: {
  amount: number
  created: number
  currency?: string
}): Stripe.Response<Stripe.Refund> => {
  return {
    id: `re_${nanoid()}`,
    object: 'refund',
    amount,
    balance_transaction: null,
    charge: null,
    created,
    currency,
    metadata: null,
    payment_intent: null,
    reason: null,
    receipt_number: null,
    source_transfer_reversal: null,
    status: 'succeeded',
    transfer_reversal: null,
    lastResponse: {
      headers: {},
      requestId: `req_${nanoid()}`,
      statusCode: 200,
    },
  }
}

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
    mock.clearAllMocks()

    const setup = (await setupOrg()).unwrap()
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

      mockRefundPayment.mockResolvedValue(
        Result.ok(
          makeStripeRefundResponse({
            amount: partialRefundAmount,
            created: refundCreatedTimestamp,
          })
        )
      )

      await adminTransaction(async ({ transaction }) => {
        const updatedPaymentResult = await refundPaymentTransaction(
          { id: payment.id, partialAmount: partialRefundAmount },
          transaction
        )
        const updatedPayment = updatedPaymentResult.unwrap()

        // Payment should remain Succeeded for partial refunds
        expect(updatedPayment.status).toBe(PaymentStatus.Succeeded)
        expect(updatedPayment.refunded).toBe(false)
        expect(updatedPayment.refundedAmount).toBe(
          partialRefundAmount
        )
        expect(typeof updatedPayment.refundedAt).toBe('number')
      })

      expect(mockRefundPayment).toHaveBeenCalledWith(
        payment.stripePaymentIntentId,
        partialRefundAmount,
        payment.livemode
      )
    })

    it('should process a full refund and set payment status to Refunded', async () => {
      const fullRefundAmount = 10000 // $100.00 (full amount)
      const refundCreatedTimestamp = Math.floor(Date.now() / 1000)

      mockRefundPayment.mockResolvedValue(
        Result.ok(
          makeStripeRefundResponse({
            amount: fullRefundAmount,
            created: refundCreatedTimestamp,
          })
        )
      )

      await adminTransaction(async ({ transaction }) => {
        const updatedPaymentResult = await refundPaymentTransaction(
          { id: payment.id, partialAmount: null },
          transaction
        )
        const updatedPayment = updatedPaymentResult.unwrap()

        // Payment should be Refunded for full refunds
        expect(updatedPayment.status).toBe(PaymentStatus.Refunded)
        expect(updatedPayment.refunded).toBe(true)
        expect(updatedPayment.refundedAmount).toBe(fullRefundAmount)
        expect(typeof updatedPayment.refundedAt).toBe('number')
      })
    })

    it('should use actual refund amount from Stripe, not the payment amount', async () => {
      // This test verifies the bug fix: we should use refund.amount, not payment.amount
      const requestedPartialAmount = 3000 // $30.00
      const stripeRefundAmount = 3000 // Stripe confirms $30.00
      const refundCreatedTimestamp = Math.floor(Date.now() / 1000)

      mockRefundPayment.mockResolvedValue(
        Result.ok(
          makeStripeRefundResponse({
            // This is what Stripe actually refunded
            amount: stripeRefundAmount,
            created: refundCreatedTimestamp,
          })
        )
      )

      await adminTransaction(async ({ transaction }) => {
        const updatedPaymentResult = await refundPaymentTransaction(
          { id: payment.id, partialAmount: requestedPartialAmount },
          transaction
        )
        const updatedPayment = updatedPaymentResult.unwrap()

        // Should record the actual Stripe refund amount, NOT payment.amount (10000)
        expect(updatedPayment.refundedAmount).toBe(stripeRefundAmount)
        expect(updatedPayment.refundedAmount).not.toBe(payment.amount)
      })
    })

    it('should correctly handle edge case where refund equals payment amount', async () => {
      const refundCreatedTimestamp = Math.floor(Date.now() / 1000)

      mockRefundPayment.mockResolvedValue(
        Result.ok(
          makeStripeRefundResponse({
            // Exact match
            amount: payment.amount,
            created: refundCreatedTimestamp,
          })
        )
      )

      await adminTransaction(async ({ transaction }) => {
        const updatedPaymentResult = await refundPaymentTransaction(
          { id: payment.id, partialAmount: payment.amount },
          transaction
        )
        const updatedPayment = updatedPaymentResult.unwrap()

        // When refund equals payment, it's a full refund
        expect(updatedPayment.status).toBe(PaymentStatus.Refunded)
        expect(updatedPayment.refunded).toBe(true)
        expect(updatedPayment.refundedAmount).toBe(payment.amount)
      })
    })
    it('should accumulate refundedAmount across multiple partial refunds', async () => {
      const firstRefundCreatedTimestamp = Math.floor(
        Date.now() / 1000
      )
      const secondRefundCreatedTimestamp =
        firstRefundCreatedTimestamp + 10

      mockRefundPayment
        .mockResolvedValueOnce(
          Result.ok(
            makeStripeRefundResponse({
              amount: 3000,
              created: firstRefundCreatedTimestamp,
            })
          )
        )
        .mockResolvedValueOnce(
          Result.ok(
            makeStripeRefundResponse({
              amount: 7000,
              created: secondRefundCreatedTimestamp,
            })
          )
        )

      await adminTransaction(async ({ transaction }) => {
        const updatedPaymentResult = await refundPaymentTransaction(
          { id: payment.id, partialAmount: 3000 },
          transaction
        )
        const updatedPayment = updatedPaymentResult.unwrap()

        expect(updatedPayment.status).toBe(PaymentStatus.Succeeded)
        expect(updatedPayment.refunded).toBe(false)
        expect(updatedPayment.refundedAmount).toBe(3000)
      })

      await adminTransaction(async ({ transaction }) => {
        const updatedPaymentResult = await refundPaymentTransaction(
          { id: payment.id, partialAmount: 7000 },
          transaction
        )
        const updatedPayment = updatedPaymentResult.unwrap()

        expect(updatedPayment.status).toBe(PaymentStatus.Refunded)
        expect(updatedPayment.refunded).toBe(true)
        expect(updatedPayment.refundedAmount).toBe(payment.amount)
      })
    })
  })

  describe('validation errors', () => {
    it('returns NotFoundError when payment is not found', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result = await refundPaymentTransaction(
          { id: 'non_existent_id', partialAmount: null },
          transaction
        )
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(NotFoundError)
          expect(result.error.message).toBe(
            'Payment not found: non_existent_id'
          )
        }
      })
    })

    it('returns ValidationError when payment is already refunded', async () => {
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
        const result = await refundPaymentTransaction(
          { id: refundedPayment.id, partialAmount: null },
          transaction
        )
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(ValidationError)
          expect(result.error.message).toBe(
            'Invalid status: Payment has already been refunded'
          )
        }
      })
    })

    it('returns ValidationError when payment is still processing', async () => {
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
        const result = await refundPaymentTransaction(
          { id: processingPayment.id, partialAmount: null },
          transaction
        )
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(ValidationError)
          expect(result.error.message).toBe(
            'Invalid status: Cannot refund a payment that is still processing'
          )
        }
      })
    })

    it('returns ValidationError when partial amount exceeds payment amount', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result = await refundPaymentTransaction(
          { id: payment.id, partialAmount: 15000 }, // $150 > $100
          transaction
        )
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(ValidationError)
          expect(result.error.message).toBe(
            'Invalid partialAmount: Partial amount cannot be greater than the payment amount'
          )
        }
      })
    })

    it('returns ValidationError when partial amount is not positive', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result = await refundPaymentTransaction(
          { id: payment.id, partialAmount: 0 },
          transaction
        )
        expect(result.status).toBe('error')
        if (result.status === 'error') {
          expect(result.error).toBeInstanceOf(ValidationError)
          expect(result.error.message).toBe(
            'Invalid partialAmount: Partial amount must be greater than 0'
          )
        }
      })
    })
  })

  describe('tax reversal for MOR organizations', () => {
    let morOrganization: Organization.Record
    let morCustomer: Customer.Record
    let morInvoice: Invoice.Record
    let morPaymentWithTax: Payment.Record

    beforeEach(async () => {
      const setup = await setupOrg({
        stripeConnectContractType:
          StripeConnectContractType.MerchantOfRecord,
      })
      morOrganization = setup.organization

      morCustomer = await setupCustomer({
        organizationId: morOrganization.id,
        livemode: true,
      })

      morInvoice = await setupInvoice({
        customerId: morCustomer.id,
        organizationId: morOrganization.id,
        priceId: setup.price.id,
        livemode: true,
      })

      morPaymentWithTax = await setupPayment({
        stripeChargeId: `ch_${nanoid()}`,
        stripePaymentIntentId: `pi_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 10800, // $100.00 + $8.00 tax
        livemode: true,
        customerId: morCustomer.id,
        organizationId: morOrganization.id,
        invoiceId: morInvoice.id,
        paymentMethod: PaymentMethodType.Card,
        stripeTaxTransactionId: `tax_txn_${nanoid()}`,
        taxAmount: 800,
      })

      mockReverseStripeTaxTransaction.mockResolvedValue(null)
    })

    it('calls reverseStripeTaxTransaction with mode: full on full refund for MOR organization', async () => {
      const fullRefundAmount = 10800
      const refundCreatedTimestamp = Math.floor(Date.now() / 1000)

      mockRefundPayment.mockResolvedValue(
        Result.ok(
          makeStripeRefundResponse({
            amount: fullRefundAmount,
            created: refundCreatedTimestamp,
          })
        )
      )

      await adminTransaction(async ({ transaction }) => {
        await refundPaymentTransaction(
          { id: morPaymentWithTax.id, partialAmount: null },
          transaction
        )
      })

      expect(mockReverseStripeTaxTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          stripeTaxTransactionId:
            morPaymentWithTax.stripeTaxTransactionId,
          mode: 'full',
          livemode: morPaymentWithTax.livemode,
        })
      )
    })

    it('calls reverseStripeTaxTransaction with mode: partial and flatAmount on partial refund for MOR organization', async () => {
      const partialRefundAmount = 5000
      const refundCreatedTimestamp = Math.floor(Date.now() / 1000)

      mockRefundPayment.mockResolvedValue(
        Result.ok(
          makeStripeRefundResponse({
            amount: partialRefundAmount,
            created: refundCreatedTimestamp,
          })
        )
      )

      await adminTransaction(async ({ transaction }) => {
        await refundPaymentTransaction(
          {
            id: morPaymentWithTax.id,
            partialAmount: partialRefundAmount,
          },
          transaction
        )
      })

      expect(mockReverseStripeTaxTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          stripeTaxTransactionId:
            morPaymentWithTax.stripeTaxTransactionId,
          mode: 'partial',
          flatAmount: partialRefundAmount,
          livemode: morPaymentWithTax.livemode,
        })
      )
    })

    it('succeeds with refund even if tax reversal throws an error (best-effort)', async () => {
      const fullRefundAmount = 10800
      const refundCreatedTimestamp = Math.floor(Date.now() / 1000)

      mockRefundPayment.mockResolvedValue(
        Result.ok(
          makeStripeRefundResponse({
            amount: fullRefundAmount,
            created: refundCreatedTimestamp,
          })
        )
      )

      mockReverseStripeTaxTransaction.mockRejectedValue(
        new Error('Stripe API error')
      )

      await adminTransaction(async ({ transaction }) => {
        const updatedPaymentResult = await refundPaymentTransaction(
          { id: morPaymentWithTax.id, partialAmount: null },
          transaction
        )
        const updatedPayment = updatedPaymentResult.unwrap()

        // Refund should still succeed despite tax reversal failure
        expect(updatedPayment.status).toBe(PaymentStatus.Refunded)
        expect(updatedPayment.refunded).toBe(true)
        expect(updatedPayment.refundedAmount).toBe(fullRefundAmount)
      })
    })

    it('does not call reverseStripeTaxTransaction when stripeTaxTransactionId is null', async () => {
      const paymentWithoutTax = await setupPayment({
        stripeChargeId: `ch_${nanoid()}`,
        stripePaymentIntentId: `pi_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 10000, // $100.00 no tax
        livemode: true,
        customerId: morCustomer.id,
        organizationId: morOrganization.id,
        invoiceId: morInvoice.id,
        paymentMethod: PaymentMethodType.Card,
        stripeTaxTransactionId: null,
        taxAmount: 0,
      })

      const refundCreatedTimestamp = Math.floor(Date.now() / 1000)

      mockRefundPayment.mockResolvedValue(
        Result.ok(
          makeStripeRefundResponse({
            amount: 10000,
            created: refundCreatedTimestamp,
          })
        )
      )

      await adminTransaction(async ({ transaction }) => {
        await refundPaymentTransaction(
          { id: paymentWithoutTax.id, partialAmount: null },
          transaction
        )
      })

      expect(mockReverseStripeTaxTransaction).not.toHaveBeenCalled()
    })
  })

  describe('tax reversal skipped for Platform organizations', () => {
    it('does not call reverseStripeTaxTransaction for Platform organization refunds', async () => {
      // The default organization from setupOrg is Platform
      const refundCreatedTimestamp = Math.floor(Date.now() / 1000)

      // Create payment with a tax transaction ID (even though Platform orgs
      // wouldn't normally have this, we want to verify it's still skipped)
      const platformPaymentWithTaxId = await setupPayment({
        stripeChargeId: `ch_${nanoid()}`,
        stripePaymentIntentId: `pi_${nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 10000,
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
        stripeTaxTransactionId: `tax_txn_${nanoid()}`,
      })

      mockRefundPayment.mockResolvedValue(
        Result.ok(
          makeStripeRefundResponse({
            amount: 10000,
            created: refundCreatedTimestamp,
          })
        )
      )

      await adminTransaction(async ({ transaction }) => {
        await refundPaymentTransaction(
          { id: platformPaymentWithTaxId.id, partialAmount: null },
          transaction
        )
      })

      // Should NOT be called because the org is Platform, not MOR
      expect(mockReverseStripeTaxTransaction).not.toHaveBeenCalled()
    })
  })
})
