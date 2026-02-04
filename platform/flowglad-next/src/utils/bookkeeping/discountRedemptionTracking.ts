import { DiscountDuration, PaymentStatus } from '@db-core/enums'
import type { DiscountRedemption } from '@db-core/schema/discountRedemptions'
import type { Payment } from '@db-core/schema/payments'
import {
  selectDiscountRedemptions,
  updateDiscountRedemption,
} from '@/db/tableMethods/discountRedemptionMethods'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import type { DbTransaction } from '@/db/types'
import { panic } from '@/errors'

export const incrementNumberOfPaymentsForDiscountRedemption = async (
  discountRedemption: DiscountRedemption.Record,
  payment: Payment.Record,
  transaction: DbTransaction
) => {
  if (!discountRedemption.numberOfPayments) {
    return
  }
  const purchaseId = discountRedemption.purchaseId
  const subscriptionId = discountRedemption.subscriptionId
  if (!subscriptionId && !purchaseId) {
    panic(
      `Expected discountRedemption to have purchaseId or subscriptionId (id=${discountRedemption.id}).`
    )
  }
  const selectConditions: {
    purchaseId?: string
    subscriptionId?: string
    status: PaymentStatus
  } = {
    status: PaymentStatus.Succeeded,
  }

  if (subscriptionId) {
    selectConditions.subscriptionId = subscriptionId
  } else if (purchaseId) {
    selectConditions.purchaseId = purchaseId
  }

  const successfulPaymentsForDiscountRedemption =
    await selectPayments(selectConditions, transaction)

  const priorSuccessfulPaymentsForDiscountRedemption =
    successfulPaymentsForDiscountRedemption.filter(
      (successfulPayment) => successfulPayment.id !== payment.id
    )
  const numberOfPayments =
    priorSuccessfulPaymentsForDiscountRedemption.length + 1
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
    const selectConditions: {
      subscriptionId?: string
      purchaseId?: string
      fullyRedeemed: boolean
    } = {
      fullyRedeemed: false,
    }
    if (payment.subscriptionId) {
      selectConditions.subscriptionId = payment.subscriptionId
    }
    if (payment.purchaseId) {
      selectConditions.purchaseId = payment.purchaseId
    }
    const [discountRedemption] = await selectDiscountRedemptions(
      selectConditions,
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
