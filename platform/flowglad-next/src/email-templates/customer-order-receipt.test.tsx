import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { OrderReceiptEmail } from './customer-order-receipt'
import { CurrencyCode } from '@/types'
import core from '@/utils/core'

describe('OrderReceiptEmail', () => {
  const mockProps = {
    invoiceNumber: 'INV-123',
    orderDate: '2024-03-20',
    invoice: {
      subtotal: 6000, // $60.00 - matches the total of line items
      taxAmount: null,
      currency: CurrencyCode.USD,
    },
    organizationLogoUrl: 'https://example.com/logo.png',
    organizationId: 'org_123',
    customerId: 'cus_456',
    lineItems: [
      {
        name: 'Test Product',
        price: 2500, // $25.00
        quantity: 2,
      },
      {
        name: 'Another Product',
        price: 1000, // $10.00
        quantity: 1,
      },
    ],
    organizationName: 'Test Organization',
  }

  it('should render the email template with all components', () => {
    const { getByTestId, getByAltText, queryByTestId } = render(
      <OrderReceiptEmail {...mockProps} />
    )

    // Check header content
    expect(getByTestId('email-title')).toHaveTextContent(
      'Thanks for your order!'
    )
    expect(getByAltText('Logo')).toHaveAttribute(
      'src',
      mockProps.organizationLogoUrl
    )

    // Check order details
    expect(getByTestId('invoice-number')).toHaveTextContent(
      `Invoice #: ${mockProps.invoiceNumber}`
    )
    expect(getByTestId('order-date')).toHaveTextContent(
      `Date: ${mockProps.orderDate}`
    )
    expect(getByTestId('payment-amount')).toHaveTextContent(
      'Payment: $60.00'
    )

    // Check line items
    expect(getByTestId('line-item-name-0')).toHaveTextContent(
      'Test Product'
    )
    expect(getByTestId('line-item-price-0')).toHaveTextContent(
      '$25.00'
    )
    expect(getByTestId('line-item-quantity-0')).toHaveTextContent(
      'Quantity: 2'
    )
    expect(getByTestId('line-item-name-1')).toHaveTextContent(
      'Another Product'
    )
    expect(getByTestId('line-item-price-1')).toHaveTextContent(
      '$10.00'
    )
    expect(getByTestId('line-item-quantity-1')).toHaveTextContent(
      'Quantity: 1'
    )

    // Check totals - should not show subtotal when there's no tax
    expect(queryByTestId('subtotal-label')).not.toBeInTheDocument()
    expect(queryByTestId('subtotal-amount')).not.toBeInTheDocument()
    expect(getByTestId('total-label')).toHaveTextContent('Total')
    expect(getByTestId('total-amount')).toHaveTextContent('$60.00')

    // Check signature
    expect(getByTestId('signature-thanks')).toHaveTextContent(
      'Thanks,'
    )
    expect(getByTestId('signature-org-name')).toHaveTextContent(
      mockProps.organizationName
    )
  })

  it('should render without organization logo when logoUrl is not provided', () => {
    const propsWithoutLogo = {
      ...mockProps,
      organizationLogoUrl: undefined,
    }
    const { queryByAltText } = render(
      <OrderReceiptEmail {...propsWithoutLogo} />
    )

    expect(queryByAltText('Logo')).not.toBeInTheDocument()
  })

  it('should calculate and display correct total amounts', () => {
    const { getByTestId, queryByTestId } = render(
      <OrderReceiptEmail {...mockProps} />
    )

    // Total should be (25 * 2) + (10 * 1) = $60.00
    expect(getByTestId('payment-amount')).toHaveTextContent(
      'Payment: $60.00'
    )
    expect(queryByTestId('subtotal-amount')).not.toBeInTheDocument()
    expect(getByTestId('total-amount')).toHaveTextContent('$60.00')
  })

  it('should render the email button with correct billing portal URL', () => {
    const { getByTestId } = render(
      <OrderReceiptEmail {...mockProps} />
    )

    const button = getByTestId('view-order-button')
    const expectedUrl = core.customerBillingPortalURL({
      organizationId: mockProps.organizationId,
      customerId: mockProps.customerId,
    })

    expect(button).toHaveAttribute('href', expectedUrl)
  })

  it('should handle empty line items gracefully', () => {
    const propsWithNoItems = {
      ...mockProps,
      invoice: {
        ...mockProps.invoice,
        subtotal: 0, // Empty invoice should have 0 totals
      },
      lineItems: [],
    }

    const { getByTestId, queryByTestId } = render(
      <OrderReceiptEmail {...propsWithNoItems} />
    )

    expect(getByTestId('payment-amount')).toHaveTextContent(
      'Payment: $0.00'
    )
    expect(queryByTestId('subtotal-amount')).not.toBeInTheDocument()
    expect(getByTestId('total-amount')).toHaveTextContent('$0.00')
    expect(queryByTestId('line-item-0')).not.toBeInTheDocument()
  })

  describe('with discount', () => {
    it('should display discount information correctly in totals section', () => {
      const propsWithDiscount = {
        ...mockProps,
        invoice: {
          ...mockProps.invoice,
          subtotal: 5000, // $50.00 after discount
        },
        discountInfo: {
          discountName: 'First Order',
          discountCode: 'WELCOME10',
          discountAmount: 1000, // $10.00 discount
          discountAmountType: 'fixed',
        },
      }

      const { getByTestId, queryByTestId } = render(
        <OrderReceiptEmail {...propsWithDiscount} />
      )

      // Should show payment amount as post-discount total
      expect(getByTestId('payment-amount')).toHaveTextContent(
        'Payment: $50.00'
      )

      // Should show original amount (calculated from subtotal + discount)
      expect(getByTestId('original-amount-label')).toHaveTextContent(
        'Amount'
      )
      expect(getByTestId('original-amount')).toHaveTextContent(
        '$60.00'
      )

      // Should show discount with code
      expect(getByTestId('discount-label')).toHaveTextContent(
        'Discount (WELCOME10)'
      )
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-$10.00'
      )

      // Should not show subtotal when there's no tax
      expect(queryByTestId('subtotal-amount')).not.toBeInTheDocument()
      expect(getByTestId('total-amount')).toHaveTextContent('$50.00')
    })

    it('should handle discount with tax correctly', () => {
      const propsWithDiscountAndTax = {
        ...mockProps,
        invoice: {
          ...mockProps.invoice,
          subtotal: 4500, // $45.00 after discount
          taxAmount: 450, // $4.50 tax
        },
        discountInfo: {
          discountName: 'Save Fifteen',
          discountCode: 'SAVE15',
          discountAmount: 1500, // $15.00 discount
          discountAmountType: 'fixed',
        },
      }

      const { getByTestId, queryByTestId } = render(
        <OrderReceiptEmail {...propsWithDiscountAndTax} />
      )

      // Payment should be subtotal + tax
      expect(getByTestId('payment-amount')).toHaveTextContent(
        'Payment: $49.50'
      )

      // Should show original amount (subtotal + discount)
      expect(getByTestId('original-amount')).toHaveTextContent(
        '$60.00'
      )

      // Should show discount
      expect(getByTestId('discount-label')).toHaveTextContent(
        'Discount (SAVE15)'
      )
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-$15.00'
      )

      // Should show subtotal, tax, and total
      expect(getByTestId('subtotal-amount')).toHaveTextContent(
        '$45.00'
      )
      expect(getByTestId('tax-amount')).toHaveTextContent('$4.50')
      expect(getByTestId('total-amount')).toHaveTextContent('$49.50')
    })

    it('should not show original amount or discount when discountInfo is null', () => {
      const propsWithoutDiscount = {
        ...mockProps,
        discountInfo: null,
      }

      const { getByTestId, queryByTestId } = render(
        <OrderReceiptEmail {...propsWithoutDiscount} />
      )

      // Should not show discount elements
      expect(
        queryByTestId('original-amount-label')
      ).not.toBeInTheDocument()
      expect(queryByTestId('original-amount')).not.toBeInTheDocument()
      expect(queryByTestId('discount-label')).not.toBeInTheDocument()
      expect(queryByTestId('discount-amount')).not.toBeInTheDocument()

      // Should not show subtotal when there's no tax
      expect(queryByTestId('subtotal-amount')).not.toBeInTheDocument()
      expect(getByTestId('total-amount')).toHaveTextContent('$60.00')
    })

    it('should handle different currencies in discount', () => {
      const propsWithEuroCurrency = {
        ...mockProps,
        invoice: {
          ...mockProps.invoice,
          currency: CurrencyCode.EUR,
          subtotal: 4000, // €40.00 after discount
        },
        discountInfo: {
          discountName: 'Euro Discount',
          discountCode: 'EUR10',
          discountAmount: 1000, // €10.00 discount
          discountAmountType: 'fixed',
        },
      }

      const { getByTestId, queryByTestId } = render(
        <OrderReceiptEmail {...propsWithEuroCurrency} />
      )

      // Should handle EUR currency throughout
      expect(getByTestId('payment-amount')).toHaveTextContent(
        'Payment: €50.00'
      )
      expect(getByTestId('original-amount')).toHaveTextContent(
        '€60.00'
      )
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-€10.00'
      )
      // Should not show subtotal when there's no tax
      expect(queryByTestId('subtotal-amount')).not.toBeInTheDocument()
      expect(getByTestId('total-amount')).toHaveTextContent('€50.00')
    })

    it('should maintain correct test IDs for discount elements', () => {
      const propsWithDiscount = {
        ...mockProps,
        invoice: {
          ...mockProps.invoice,
          subtotal: 5000,
        },
        discountInfo: {
          discountName: 'Test Discount',
          discountCode: 'TEST',
          discountAmount: 1000,
          discountAmountType: 'fixed',
        },
      }

      const { getByTestId, queryByTestId } = render(
        <OrderReceiptEmail {...propsWithDiscount} />
      )

      // Should have all discount-related test IDs
      expect(getByTestId('original-amount-label')).toBeInTheDocument()
      expect(getByTestId('original-amount')).toBeInTheDocument()
      expect(getByTestId('discount-label')).toBeInTheDocument()
      expect(getByTestId('discount-amount')).toBeInTheDocument()

      // Discount amount should have green color styling
      expect(getByTestId('discount-amount')).toHaveStyle({
        color: '#22c55e',
      })
    })
  })
})
