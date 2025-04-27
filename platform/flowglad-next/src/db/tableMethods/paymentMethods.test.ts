import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupInvoice,
  setupPayment,
} from '../../../seedDatabase'
import { PaymentStatus, PaymentMethodType } from '@/types'
import { nanoid } from '@/utils/core'
import {
  safelyUpdatePaymentForRefund,
  safelyUpdatePaymentStatus,
  selectPaymentById,
  updatePayment,
} from './paymentMethods'
import { Payment } from '../schema/payments'
import { Organization } from '../schema/organizations'
import { Invoice } from '../schema/invoices'
import { Customer } from '../schema/customers'

describe('paymentMethods.ts', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let invoice: Invoice.Record
  let payment: Payment.Record

  beforeEach(async () => {
    const setup = await setupOrg()
    organization = setup.organization

    // Setup customer
    customer = await setupCustomer({
      organizationId: organization.id,
      livemode: true,
    })

    // Setup invoice
    invoice = await setupInvoice({
      customerId: customer.id,
      organizationId: organization.id,
      priceId: setup.price.id,
      livemode: true,
    })

    // Setup payment
    payment = await setupPayment({
      stripeChargeId: `ch_${nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 1000,
      livemode: true,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
      paymentMethod: PaymentMethodType.Card,
    })
  })

  describe('safelyUpdatePaymentForRefund', () => {
    it('successfully updates a payment for refund', async () => {
      await adminTransaction(async ({ transaction }) => {
        const updatedPayment = await safelyUpdatePaymentForRefund(
          {
            id: payment.id,
            refunded: true,
            refundedAt: new Date(),
            refundedAmount: payment.amount,
            status: PaymentStatus.Refunded,
          },
          transaction
        )

        expect(updatedPayment.refunded).toBe(true)
        expect(updatedPayment.refundedAmount).toBe(payment.amount)
        expect(updatedPayment.refundedAt).not.toBeNull()
      })
    })
    it('fails if refund status is not explicitly set', async () => {
      await adminTransaction(async ({ transaction }) => {
        await expect(
          safelyUpdatePaymentForRefund(
            { id: payment.id, refunded: true },
            transaction
          )
        ).rejects.toThrow(
          `Failed to update payment ${payment.id}: Refunded amount must be the same as the original amount, Only refund status is supported`
        )
      })
    })

    it('fails if refund is for more than the payment amount', async () => {
      await adminTransaction(async ({ transaction }) => {
        const refundAmount = 1001
        await expect(
          safelyUpdatePaymentForRefund(
            {
              id: payment.id,
              refunded: true,
              refundedAt: new Date(),
              refundedAmount: refundAmount,
            },
            transaction
          )
        ).rejects.toThrow(
          `Failed to update payment ${payment.id}: Refunded amount must be the same as the original amount, Only refund status is supported`
        )
      })
    })

    it('throws error when payment is not found', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentPaymentId = nanoid()

        await expect(
          safelyUpdatePaymentForRefund(
            {
              id: nonExistentPaymentId,
              refunded: true,
              refundedAt: new Date(),
              refundedAmount: 500,
            },
            transaction
          )
        ).rejects.toThrow(
          `No payments found with id: ${nonExistentPaymentId}`
        )
      })
    })

    it('throws error when payment is not in a valid state for refund', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a payment in a non-refundable state
        const nonRefundablePayment = await setupPayment({
          stripeChargeId: `ch_${nanoid()}`,
          status: PaymentStatus.Processing,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice.id,
          paymentMethod: PaymentMethodType.Card,
        })

        await expect(
          safelyUpdatePaymentForRefund(
            {
              id: nonRefundablePayment.id,
              refunded: true,
              refundedAt: new Date(),
              refundedAmount: 500,
            },
            transaction
          )
        ).rejects.toThrow(
          `Payment ${nonRefundablePayment.id} is not in a state to be updated. Its status: ${nonRefundablePayment.status})`
        )
      })
    })

    it('allows updating an already refunded payment', async () => {
      await adminTransaction(async ({ transaction }) => {
        // First refund the payment
        await safelyUpdatePaymentForRefund(
          {
            id: payment.id,
            refunded: true,
            refundedAt: new Date(),
            refundedAmount: payment.amount,
            status: PaymentStatus.Refunded,
          },
          transaction
        )

        // Then update it again
        const updatedPayment = await safelyUpdatePaymentForRefund(
          {
            id: payment.id,
            refunded: true,
            refundedAt: new Date(),
            refundedAmount: payment.amount,
            status: PaymentStatus.Refunded,
          },
          transaction
        )

        expect(updatedPayment.refunded).toBe(true)
        expect(updatedPayment.refundedAmount).toBe(1000)
      })
    })
  })

  describe('safelyUpdatePaymentStatus', () => {
    it('successfully updates payment status', async () => {
      const processingPayment = await setupPayment({
        stripeChargeId: `ch_${nanoid()}`,
        status: PaymentStatus.Processing,
        amount: 1000,
        livemode: true,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        paymentMethod: PaymentMethodType.Card,
      })
      await adminTransaction(async ({ transaction }) => {
        const updatedPayment = await safelyUpdatePaymentStatus(
          processingPayment,
          PaymentStatus.Succeeded,
          transaction
        )

        expect(updatedPayment.status).toBe(PaymentStatus.Succeeded)

        // Verify the payment was actually updated in the database
        const fetchedPayment = await selectPaymentById(
          payment.id,
          transaction
        )
        expect(fetchedPayment?.status).toBe(PaymentStatus.Succeeded)
      })
    })

    it('throws error when payment is in a terminal state', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a payment in a terminal state
        const terminalPayment = await setupPayment({
          stripeChargeId: `ch_${nanoid()}`,
          status: PaymentStatus.Failed,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice.id,
          paymentMethod: PaymentMethodType.Card,
        })

        await expect(
          safelyUpdatePaymentStatus(
            terminalPayment,
            PaymentStatus.Succeeded,
            transaction
          )
        ).rejects.toThrow(
          `Payment ${terminalPayment.id} is in a terminal state: ${terminalPayment.status}; cannot update to ${PaymentStatus.Succeeded}`
        )
      })
    })

    it('allows updating from pending to processing', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a payment in pending state
        const pendingPayment = await setupPayment({
          stripeChargeId: `ch_${nanoid()}`,
          status: PaymentStatus.Processing,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice.id,
          paymentMethod: PaymentMethodType.Card,
        })

        const updatedPayment = await safelyUpdatePaymentStatus(
          pendingPayment,
          PaymentStatus.Processing,
          transaction
        )

        expect(updatedPayment.status).toBe(PaymentStatus.Processing)
      })
    })

    it('allows updating from processing to succeeded', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a payment in processing state
        const processingPayment = await setupPayment({
          stripeChargeId: `ch_${nanoid()}`,
          status: PaymentStatus.Processing,
          amount: 1000,
          livemode: true,
          customerId: customer.id,
          organizationId: organization.id,
          invoiceId: invoice.id,
          paymentMethod: PaymentMethodType.Card,
        })

        const updatedPayment = await safelyUpdatePaymentStatus(
          processingPayment,
          PaymentStatus.Succeeded,
          transaction
        )

        expect(updatedPayment.status).toBe(PaymentStatus.Succeeded)
      })
    })
  })
})
