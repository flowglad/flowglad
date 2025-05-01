import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { OrderReceiptEmail } from './customer-order-receipt'
import { CurrencyCode } from '@/types'
import core from '@/utils/core'

describe('OrderReceiptEmail', () => {
  const mockProps = {
    invoiceNumber: 'INV-123',
    orderDate: '2024-03-20',
    organizationLogoUrl: 'https://example.com/logo.png',
    organizationId: 'org_123',
    customerExternalId: 'cus_456',
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
    currency: CurrencyCode.USD,
    organizationName: 'Test Organization',
  }

  it('should render the email template with all components', () => {
    const { getByTestId, getByAltText } = render(
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

    // Check totals
    expect(getByTestId('subtotal-label')).toHaveTextContent(
      'Subtotal'
    )
    expect(getByTestId('subtotal-amount')).toHaveTextContent('$60.00')
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
    const { getByTestId } = render(
      <OrderReceiptEmail {...mockProps} />
    )

    // Total should be (25 * 2) + (10 * 1) = $60.00
    expect(getByTestId('payment-amount')).toHaveTextContent(
      'Payment: $60.00'
    )
    expect(getByTestId('subtotal-amount')).toHaveTextContent('$60.00')
    expect(getByTestId('total-amount')).toHaveTextContent('$60.00')
  })

  it('should render the email button with correct billing portal URL', () => {
    const { getByTestId } = render(
      <OrderReceiptEmail {...mockProps} />
    )

    const button = getByTestId('view-order-button')
    const expectedUrl = core.billingPortalPageURL({
      organizationId: mockProps.organizationId,
      customerExternalId: mockProps.customerExternalId,
      page: 'sign-in',
    })

    expect(button).toHaveAttribute('href', expectedUrl)
  })

  it('should handle empty line items gracefully', () => {
    const propsWithNoItems = {
      ...mockProps,
      lineItems: [],
    }

    const { getByTestId, queryByTestId } = render(
      <OrderReceiptEmail {...propsWithNoItems} />
    )

    expect(getByTestId('payment-amount')).toHaveTextContent(
      'Payment: $0.00'
    )
    expect(getByTestId('subtotal-amount')).toHaveTextContent('$0.00')
    expect(getByTestId('total-amount')).toHaveTextContent('$0.00')
    expect(queryByTestId('line-item-0')).not.toBeInTheDocument()
  })
})
