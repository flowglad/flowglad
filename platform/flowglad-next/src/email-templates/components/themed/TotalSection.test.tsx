/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'bun:test'
import { render } from '@testing-library/react'
import type { CurrencyCode } from '@/types'
import { TotalSection } from './TotalSection'

describe('TotalSection', () => {
  describe('without discount', () => {
    it('should display subtotal and total normally when no discount provided', () => {
      const { getByTestId, queryByTestId } = render(
        <TotalSection
          subtotal="$50.00"
          total="$55.00"
          tax="$5.00"
          discountInfo={null}
        />
      )

      // Should show normal totals
      expect(getByTestId('subtotal-label')).toHaveTextContent(
        'Subtotal'
      )
      expect(getByTestId('subtotal-amount')).toHaveTextContent(
        '$50.00'
      )
      expect(getByTestId('tax-label')).toHaveTextContent('Tax')
      expect(getByTestId('tax-amount')).toHaveTextContent('$5.00')
      expect(getByTestId('total-label')).toHaveTextContent('Total')
      expect(getByTestId('total-amount')).toHaveTextContent('$55.00')

      // Should not show discount elements
      expect(
        queryByTestId('original-amount-label')
      ).not.toBeInTheDocument()
      expect(queryByTestId('original-amount')).not.toBeInTheDocument()
      expect(queryByTestId('discount-label')).not.toBeInTheDocument()
      expect(queryByTestId('discount-amount')).not.toBeInTheDocument()
    })

    it('should hide subtotal when there is no tax', () => {
      const { getByTestId, queryByTestId } = render(
        <TotalSection
          subtotal="$50.00"
          total="$50.00"
          discountInfo={null}
        />
      )

      // Should not show subtotal
      expect(queryByTestId('subtotal-label')).not.toBeInTheDocument()
      expect(queryByTestId('subtotal-amount')).not.toBeInTheDocument()

      // Should still show total
      expect(getByTestId('total-label')).toHaveTextContent('Total')
      expect(getByTestId('total-amount')).toHaveTextContent('$50.00')

      // Should not show discount elements
      expect(
        queryByTestId('original-amount-label')
      ).not.toBeInTheDocument()
      expect(queryByTestId('discount-label')).not.toBeInTheDocument()
    })

    it('should handle no tax amount correctly', () => {
      const { getByTestId, queryByTestId } = render(
        <TotalSection
          subtotal="$50.00"
          total="$50.00"
          tax={null}
          discountInfo={null}
        />
      )

      // Should only show total (no subtotal without tax)
      expect(queryByTestId('subtotal-label')).not.toBeInTheDocument()
      expect(queryByTestId('subtotal-amount')).not.toBeInTheDocument()
      expect(getByTestId('total-label')).toHaveTextContent('Total')
      expect(getByTestId('total-amount')).toHaveTextContent('$50.00')

      // Should not show tax line
      expect(queryByTestId('tax-label')).not.toBeInTheDocument()
      expect(queryByTestId('tax-amount')).not.toBeInTheDocument()
    })
  })

  describe('with discount', () => {
    it('should display original amount, discount, and total when discount is provided (no tax)', () => {
      const { getByTestId, queryByTestId } = render(
        <TotalSection
          originalAmount="$50.00"
          subtotal="$40.00"
          total="$40.00"
          discountInfo={{
            discountName: 'First Order Discount',
            discountCode: 'SAVE10',
            discountAmount: 1000,
            discountAmountType: 'fixed',
            currency: 'USD' as CurrencyCode,
          }}
        />
      )

      // Should show original amount (calculated as subtotal + discount)
      expect(getByTestId('original-amount-label')).toHaveTextContent(
        'Amount'
      )
      expect(getByTestId('original-amount')).toHaveTextContent(
        '$50.00'
      )

      // Should show discount with code
      expect(getByTestId('discount-label')).toHaveTextContent(
        'Discount (SAVE10)'
      )
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-$10.00'
      )
      expect(getByTestId('discount-amount')).toHaveStyle({
        color: '#22c55e',
      })

      // Should not show subtotal (no tax)
      expect(queryByTestId('subtotal-label')).not.toBeInTheDocument()
      expect(queryByTestId('subtotal-amount')).not.toBeInTheDocument()
      expect(getByTestId('total-label')).toHaveTextContent('Total')
      expect(getByTestId('total-amount')).toHaveTextContent('$40.00')
    })

    it('should calculate original amount correctly for different currencies', () => {
      const { getByTestId, queryByTestId } = render(
        <TotalSection
          originalAmount="€50.00"
          subtotal="€30.00"
          total="€30.00"
          discountInfo={{
            discountName: 'Euro Discount',
            discountCode: 'EURO20',
            discountAmount: 2000,
            discountAmountType: 'fixed',
            currency: 'EUR' as CurrencyCode,
          }}
        />
      )

      // Should calculate original amount correctly
      expect(getByTestId('original-amount')).toHaveTextContent(
        '€50.00'
      )

      // Should show discount in EUR
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-€20.00'
      )
      expect(getByTestId('discount-amount')).toHaveStyle({
        color: '#22c55e',
      })

      // Should not show subtotal (no tax)
      expect(queryByTestId('subtotal-amount')).not.toBeInTheDocument()
    })

    it('should handle discount with tax correctly', () => {
      const { getByTestId } = render(
        <TotalSection
          originalAmount="$50.00"
          subtotal="$40.00"
          tax="$4.00"
          total="$44.00"
          discountInfo={{
            discountName: 'Save Ten',
            discountCode: 'SAVE10',
            discountAmount: 1000,
            discountAmountType: 'fixed',
            currency: 'USD' as CurrencyCode,
          }}
        />
      )

      // Should show original amount
      expect(getByTestId('original-amount')).toHaveTextContent(
        '$50.00'
      )

      // Should show discount
      expect(getByTestId('discount-label')).toHaveTextContent(
        'Discount (SAVE10)'
      )
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-$10.00'
      )

      // Should show subtotal, tax, and total
      expect(getByTestId('subtotal-amount')).toHaveTextContent(
        '$40.00'
      )
      expect(getByTestId('tax-amount')).toHaveTextContent('$4.00')
      expect(getByTestId('total-amount')).toHaveTextContent('$44.00')
    })

    it('should show original amount when there is a discount (auto-detection)', () => {
      const { getByTestId, queryByTestId } = render(
        <TotalSection
          originalAmount="$50.00"
          subtotal="$40.00"
          total="$40.00"
          discountInfo={{
            discountName: 'Test Discount',
            discountCode: 'TEST10',
            discountAmount: 1000,
            discountAmountType: 'fixed',
            currency: 'USD' as CurrencyCode,
          }}
        />
      )

      // Should ALWAYS show original amount when there's a discount (improved logic)
      expect(getByTestId('original-amount-label')).toBeInTheDocument()
      expect(getByTestId('original-amount')).toHaveTextContent(
        '$50.00'
      ) // $40 + $10 discount

      // Should still show discount
      expect(getByTestId('discount-label')).toHaveTextContent(
        'Discount (TEST10)'
      )
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-$10.00'
      )

      // Should not show subtotal when there is no tax
      expect(queryByTestId('subtotal-label')).not.toBeInTheDocument()

      // Should show total
      expect(getByTestId('total-amount')).toHaveTextContent('$40.00')
    })

    it('should show subtotal when there is tax (auto-detection)', () => {
      const { getByTestId, queryByTestId } = render(
        <TotalSection
          subtotal="$40.00"
          total="$44.00"
          tax="$4.00"
          discountInfo={null}
        />
      )

      // Should show subtotal because there's tax (auto-detected)
      expect(getByTestId('subtotal-label')).toBeInTheDocument()
      expect(getByTestId('subtotal-amount')).toHaveTextContent(
        '$40.00'
      )

      // Should show tax
      expect(getByTestId('tax-label')).toBeInTheDocument()
      expect(getByTestId('tax-amount')).toHaveTextContent('$4.00')

      // Should show total
      expect(getByTestId('total-amount')).toHaveTextContent('$44.00')

      // Should not show discount info since there's none
      expect(
        queryByTestId('original-amount-label')
      ).not.toBeInTheDocument()
      expect(queryByTestId('discount-label')).not.toBeInTheDocument()
    })

    it('should handle zero discount amount', () => {
      const { getByTestId, queryByTestId } = render(
        <TotalSection
          originalAmount="$50.00"
          subtotal="$50.00"
          total="$50.00"
          discountInfo={{
            discountName: 'Zero Discount',
            discountCode: 'PROMO',
            discountAmount: 0,
            discountAmountType: 'fixed',
            currency: 'USD' as CurrencyCode,
          }}
        />
      )

      // Should show discount line even with zero amount
      expect(getByTestId('discount-label')).toHaveTextContent(
        'Discount (PROMO)'
      )
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-$0.00'
      )

      // Original amount should equal subtotal since discount is 0
      expect(getByTestId('original-amount')).toHaveTextContent(
        '$50.00'
      )
      expect(queryByTestId('subtotal-amount')).not.toBeInTheDocument() // No tax
      expect(getByTestId('total-amount')).toHaveTextContent('$50.00')
    })
  })

  describe('custom total label', () => {
    it('should use custom total label text when provided', () => {
      const { getByTestId } = render(
        <TotalSection
          subtotal="$50.00"
          total="$55.00"
          totalLabelText="Amount Due"
          discountInfo={null}
        />
      )

      // Should use custom total label
      expect(getByTestId('total-label')).toHaveTextContent(
        'Amount Due'
      )
      expect(getByTestId('total-amount')).toHaveTextContent('$55.00')
    })
  })

  describe('data-testid attributes', () => {
    it('should have correct test IDs for all elements when discount is present', () => {
      const { getByTestId } = render(
        <TotalSection
          subtotal="$40.00"
          tax="$4.00"
          total="$44.00"
          discountInfo={{
            discountName: 'Test Discount',
            discountCode: 'TEST',
            discountAmount: 1000,
            discountAmountType: 'fixed',
            currency: 'USD' as CurrencyCode,
          }}
        />
      )

      // Should have all required test IDs
      expect(getByTestId('total-divider')).toBeInTheDocument()
      expect(getByTestId('original-amount-label')).toBeInTheDocument()
      expect(getByTestId('original-amount')).toBeInTheDocument()
      expect(getByTestId('discount-label')).toBeInTheDocument()
      expect(getByTestId('discount-amount')).toBeInTheDocument()
      expect(getByTestId('subtotal-label')).toBeInTheDocument()
      expect(getByTestId('subtotal-amount')).toBeInTheDocument()
      expect(getByTestId('tax-label')).toBeInTheDocument()
      expect(getByTestId('tax-amount')).toBeInTheDocument()
      expect(getByTestId('total-label')).toBeInTheDocument()
      expect(getByTestId('total-amount')).toBeInTheDocument()
    })
  })
})
