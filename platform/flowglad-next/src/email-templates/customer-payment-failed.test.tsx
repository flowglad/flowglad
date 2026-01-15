/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CurrencyCode } from '@/types'
import { PaymentFailedEmail } from './customer-payment-failed'

describe('PaymentFailedEmail', () => {
  // Use a fixed date to avoid timezone issues
  const testDate = new Date('2024-03-19T12:00:00.000Z') // Noon UTC to avoid timezone edge cases

  const mockProps = {
    invoiceNumber: 'INV-123',
    orderDate: testDate,
    invoice: {
      subtotal: 6000, // $60.00 - matches the total of line items
      taxAmount: null,
      currency: CurrencyCode.USD,
    },
    organizationName: 'Test Organization',
    organizationLogoUrl: 'https://example.com/logo.png',
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
    failureReason: 'Insufficient funds',
    customerPortalUrl: 'https://example.com/portal',
    livemode: false,
  }

  it('should render the payment failed email with all components', () => {
    const {
      getByTestId,
      getByAltText,
      queryByTestId,
      getByText,
      getByRole,
    } = render(<PaymentFailedEmail {...mockProps} />)

    // Check header content
    expect(getByTestId('email-title')).toHaveTextContent(
      'Payment Unsuccessful'
    )
    expect(getByAltText('Logo')).toHaveAttribute(
      'src',
      mockProps.organizationLogoUrl
    )

    // Check failure reason - the text is in the paragraph elements
    expect(
      getByText(
        /We were unable to process your payment for the order below/
      )
    ).toBeInTheDocument()
    expect(getByText(/Reason:/)).toBeInTheDocument()
    expect(getByText(/Insufficient funds/)).toBeInTheDocument()

    // Check order details - these are in paragraph elements without specific test IDs
    expect(
      getByText(`Invoice #: ${mockProps.invoiceNumber}`)
    ).toBeInTheDocument()
    // Use dynamic date formatting instead of hardcoded dates
    expect(
      getByText(
        new RegExp(
          `Date: ${testDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        )
      )
    ).toBeInTheDocument()
    expect(getByText('Amount: $60.00')).toBeInTheDocument()

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

    // Check totals - should not show subtotal when there's no tax
    expect(queryByTestId('subtotal-amount')).not.toBeInTheDocument()
    expect(getByTestId('total-amount')).toHaveTextContent('$60.00')

    // Check customer portal button
    const updateButton = getByRole('link', {
      name: 'Update Payment Method',
    })
    expect(updateButton).toHaveAttribute(
      'href',
      mockProps.customerPortalUrl
    )

    // Check signature
    expect(getByText('Best,')).toBeInTheDocument()
    expect(getByText(mockProps.organizationName)).toBeInTheDocument()
  })

  describe('with discount', () => {
    it('should handle fixed discount correctly', () => {
      const propsWithDiscount = {
        ...mockProps,
        invoice: {
          ...mockProps.invoice,
          subtotal: 5000, // $50.00 after discount
        },
        discountInfo: {
          discountName: 'Fixed Discount',
          discountCode: 'SAVE10',
          discountAmount: 1000, // $10.00 discount
          discountAmountType: 'fixed',
        },
      }

      const { getByTestId, queryByTestId, getByText } = render(
        <PaymentFailedEmail {...propsWithDiscount} />
      )

      // Should show payment amount as post-discount total
      expect(getByText('Amount: $50.00')).toBeInTheDocument()

      // Should show original amount (calculated from subtotal + discount)
      expect(getByTestId('original-amount-label')).toHaveTextContent(
        'Amount'
      )
      expect(getByTestId('original-amount')).toHaveTextContent(
        '$60.00'
      )

      // Should show discount with code
      expect(getByTestId('discount-label')).toHaveTextContent(
        'Discount (SAVE10)'
      )
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-$10.00'
      )

      // Should not show subtotal when there's no tax
      expect(queryByTestId('subtotal-amount')).not.toBeInTheDocument()
      expect(getByTestId('total-amount')).toHaveTextContent('$50.00')
    })

    it('should handle percentage discount correctly', () => {
      const propsWithPercentageDiscount = {
        ...mockProps,
        invoice: {
          ...mockProps.invoice,
          subtotal: 5400, // $54.00 after 10% discount
        },
        discountInfo: {
          discountName: 'Percentage Discount',
          discountCode: 'SAVE10',
          discountAmount: 10, // 10% (stored as percentage, not amount)
          discountAmountType: 'percent',
        },
      }

      const { getByTestId, queryByTestId, getByText } = render(
        <PaymentFailedEmail {...propsWithPercentageDiscount} />
      )

      // Should show payment amount as post-discount total
      expect(getByText('Amount: $54.00')).toBeInTheDocument()

      // Should show original amount (calculated from subtotal + discount)
      expect(getByTestId('original-amount')).toHaveTextContent(
        '$60.00'
      )

      // Should show discount with code (10% of $60.00 = $6.00)
      expect(getByTestId('discount-label')).toHaveTextContent(
        'Discount (SAVE10)'
      )
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-$6.00'
      )

      // Should not show subtotal when there's no tax
      expect(queryByTestId('subtotal-amount')).not.toBeInTheDocument()
      expect(getByTestId('total-amount')).toHaveTextContent('$54.00')
    })

    it('should handle percentage discount with tax correctly', () => {
      const propsWithPercentageDiscountAndTax = {
        ...mockProps,
        invoice: {
          ...mockProps.invoice,
          subtotal: 5400, // $54.00 after 10% discount
          taxAmount: 540, // $5.40 tax
        },
        discountInfo: {
          discountName: 'Percentage Discount',
          discountCode: 'SAVE10',
          discountAmount: 10, // 10%
          discountAmountType: 'percent',
        },
      }

      const { getByTestId, getByText } = render(
        <PaymentFailedEmail {...propsWithPercentageDiscountAndTax} />
      )

      // Should show payment amount as subtotal + tax
      expect(getByText('Amount: $59.40')).toBeInTheDocument()

      // Should show original amount (subtotal + discount)
      expect(getByTestId('original-amount')).toHaveTextContent(
        '$60.00'
      )

      // Should show discount
      expect(getByTestId('discount-label')).toHaveTextContent(
        'Discount (SAVE10)'
      )
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-$6.00'
      )

      // Should show subtotal, tax, and total
      expect(getByTestId('subtotal-amount')).toHaveTextContent(
        '$54.00'
      )
      expect(getByTestId('tax-amount')).toHaveTextContent('$5.40')
      expect(getByTestId('total-amount')).toHaveTextContent('$59.40')
    })

    it('should cap percentage discount at 100%', () => {
      const propsWithLargePercentage = {
        ...mockProps,
        invoice: {
          ...mockProps.invoice,
          subtotal: 0, // $0.00 after 100% discount
        },
        discountInfo: {
          discountName: 'Full Discount',
          discountCode: 'FREE',
          discountAmount: 150, // 150% (should be capped at 100%)
          discountAmountType: 'percent',
        },
      }

      const { getByTestId, getByText } = render(
        <PaymentFailedEmail {...propsWithLargePercentage} />
      )

      // Should show payment amount as $0.00
      expect(getByText('Amount: $0.00')).toBeInTheDocument()

      // Should show original amount ($60.00)
      expect(getByTestId('original-amount')).toHaveTextContent(
        '$60.00'
      )

      // Should show discount amount ($60.00 - capped at 100%)
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-$60.00'
      )

      // Should show total ($0.00)
      expect(getByTestId('total-amount')).toHaveTextContent('$0.00')
    })
  })

  describe('retry scenarios', () => {
    it('should show retry message when retryDate is provided', () => {
      const retryDate = new Date('2024-03-20T12:00:00.000Z') // Noon UTC to avoid timezone edge cases
      const propsWithRetry = {
        ...mockProps,
        retryDate,
      }

      const { getByTestId, getByText } = render(
        <PaymentFailedEmail {...propsWithRetry} />
      )

      expect(getByText(/We will retry on/)).toBeInTheDocument()
      // Use dynamic date formatting instead of hardcoded dates
      expect(
        getByText(
          new RegExp(
            retryDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          )
        )
      ).toBeInTheDocument()
      expect(
        getByText(/with the same payment method/)
      ).toBeInTheDocument()
    })

    it('should show no retry message when retryDate is not provided', () => {
      const { getByTestId, getByText } = render(
        <PaymentFailedEmail {...mockProps} />
      )

      expect(
        getByText(
          'We will no longer attempt to retry the payment. Please reach out to us to get this sorted.'
        )
      ).toBeInTheDocument()
    })
  })

  it('should handle missing optional props gracefully', () => {
    const minimalProps = {
      ...mockProps,
      organizationLogoUrl: undefined,
      failureReason: undefined,
      customerPortalUrl: undefined,
      retryDate: undefined,
      discountInfo: null,
    }

    const { queryByAltText, queryByTestId, queryByText } = render(
      <PaymentFailedEmail {...minimalProps} />
    )

    // Should not show logo
    expect(queryByAltText('Logo')).not.toBeInTheDocument()

    // Should not show failure reason
    expect(queryByText('Reason:')).not.toBeInTheDocument()

    // Should not show customer portal button
    expect(
      queryByTestId('update-payment-button')
    ).not.toBeInTheDocument()

    // Should not show discount elements
    expect(queryByTestId('original-amount')).not.toBeInTheDocument()
    expect(queryByTestId('discount-amount')).not.toBeInTheDocument()
  })
})
