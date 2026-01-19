import { adminTransaction } from '@/db/adminTransaction'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import { selectDiscountRedemptions } from '@/db/tableMethods/discountRedemptionMethods'
import type { CurrencyCode } from '@/types'
import { calculateInvoiceBaseAmount } from '@/utils/bookkeeping/fees/common'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

export interface DiscountInfo {
  discountName: string
  discountCode: string
  discountAmount: number
  discountAmountType: string
}

/**
 * Calculates the actual discount amount in cents from discount info and base amount.
 * Handles both fixed and percentage discount types correctly.
 *
 * @param baseAmount - The base amount in cents to calculate discount from
 * @param discountInfo - The discount information containing amount and type
 * @returns The calculated discount amount in cents
 */
export const calculateDiscountAmount = (
  baseAmount: number,
  discountInfo: DiscountInfo
): number => {
  if (discountInfo.discountAmountType === 'fixed') {
    // For fixed discounts, amount is already in cents (e.g., 1000 = $10.00)
    return Math.min(discountInfo.discountAmount, baseAmount) // Can't discount more than the base amount
  }

  if (discountInfo.discountAmountType === 'percent') {
    // For percentage discounts, amount is the percentage value (e.g., 10 = 10%)
    return Math.round(
      (baseAmount * Math.min(discountInfo.discountAmount, 100)) / 100
    )
  }

  return 0
}

/**
 * Convenience function that calculates discount amount with null safety.
 * Returns 0 if discountInfo is null or undefined.
 *
 * @param baseAmount - The base amount in cents to calculate discount from
 * @param discountInfo - The discount information (can be null/undefined)
 * @returns The calculated discount amount in cents, or 0 if no discount info
 */
export const calculateDiscountAmountSafe = (
  baseAmount: number,
  discountInfo: DiscountInfo | null | undefined
): number => {
  return discountInfo
    ? calculateDiscountAmount(baseAmount, discountInfo)
    : 0
}

/**
 * Interface for invoice totals calculation result
 */
export interface InvoiceTotalsCalculation {
  // Raw amounts in cents
  originalAmountInCents: number
  subtotalInCents: number
  taxAmountInCents: number
  totalInCents: number
  calculatedDiscountAmount: number

  // Formatted amounts for display
  originalAmount: string
  subtotalAmount: string
  taxAmount: string | null
  totalAmount: string

  // Enhanced discount info with currency
  discountInfoWithCurrency: {
    discountName: string
    discountCode: string
    discountAmount: number
    discountAmountType: string
    currency: CurrencyCode
  } | null
}

/**
 * Comprehensive helper that calculates invoice totals with discount handling.
 * This encapsulates the entire pattern of: calculate base amount → apply discount → format for display.
 *
 * @param lineItems - Array of line items with price and quantity
 * @param invoice - Invoice object with taxAmount and currency
 * @param discountInfo - Optional discount information
 * @returns Complete totals calculation with formatted amounts
 */
export const calculateInvoiceTotalsWithDiscounts = (
  lineItems: { price: number; quantity: number }[],
  invoice: {
    taxAmount: number | null
    currency: CurrencyCode
  },
  discountInfo?: DiscountInfo | null
): InvoiceTotalsCalculation => {
  // Calculate base amount from line items
  const baseAmount = lineItems.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  )

  // Calculate discount amount using shared logic
  const calculatedDiscountAmount = calculateDiscountAmountSafe(
    baseAmount,
    discountInfo
  )

  // Calculate totals with the correct discount amount
  const originalAmountInCents = baseAmount
  const subtotalInCents = baseAmount - calculatedDiscountAmount
  const taxAmountInCents = invoice.taxAmount || 0
  const totalInCents = subtotalInCents + taxAmountInCents

  // Format amounts for display
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
  const taxAmount =
    taxAmountInCents > 0
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

  // Prepare discount info with calculated amount for TotalSection
  const discountInfoWithCurrency = discountInfo
    ? {
        ...discountInfo,
        discountAmount: calculatedDiscountAmount, // Use calculated amount instead of stored percentage
        currency: invoice.currency,
      }
    : null

  return {
    // Raw amounts in cents
    originalAmountInCents,
    subtotalInCents,
    taxAmountInCents,
    totalInCents,
    calculatedDiscountAmount,

    // Formatted amounts for display
    originalAmount,
    subtotalAmount,
    taxAmount,
    totalAmount,

    // Enhanced discount info
    discountInfoWithCurrency,
  }
}

/**
 * Simplified helper for PDF and receipt generation that only calculates raw amounts.
 *
 * @param lineItems - Array of line items with price and quantity
 * @param invoice - Invoice object with taxAmount
 * @param discountInfo - Optional discount information
 * @returns Raw amounts in cents for PDF and receipt generation
 */
export const calculateInvoiceTotalsRaw = (
  lineItems: { price: number; quantity: number }[],
  invoice: {
    taxAmount: number | null
  },
  discountInfo?: DiscountInfo | null
): {
  baseAmount: number
  subtotal: number
  taxAmount: number
  total: number
  calculatedDiscountAmount: number
} => {
  const baseAmount = lineItems.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  )
  const calculatedDiscountAmount = calculateDiscountAmountSafe(
    baseAmount,
    discountInfo
  )
  const subtotal = baseAmount - calculatedDiscountAmount
  const taxAmount = invoice.taxAmount ?? 0
  const total = subtotal + taxAmount

  return {
    baseAmount,
    subtotal,
    taxAmount,
    total,
    calculatedDiscountAmount,
  }
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
  return (
    await adminTransaction(async ({ transaction }) => {
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
  ).unwrap()
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
  discountAmount: string
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

  const discountAmount = calculateDiscountAmountSafe(
    baseAmount,
    discountInfo
  )

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

  const discountAmountFormatted =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      invoice.currency,
      discountAmount
    )

  return {
    originalAmount,
    subtotalAmount,
    taxAmount,
    totalAmount,
    discountAmount: discountAmountFormatted,
  }
}

/**
 * Calculates invoice totals with proper discount handling.
 * This provides an alternative to calculateInvoiceTotalsFromLineItems with the same logic.
 *
 * @param invoice - The invoice record with taxAmount and currency
 * @param invoiceLineItems - The line items to calculate from
 * @param discountInfo - Optional discount information
 * @returns Calculated totals for display
 */
export const calculateInvoiceTotals = (
  invoice: {
    taxAmount: number | null
    currency: string
  },
  invoiceLineItems: { price: number; quantity: number }[],
  discountInfo?: DiscountInfo | null
): {
  originalAmount: string
  subtotalAmount: string
  taxAmount: string | null
  totalAmount: string
  discountAmount: number
} => {
  // Calculate base amount from line items
  const baseAmount = invoiceLineItems.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  )

  // Calculate discount amount using the correct logic
  const discountAmount = calculateDiscountAmountSafe(
    baseAmount,
    discountInfo
  )

  // Calculate totals
  const originalAmountInCents = baseAmount
  const subtotalInCents = baseAmount - discountAmount
  const taxAmountInCents = invoice.taxAmount || 0
  const totalInCents = subtotalInCents + taxAmountInCents

  // Format amounts for display (this would need to be imported from utils/stripe)
  // For now, returning the raw values - the calling code should format them
  return {
    originalAmount: originalAmountInCents.toString(),
    subtotalAmount: subtotalInCents.toString(),
    taxAmount:
      taxAmountInCents > 0 ? taxAmountInCents.toString() : null,
    totalAmount: totalInCents.toString(),
    discountAmount,
  }
}
