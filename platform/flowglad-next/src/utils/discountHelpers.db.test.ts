import { describe, expect, it } from 'bun:test'
import { CurrencyCode } from '@/types'
import {
  calculateDiscountAmount,
  calculateDiscountAmountSafe,
  calculateInvoiceTotals,
  calculateInvoiceTotalsFromLineItems,
  calculateInvoiceTotalsRaw,
  calculateInvoiceTotalsWithDiscounts,
  type DiscountInfo,
} from './discountHelpers'

describe('discountHelpers', () => {
  const mockLineItems = [
    { price: 2500, quantity: 2 }, // $25.00 * 2 = $50.00
    { price: 1000, quantity: 1 }, // $10.00 * 1 = $10.00
  ] // Total: $60.00

  const mockInvoice = {
    taxAmount: 600, // $6.00 tax
    currency: CurrencyCode.USD,
  }

  const mockDiscountInfo: DiscountInfo = {
    discountName: 'Test Discount',
    discountCode: 'TEST10',
    discountAmount: 10, // 10%
    discountAmountType: 'percent',
  }

  describe('calculateDiscountAmount', () => {
    it('should calculate percentage discount correctly', () => {
      const result = calculateDiscountAmount(6000, mockDiscountInfo)
      expect(result).toBe(600) // 10% of $60.00 = $6.00
    })

    it('should calculate fixed discount correctly', () => {
      const fixedDiscount: DiscountInfo = {
        ...mockDiscountInfo,
        discountAmount: 500, // $5.00
        discountAmountType: 'fixed',
      }
      const result = calculateDiscountAmount(6000, fixedDiscount)
      expect(result).toBe(500)
    })

    it('should cap percentage discount at 100%', () => {
      const largeDiscount: DiscountInfo = {
        ...mockDiscountInfo,
        discountAmount: 150, // 150%
      }
      const result = calculateDiscountAmount(6000, largeDiscount)
      expect(result).toBe(6000) // Should be capped at 100% = $60.00
    })

    it('should handle zero discount', () => {
      const zeroDiscount: DiscountInfo = {
        ...mockDiscountInfo,
        discountAmount: 0,
      }
      const result = calculateDiscountAmount(6000, zeroDiscount)
      expect(result).toBe(0)
    })
  })

  describe('calculateDiscountAmountSafe', () => {
    it('should return discount amount when discountInfo is provided', () => {
      const result = calculateDiscountAmountSafe(
        6000,
        mockDiscountInfo
      )
      expect(result).toBe(600) // 10% of $60.00 = $6.00
    })

    it('should return 0 when discountInfo is null', () => {
      const result = calculateDiscountAmountSafe(6000, null)
      expect(result).toBe(0)
    })

    it('should return 0 when discountInfo is undefined', () => {
      const result = calculateDiscountAmountSafe(6000, undefined)
      expect(result).toBe(0)
    })
  })

  describe('calculateInvoiceTotalsWithDiscounts', () => {
    it('should calculate totals with percentage discount', () => {
      const result = calculateInvoiceTotalsWithDiscounts(
        mockLineItems,
        mockInvoice,
        mockDiscountInfo
      )

      expect(result.originalAmountInCents).toBe(6000) // $60.00
      expect(result.subtotalInCents).toBe(5400) // $54.00 (after 10% discount)
      expect(result.taxAmountInCents).toBe(600) // $6.00 tax
      expect(result.totalInCents).toBe(6000) // $60.00 total
      expect(result.calculatedDiscountAmount).toBe(600) // $6.00 discount

      expect(result.originalAmount).toBe('$60.00')
      expect(result.subtotalAmount).toBe('$54.00')
      expect(result.taxAmount).toBe('$6.00')
      expect(result.totalAmount).toBe('$60.00')

      expect(result.discountInfoWithCurrency).toEqual({
        discountName: 'Test Discount',
        discountCode: 'TEST10',
        discountAmount: 600, // The actual discount amount in cents
        discountAmountType: 'percent',
        currency: CurrencyCode.USD,
      })
    })

    it('should calculate totals with fixed discount', () => {
      const fixedDiscount: DiscountInfo = {
        ...mockDiscountInfo,
        discountAmount: 500, // $5.00
        discountAmountType: 'fixed',
      }

      const result = calculateInvoiceTotalsWithDiscounts(
        mockLineItems,
        mockInvoice,
        fixedDiscount
      )

      expect(result.originalAmountInCents).toBe(6000) // $60.00
      expect(result.subtotalInCents).toBe(5500) // $55.00 (after $5.00 discount)
      expect(result.taxAmountInCents).toBe(600) // $6.00 tax
      expect(result.totalInCents).toBe(6100) // $61.00 total
      expect(result.calculatedDiscountAmount).toBe(500) // $5.00 discount
    })

    it('should handle no discount', () => {
      const result = calculateInvoiceTotalsWithDiscounts(
        mockLineItems,
        mockInvoice,
        null
      )

      expect(result.originalAmountInCents).toBe(6000) // $60.00
      expect(result.subtotalInCents).toBe(6000) // $60.00 (no discount)
      expect(result.taxAmountInCents).toBe(600) // $6.00 tax
      expect(result.totalInCents).toBe(6600) // $66.00 total
      expect(result.calculatedDiscountAmount).toBe(0) // No discount

      expect(result.discountInfoWithCurrency).toBeNull()
    })

    it('should handle no tax', () => {
      const invoiceNoTax = { ...mockInvoice, taxAmount: null }
      const result = calculateInvoiceTotalsWithDiscounts(
        mockLineItems,
        invoiceNoTax,
        mockDiscountInfo
      )

      expect(result.originalAmountInCents).toBe(6000) // $60.00
      expect(result.subtotalInCents).toBe(5400) // $54.00 (after 10% discount)
      expect(result.taxAmountInCents).toBe(0) // No tax
      expect(result.totalInCents).toBe(5400) // $54.00 total
      expect(result.taxAmount).toBeNull()
    })
  })

  describe('calculateInvoiceTotalsRaw', () => {
    it('should calculate raw amounts with percentage discount', () => {
      const result = calculateInvoiceTotalsRaw(
        mockLineItems,
        mockInvoice,
        mockDiscountInfo
      )

      expect(result.baseAmount).toBe(6000) // $60.00
      expect(result.subtotal).toBe(5400) // $54.00 (after 10% discount)
      expect(result.taxAmount).toBe(600) // $6.00 tax
      expect(result.total).toBe(6000) // $60.00 total
      expect(result.calculatedDiscountAmount).toBe(600) // $6.00 discount
    })

    it('should calculate raw amounts with fixed discount', () => {
      const fixedDiscount: DiscountInfo = {
        ...mockDiscountInfo,
        discountAmount: 500, // $5.00
        discountAmountType: 'fixed',
      }

      const result = calculateInvoiceTotalsRaw(
        mockLineItems,
        mockInvoice,
        fixedDiscount
      )

      expect(result.baseAmount).toBe(6000) // $60.00
      expect(result.subtotal).toBe(5500) // $55.00 (after $5.00 discount)
      expect(result.taxAmount).toBe(600) // $6.00 tax
      expect(result.total).toBe(6100) // $61.00 total
      expect(result.calculatedDiscountAmount).toBe(500) // $5.00 discount
    })

    it('should handle no discount', () => {
      const result = calculateInvoiceTotalsRaw(
        mockLineItems,
        mockInvoice,
        null
      )

      expect(result.baseAmount).toBe(6000) // $60.00
      expect(result.subtotal).toBe(6000) // $60.00 (no discount)
      expect(result.taxAmount).toBe(600) // $6.00 tax
      expect(result.total).toBe(6600) // $66.00 total
      expect(result.calculatedDiscountAmount).toBe(0) // No discount
    })
  })

  describe('calculateInvoiceTotalsFromLineItems', () => {
    it('should calculate totals from line items with discount', () => {
      const result = calculateInvoiceTotalsFromLineItems(
        mockInvoice,
        mockLineItems,
        mockDiscountInfo
      )

      expect(result.originalAmount).toBe('$60.00')
      expect(result.subtotalAmount).toBe('$54.00') // $54.00 (after 10% discount)
      expect(result.taxAmount).toBe('$6.00') // $6.00 tax
      expect(result.totalAmount).toBe('$60.00') // $60.00 total
      expect(result.discountAmount).toBe('$6.00') // $6.00 discount
    })

    it('should handle no discount', () => {
      const result = calculateInvoiceTotalsFromLineItems(
        mockInvoice,
        mockLineItems,
        null
      )

      expect(result.originalAmount).toBe('$60.00')
      expect(result.subtotalAmount).toBe('$60.00') // $60.00 (no discount)
      expect(result.taxAmount).toBe('$6.00') // $6.00 tax
      expect(result.totalAmount).toBe('$66.00') // $66.00 total
      expect(result.discountAmount).toBe('$0.00') // No discount
    })
  })

  describe('calculateInvoiceTotals', () => {
    it('should calculate totals with discount', () => {
      const result = calculateInvoiceTotals(
        mockInvoice,
        mockLineItems,
        mockDiscountInfo
      )

      expect(result.originalAmount).toBe('6000')
      expect(result.subtotalAmount).toBe('5400') // $54.00 (after 10% discount)
      expect(result.taxAmount).toBe('600') // $6.00 tax
      expect(result.totalAmount).toBe('6000') // $60.00 total
      expect(result.discountAmount).toBe(600) // $6.00 discount
    })

    it('should handle no discount', () => {
      const result = calculateInvoiceTotals(
        mockInvoice,
        mockLineItems,
        null
      )

      expect(result.originalAmount).toBe('6000')
      expect(result.subtotalAmount).toBe('6000') // $60.00 (no discount)
      expect(result.taxAmount).toBe('600') // $6.00 tax
      expect(result.totalAmount).toBe('6600') // $66.00 total
      expect(result.discountAmount).toBe(0) // No discount
    })
  })
})
