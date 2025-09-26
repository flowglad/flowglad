import { adminTransaction } from '@/db/adminTransaction'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import { selectDiscountRedemptions } from '@/db/tableMethods/discountRedemptionMethods'
import { CurrencyCode } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

export interface DiscountInfo {
  discountName: string
  discountCode: string
  discountAmount: number
  discountAmountType: string
}

/**
 * Fetches discount information for an invoice if it has a billing period.
 *
 * @param invoice - The invoice record that may have a billing period
 * @returns Discount information or null if no discount found
 */
export const fetchDiscountInfoForInvoice = async (
  invoice: any
): Promise<DiscountInfo | null> => {
  return await adminTransaction(async ({ transaction }) => {
    if (!invoice.billingPeriodId) {
      return null
    }

    const billingPeriod = await selectBillingPeriodById(
      invoice.billingPeriodId,
      transaction
    )

    if (!billingPeriod) {
      return null
    }

    const discountRedemptions = await selectDiscountRedemptions(
      { subscriptionId: billingPeriod.subscriptionId },
      transaction
    )

    if (discountRedemptions.length === 0) {
      return null
    }

    const discount = discountRedemptions[0]
    return {
      discountName: discount.discountName,
      discountCode: discount.discountCode,
      discountAmount: discount.discountAmount,
      discountAmountType: discount.discountAmountType,
    }
  })
}

export interface InvoiceTotals {
  subtotalAmount: string | null
  taxAmount: string | null
  totalAmount: string
}

/**
 * Converts invoice totals from Stripe format (cents) to human-readable format.
 * Uses pre-calculated invoice totals to ensure discounts are properly reflected.
 *
 * @param invoice - The invoice record with subtotal, taxAmount, and currency
 * @returns Formatted totals for display
 */
export const formatInvoiceTotals = (invoice: {
  subtotal: number | null
  taxAmount: number | null
  currency: CurrencyCode
}): InvoiceTotals => {
  const subtotalAmount =
    invoice.subtotal !== null
      ? stripeCurrencyAmountToHumanReadableCurrencyAmount(
          invoice.currency,
          invoice.subtotal
        )
      : null

  const taxAmount = invoice.taxAmount
    ? stripeCurrencyAmountToHumanReadableCurrencyAmount(
        invoice.currency,
        invoice.taxAmount
      )
    : null

  const totalAmount =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      invoice.currency,
      (invoice.subtotal || 0) + (invoice.taxAmount || 0)
    )

  return {
    subtotalAmount,
    taxAmount,
    totalAmount,
  }
}
