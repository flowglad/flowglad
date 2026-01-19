/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CurrencyCode, IntervalUnit } from '@/types'
import core from '@/utils/core'
import { CustomerSubscriptionCreatedEmail } from './customer-subscription-created'

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
    dateConfirmed: new Date('2025-01-15'),
  }

  const trialProps = {
    ...baseProps,
    trial: {
      trialEndDate: new Date('2025-01-29'),
      trialDurationDays: 14,
    },
  }

  it('renders body text correctly', () => {
    const { getByText } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    // Check that key text content is present
    expect(
      getByText(
        "You've successfully subscribed to the following plan:"
      )
    ).toBeInTheDocument()
  })

  it('shows auto-renewal transparency notice for non-trial subscriptions', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    const notice = getByTestId('auto-renew-notice')
    expect(notice).toHaveTextContent(
      'Your subscription automatically renews until canceled.'
    )
  })

  it('displays plan name in Apple-style table row', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    const planRow = getByTestId('plan-name')
    expect(planRow).toHaveTextContent('Plan')
    expect(planRow).toHaveTextContent('Pro Plan')
  })

  it('displays price in Apple-style table row', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    const priceRow = getByTestId('price')
    expect(priceRow).toHaveTextContent('Price')
    expect(priceRow).toHaveTextContent('$25.00/month')
  })

  it('formats monthly pricing correctly', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    expect(getByTestId('price')).toHaveTextContent('$25.00/month')
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

    expect(getByTestId('price')).toHaveTextContent('$300.00/year')
  })

  it('displays payment method in Apple-style table row', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    const paymentRow = getByTestId('payment-method')
    expect(paymentRow).toHaveTextContent('Payment Method')
    expect(paymentRow).toHaveTextContent('•••• 4242')
  })

  it('handles missing payment method gracefully', () => {
    const propsWithoutPayment = {
      ...baseProps,
      paymentMethodLast4: undefined,
    }
    const { queryByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...propsWithoutPayment} />
    )

    expect(queryByTestId('payment-method')).not.toBeInTheDocument()
  })

  it('includes inline manage subscription link', () => {
    const { getByText } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    const expectedUrl = core.organizationBillingPortalURL({
      organizationId: baseProps.organizationId,
    })

    const link = getByText('manage your subscription')
    expect(link).toHaveAttribute('href', expectedUrl)
  })

  it('shows next billing date in Apple-style table row', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    const dateRow = getByTestId('next-billing-date')
    expect(dateRow).toHaveTextContent('Next Billing Date')
    expect(dateRow).toHaveTextContent('2025')
  })

  it('shows date confirmed in Apple-style table row', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    const dateRow = getByTestId('date-confirmed')
    expect(dateRow).toHaveTextContent('Date Confirmed')
    expect(dateRow).toHaveTextContent('2025')
  })

  it('does NOT show any upgrade-related content', () => {
    const { container } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    const content = container.textContent
    expect(content).not.toContain('Previous')
    expect(content).not.toContain('upgrade')
    expect(content).not.toContain('Upgrade')
  })

  it('displays correct header with organization logo', () => {
    const { getByTestId, getByAltText } = render(
      <CustomerSubscriptionCreatedEmail {...baseProps} />
    )

    expect(getByTestId('email-title')).toHaveTextContent(
      'Subscription Confirmed'
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

    expect(getByTestId('price')).toHaveTextContent('€20.00/month')
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
    expect(getByTestId('price')).toHaveTextContent('$25.00')
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

    expect(getByTestId('price')).toHaveTextContent('$5.00/week')
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

    expect(getByTestId('price')).toHaveTextContent('$1.00/day')
  })

  // Trial subscription tests
  describe('trial subscription', () => {
    it('displays Subscription Confirmed header when trial info is present', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionCreatedEmail {...trialProps} />
      )

      expect(getByTestId('email-title')).toHaveTextContent(
        'Subscription Confirmed'
      )
    })

    it('shows trial info in Apple-style format with start date', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionCreatedEmail {...trialProps} />
      )

      const trialRow = getByTestId('trial-info')
      expect(trialRow).toHaveTextContent('Trial')
      expect(trialRow).toHaveTextContent('Free for 14 days')
      expect(trialRow).toHaveTextContent('starting')
    })

    it('shows renewal price with trial end date', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionCreatedEmail {...trialProps} />
      )

      const renewalRow = getByTestId('renewal-price')
      expect(renewalRow).toHaveTextContent('Renewal Price')
      expect(renewalRow).toHaveTextContent('$25.00/month')
      expect(renewalRow).toHaveTextContent('starting')
    })

    it('does NOT show regular price detail for trial subscriptions', () => {
      const { queryByTestId } = render(
        <CustomerSubscriptionCreatedEmail {...trialProps} />
      )

      expect(queryByTestId('price')).not.toBeInTheDocument()
    })

    it('does NOT show next billing date for trial subscriptions', () => {
      const { queryByTestId } = render(
        <CustomerSubscriptionCreatedEmail {...trialProps} />
      )

      expect(
        queryByTestId('next-billing-date')
      ).not.toBeInTheDocument()
    })

    it('shows auto-renew notice with cancellation deadline and inline link', () => {
      const { getByTestId, getByText } = render(
        <CustomerSubscriptionCreatedEmail {...trialProps} />
      )

      const notice = getByTestId('trial-auto-renew-notice')
      expect(notice).toHaveTextContent(
        'Your subscription automatically renews until canceled'
      )
      expect(notice).toHaveTextContent(
        'To avoid being charged, you must cancel at least a day before'
      )

      // Verify inline link is present
      const link = getByText('manage your subscription')
      expect(link).toHaveAttribute(
        'href',
        core.organizationBillingPortalURL({
          organizationId: trialProps.organizationId,
        })
      )
    })

    it('displays payment method for trials in table row', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionCreatedEmail {...trialProps} />
      )

      const paymentRow = getByTestId('payment-method')
      expect(paymentRow).toHaveTextContent('Payment Method')
      expect(paymentRow).toHaveTextContent('•••• 4242')
    })

    it('displays date confirmed for trials', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionCreatedEmail {...trialProps} />
      )

      const dateRow = getByTestId('date-confirmed')
      expect(dateRow).toHaveTextContent('Date Confirmed')
    })
  })
})
