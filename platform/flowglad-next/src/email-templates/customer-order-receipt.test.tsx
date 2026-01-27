import { describe, expect, it } from 'bun:test'
import { render } from '@testing-library/react'
import { FLOWGLAD_LEGAL_ENTITY } from '@/constants/mor'
import { CurrencyCode } from '@/types'
import core from '@/utils/core'
import { OrderReceiptEmail } from './customer-order-receipt'

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
    livemode: false,
  }

  it('should render the email template with all components', () => {
    const { getByTestId, getByAltText, queryByTestId } = render(
      <OrderReceiptEmail {...mockProps} />
    )

    // Check header content
    expect(getByTestId('email-title')).toHaveTextContent(
      'Your Order is Confirmed'
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

    // Check line items - quantity is displayed inline with name (×N) format for qty > 1
    expect(getByTestId('line-item-name-0')).toHaveTextContent(
      'Test Product (×2)'
    )
    expect(getByTestId('line-item-price-0')).toHaveTextContent(
      '$25.00'
    )
    // Second item has quantity 1, so no quantity suffix is shown
    expect(getByTestId('line-item-name-1')).toHaveTextContent(
      'Another Product'
    )
    expect(getByTestId('line-item-price-1')).toHaveTextContent(
      '$10.00'
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
    const { getByRole } = render(<OrderReceiptEmail {...mockProps} />)

    const button = getByRole('link', { name: 'View Order →' })
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

    describe('percentage discounts', () => {
      it('should correctly calculate 10% discount on $60.00', () => {
        const propsWithPercentageDiscount = {
          ...mockProps,
          invoice: {
            ...mockProps.invoice,
            subtotal: 5400, // $54.00 after 10% discount
          },
          discountInfo: {
            discountName: '10% Off',
            discountCode: 'SAVE10',
            discountAmount: 10, // 10% (stored as percentage, not amount)
            discountAmountType: 'percent',
          },
        }

        const { getByTestId } = render(
          <OrderReceiptEmail {...propsWithPercentageDiscount} />
        )

        // 10% of $60.00 = $6.00
        expect(getByTestId('original-amount')).toHaveTextContent(
          '$60.00'
        )
        expect(getByTestId('discount-amount')).toHaveTextContent(
          '-$6.00'
        )
        expect(getByTestId('total-amount')).toHaveTextContent(
          '$54.00'
        )
      })

      it('should correctly calculate 25% discount on $60.00', () => {
        const propsWithPercentageDiscount = {
          ...mockProps,
          invoice: {
            ...mockProps.invoice,
            subtotal: 4500, // $45.00 after 25% discount
          },
          discountInfo: {
            discountName: 'Quarter Off',
            discountCode: 'SAVE25',
            discountAmount: 25, // 25% (stored as percentage)
            discountAmountType: 'percent',
          },
        }

        const { getByTestId } = render(
          <OrderReceiptEmail {...propsWithPercentageDiscount} />
        )

        // 25% of $60.00 = $15.00
        expect(getByTestId('original-amount')).toHaveTextContent(
          '$60.00'
        )
        expect(getByTestId('discount-amount')).toHaveTextContent(
          '-$15.00'
        )
        expect(getByTestId('total-amount')).toHaveTextContent(
          '$45.00'
        )
      })

      it('should correctly calculate percentage discount with tax', () => {
        const propsWithPercentageDiscountAndTax = {
          ...mockProps,
          invoice: {
            ...mockProps.invoice,
            subtotal: 5400, // $54.00 after 10% discount
            taxAmount: 540, // $5.40 tax (10% of subtotal)
          },
          discountInfo: {
            discountName: '10% Off',
            discountCode: 'SAVE10',
            discountAmount: 10, // 10%
            discountAmountType: 'percent',
          },
        }

        const { getByTestId } = render(
          <OrderReceiptEmail {...propsWithPercentageDiscountAndTax} />
        )

        // 10% of $60.00 = $6.00 discount
        expect(getByTestId('original-amount')).toHaveTextContent(
          '$60.00'
        )
        expect(getByTestId('discount-amount')).toHaveTextContent(
          '-$6.00'
        )
        expect(getByTestId('subtotal-amount')).toHaveTextContent(
          '$54.00'
        )
        expect(getByTestId('tax-amount')).toHaveTextContent('$5.40')
        expect(getByTestId('total-amount')).toHaveTextContent(
          '$59.40'
        )
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

        const { getByTestId } = render(
          <OrderReceiptEmail {...propsWithLargePercentage} />
        )

        // 100% of $60.00 = $60.00 (capped)
        expect(getByTestId('original-amount')).toHaveTextContent(
          '$60.00'
        )
        expect(getByTestId('discount-amount')).toHaveTextContent(
          '-$60.00'
        )
        expect(getByTestId('total-amount')).toHaveTextContent('$0.00')
      })
    })
  })

  describe('MoR Support', () => {
    it('should render organization branding when isMoR is false', () => {
      const { getByAltText, getByTestId, queryByText } = render(
        <OrderReceiptEmail {...mockProps} isMoR={false} />
      )

      // Organization branding
      expect(getByAltText('Logo')).toHaveAttribute(
        'src',
        mockProps.organizationLogoUrl
      )
      expect(getByTestId('signature-org-name')).toHaveTextContent(
        mockProps.organizationName
      )

      // No card statement descriptor notice
      expect(
        queryByText(/This purchase was processed by/)
      ).not.toBeInTheDocument()
    })

    it('should render Flowglad branding and MoR notice when isMoR is true', () => {
      const { getByAltText, getByTestId, container } = render(
        <OrderReceiptEmail {...mockProps} isMoR={true} />
      )

      // Flowglad branding
      expect(getByAltText('Logo')).toHaveAttribute(
        'src',
        FLOWGLAD_LEGAL_ENTITY.logoURL
      )

      // Card statement descriptor notice
      expect(container.textContent).toContain(
        FLOWGLAD_LEGAL_ENTITY.cardStatementDescriptor
      )
      expect(container.textContent).toContain(
        'This purchase was processed by'
      )

      // Signature shows "for [merchant]"
      expect(getByTestId('signature-org-name')).toHaveTextContent(
        `${FLOWGLAD_LEGAL_ENTITY.name} for ${mockProps.organizationName}`
      )

      // Customer billing info still displays correctly
      expect(getByTestId('invoice-number')).toHaveTextContent(
        `Invoice #: ${mockProps.invoiceNumber}`
      )
      expect(getByTestId('order-date')).toHaveTextContent(
        `Date: ${mockProps.orderDate}`
      )
      expect(getByTestId('payment-amount')).toHaveTextContent(
        'Payment: $60.00'
      )
    })
  })
})
