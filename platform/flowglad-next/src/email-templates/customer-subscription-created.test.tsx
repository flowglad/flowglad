import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CustomerSubscriptionCreatedEmail } from './customer-subscription-created'
import { CurrencyCode, IntervalUnit } from '@/types'
import core from '@/utils/core'

describe('CustomerSubscriptionCreatedEmail', () => {
  const baseProps = {
    customerName: 'John Doe',
    organizationName: 'Acme Corp',
    organizationLogoUrl: 'https://example.com/logo.png',
    organizationId: 'org_123',
    customerExternalId: 'cus_456',
    planName: 'Pro Plan',
    price: 2500, // $25.00
    currency: CurrencyCode.USD,
    interval: IntervalUnit.Month,
    nextBillingDate: new Date('2025-02-01'),
    paymentMethodLast4: '4242',
  }

  it('renders subject line correctly', () => {
    const { getByText } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    // Check that key text content is present
    expect(
      getByText('Your subscription has been activated.')
    ).toBeInTheDocument()
  })

  it('displays plan name and pricing', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    expect(getByTestId('plan-name')).toHaveTextContent(
      'Plan: Pro Plan'
    )
    expect(getByTestId('price')).toHaveTextContent(
      'Price: $25.00/month'
    )
  })

  it('formats monthly pricing correctly', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    expect(getByTestId('price')).toHaveTextContent(
      'Price: $25.00/month'
    )
  })

  it('formats yearly pricing correctly', () => {
    const yearlyProps = {
      ...baseProps,
      interval: IntervalUnit.Year,
      price: 30000, // $300.00
    }
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...yearlyProps} />
    )

    expect(getByTestId('price')).toHaveTextContent(
      'Price: $300.00/year'
    )
  })

  it('includes payment method last 4 digits', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    expect(getByTestId('payment-method')).toHaveTextContent(
      'Payment method: •••• 4242'
    )
  })

  it('handles missing payment method gracefully', () => {
    const propsWithoutPayment = {
      ...baseProps,
      paymentMethodLast4: undefined,
    }
    const { queryByTestId, getByText } = render(
      <CustomerSubscriptionCreatedEmail {...propsWithoutPayment} />
    )

    expect(queryByTestId('payment-method')).not.toBeInTheDocument()
    // Should still show payment method text without specific card info
    expect(
      getByText(/The payment method will be used for future charges/)
    ).toBeInTheDocument()
  })

  it('includes billing portal link', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    const button = getByTestId('manage-subscription-button')
    const expectedUrl = core.organizationBillingPortalURL({
      organizationId: baseProps.organizationId,
    })

    expect(button).toHaveAttribute('href', expectedUrl)
    expect(button).toHaveTextContent('Manage Subscription →')
  })

  it('shows next billing date in correct format', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    // Date formatting may vary based on locale/timezone
    const dateElement = getByTestId('next-billing-date')
    expect(dateElement.textContent).toContain('Next billing date:')
    // Check that it contains the year at least
    expect(dateElement.textContent).toContain('2025')
  })

  it('does NOT show any upgrade-related content', () => {
    const { container } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    const content = container.textContent
    expect(content).not.toContain('Previous')
    expect(content).not.toContain('upgrade')
    expect(content).not.toContain('Upgrade')
    expect(content).not.toContain('Free')
  })

  it('displays correct header with organization logo', () => {
    const { getByTestId, getByAltText } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    expect(getByTestId('email-title')).toHaveTextContent(
      'Payment method confirmed'
    )
    expect(getByAltText('Logo')).toHaveAttribute(
      'src',
      baseProps.organizationLogoUrl
    )
  })

  it('renders without organization logo when not provided', () => {
    const propsWithoutLogo = {
      ...baseProps,
      organizationLogoUrl: undefined,
    }
    const { queryByAltText } = render(
      <CustomerSubscriptionCreatedEmail {...propsWithoutLogo} />
    )

    expect(queryByAltText('Logo')).not.toBeInTheDocument()
  })

  it('displays customer greeting correctly', () => {
    const { getByText } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    expect(
      getByText(`Hi ${baseProps.customerName},`)
    ).toBeInTheDocument()
  })

  it('shows organization name in signature', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    expect(getByTestId('signature-thanks')).toHaveTextContent(
      'Thanks,'
    )
    expect(getByTestId('signature-org-name')).toHaveTextContent(
      baseProps.organizationName
    )
  })

  it('handles different currency codes correctly', () => {
    const eurProps = {
      ...baseProps,
      currency: CurrencyCode.EUR,
      price: 2000, // €20.00
    }
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...eurProps} />
    )

    expect(getByTestId('price')).toHaveTextContent(
      'Price: €20.00/month'
    )
  })

  it('displays payment method info in body text when last4 is provided', () => {
    const { getByText } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    expect(
      getByText(
        /The payment method ending in 4242 will be used for future charges/
      )
    ).toBeInTheDocument()
  })

  it('displays generic payment text when last4 is not provided', () => {
    const propsWithoutPayment = {
      ...baseProps,
      paymentMethodLast4: undefined,
    }
    const { getByText } = render(
      <CustomerSubscriptionCreatedEmail {...propsWithoutPayment} />
    )

    expect(
      getByText(/The payment method will be used for future charges/)
    ).toBeInTheDocument()
  })

  it('handles non-renewing subscription without interval', () => {
    const nonRenewingProps = {
      ...baseProps,
      interval: undefined,
      nextBillingDate: undefined,
    }
    const { getByTestId, queryByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...nonRenewingProps} />
    )

    // Should show price without interval
    expect(getByTestId('price')).toHaveTextContent('Price: $25.00')
    // Should not show next billing date
    expect(queryByTestId('next-billing-date')).not.toBeInTheDocument()
  })

  it('formats weekly pricing correctly', () => {
    const weeklyProps = {
      ...baseProps,
      interval: IntervalUnit.Week,
      price: 500, // $5.00
    }
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...weeklyProps} />
    )

    expect(getByTestId('price')).toHaveTextContent(
      'Price: $5.00/week'
    )
  })

  it('formats daily pricing correctly', () => {
    const dailyProps = {
      ...baseProps,
      interval: IntervalUnit.Day,
      price: 100, // $1.00
    }
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...dailyProps} />
    )

    expect(getByTestId('price')).toHaveTextContent('Price: $1.00/day')
  })
})
