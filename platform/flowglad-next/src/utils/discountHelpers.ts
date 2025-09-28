import { adminTransaction } from '@/db/adminTransaction'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import { selectDiscountRedemptions } from '@/db/tableMethods/discountRedemptionMethods'
import { CurrencyCode } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { calculateInvoiceBaseAmount } from '@/utils/bookkeeping/fees/common'

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
 * Formats invoice totals from pre-calculated values.
 * Note: This function cannot display discounts as it doesn't have access to line items.
 * Use calculateInvoiceTotalsFromLineItems() for discount scenarios.
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

export interface InvoiceTotalsWithOriginal {
  originalAmount: string
  subtotalAmount: string
  taxAmount: string | null
  totalAmount: string
}

/**
 * Calculates invoice totals from line items using the CTO approach.
 * This avoids the reverse engineering logic by calculating from line items directly.
 *
 * @param invoice - The invoice record with taxAmount and currency
 * @param invoiceLineItems - The line items to calculate from
 * @param discountInfo - Optional discount information
 * @returns Calculated totals for display
 */
export const calculateInvoiceTotalsFromLineItems = (
  invoice: {
    taxAmount: number | null
    currency: CurrencyCode
  },
  invoiceLineItems: { price: number; quantity: number }[],
  discountInfo?: DiscountInfo | null
): InvoiceTotalsWithOriginal => {
  // Calculate base amount from line items (like payment receipt PDF)
  const baseAmount = calculateInvoiceBaseAmount({ invoiceLineItems })

  // Calculate discount amount
  const discountAmount = discountInfo
    ? discountInfo.discountAmount
    : 0

  // Calculate totals
  const originalAmountInCents = baseAmount
  const subtotalInCents = baseAmount - discountAmount
  const taxAmountInCents = invoice.taxAmount || 0
  const totalInCents = subtotalInCents + taxAmountInCents

  // Convert to human-readable format
  const originalAmount =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      invoice.currency,
      originalAmountInCents
    )

  const subtotalAmount =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      invoice.currency,
      subtotalInCents
    )

  const taxAmount = invoice.taxAmount
    ? stripeCurrencyAmountToHumanReadableCurrencyAmount(
        invoice.currency,
        taxAmountInCents
      )
    : null

  const totalAmount =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      invoice.currency,
      totalInCents
    )

  return {
    originalAmount,
    subtotalAmount,
    taxAmount,
    totalAmount,
  }
}
