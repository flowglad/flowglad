import { DiscountRedemption } from '@/db/schema/discountRedemptions'
import { Payment } from '@/db/schema/payments'
import {
  selectDiscountRedemptions,
  updateDiscountRedemption,
} from '@/db/tableMethods/discountRedemptionMethods'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import { DbTransaction } from '@/db/types'
import { DiscountDuration, PaymentStatus } from '@/types'

const incrementNumberOfPaymentsForDiscountRedemption = async (
  discountRedemption: DiscountRedemption.Record,
  payment: Payment.Record,
  transaction: DbTransaction
) => {
  if (!discountRedemption.numberOfPayments) {
    return
  }
  const successfulPaymentsForSubscription = await selectPayments(
    {
      subscriptionId: discountRedemption.subscriptionId,
      status: PaymentStatus.Succeeded,
    },
    transaction
  )
  const priorSuccessfulPaymentsForSubscription =
    successfulPaymentsForSubscription.filter(
      (successfulPayment) => successfulPayment.id !== payment.id
    )
  const numberOfPayments =
    priorSuccessfulPaymentsForSubscription.length + 1
  if (numberOfPayments >= discountRedemption.numberOfPayments) {
    await updateDiscountRedemption(
      {
        ...discountRedemption,
        fullyRedeemed: true,
      },
      transaction
    )
  }
}

export const safelyIncrementDiscountRedemptionSubscriptionPayment =
  async (payment: Payment.Record, transaction: DbTransaction) => {
    if (!payment.subscriptionId && !payment.purchaseId) {
      return
    }
    const [discountRedemption] = await selectDiscountRedemptions(
      {
        subscriptionId: payment.subscriptionId,
        purchaseId: payment.purchaseId ?? undefined,
        fullyRedeemed: false,
      },
      transaction
    )

    if (!discountRedemption) {
      return
    }
    if (discountRedemption.duration === DiscountDuration.Forever) {
      return
    }
    if (discountRedemption.duration === DiscountDuration.Once) {
      await updateDiscountRedemption(
        {
          ...discountRedemption,
          fullyRedeemed: true,
        },
        transaction
      )
    }

    if (
      discountRedemption.duration ===
      DiscountDuration.NumberOfPayments
    ) {
      await incrementNumberOfPaymentsForDiscountRedemption(
        discountRedemption,
        payment,
        transaction
      )
    }
  }
