import { describe, expect, it } from 'vitest'
import type { Payment } from '@/db/schema/payments'
import { PaymentStatus } from '@/types'
import { sumNetTotalSettledPaymentsForPaymentSet } from './paymentHelpers'

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
