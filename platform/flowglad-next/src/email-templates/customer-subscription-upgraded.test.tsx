import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CustomerSubscriptionUpgradedEmail } from './customer-subscription-upgraded'
import { CurrencyCode, IntervalUnit } from '@/types'
import core from '@/utils/core'

describe('CustomerSubscriptionUpgradedEmail', () => {
  const baseProps = {
    customerName: 'Jane Smith',
    organizationName: 'Tech Solutions',
    organizationLogoUrl: 'https://example.com/logo.png',
    organizationId: 'org_789',
    customerExternalId: 'cus_101',
    previousPlanName: 'Free Plan',
    previousPlanPrice: 0,
    previousPlanCurrency: CurrencyCode.USD,
    previousPlanInterval: IntervalUnit.Month,
    newPlanName: 'Pro Plan',
    price: 4900, // $49.00
    currency: CurrencyCode.USD,
    interval: IntervalUnit.Month,
    nextBillingDate: new Date('2025-02-15'),
    paymentMethodLast4: '1234',
  }

  it('renders upgrade-specific subject line', () => {
    const { getByText, getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...baseProps} />
    )

    // Check that key text content is present
    expect(
      getByText('Your subscription has been successfully upgraded.')
    ).toBeInTheDocument()
    expect(getByTestId('email-title')).toHaveTextContent(
      'Subscription upgraded'
    )
  })

  it('shows previous plan name clearly', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...baseProps} />
    )

    expect(getByTestId('previous-plan')).toHaveTextContent(
      'Previous plan: Free Plan (Free)'
    )
  })

  it('shows new plan name and pricing', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...baseProps} />
    )

    expect(getByTestId('new-plan')).toHaveTextContent(
      'New plan: Pro Plan'
    )
    expect(getByTestId('price')).toHaveTextContent(
      'Price: $49.00/month'
    )
  })

  it('displays transition arrow or similar visual indicator', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...baseProps} />
    )

    // Check that both plans are shown in order
    const previousPlan = getByTestId('previous-plan')
    const newPlan = getByTestId('new-plan')

    expect(previousPlan).toBeInTheDocument()
    expect(newPlan).toBeInTheDocument()

    // They should be shown in a detail section that implies transition
    expect(previousPlan.parentElement).toBe(newPlan.parentElement)
  })

  it('includes upgrade date as first charge date', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...baseProps} />
    )

    // Date formatting may vary based on locale/timezone
    const dateElement = getByTestId('first-charge-date')
    expect(dateElement.textContent).toContain('First charge:')
    // Check that it contains the year at least
    expect(dateElement.textContent).toContain('2025')
  })

  it('formats pricing for monthly subscriptions', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...baseProps} />
    )

    expect(getByTestId('price')).toHaveTextContent(
      'Price: $49.00/month'
    )
  })

  it('formats pricing for yearly subscriptions', () => {
    const yearlyProps = {
      ...baseProps,
      interval: IntervalUnit.Year,
      price: 50000, // $500.00
    }
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...yearlyProps} />
    )

    expect(getByTestId('price')).toHaveTextContent(
      'Price: $500.00/year'
    )
  })

  it('shows paid previous plan with pricing', () => {
    const paidToPaidProps = {
      ...baseProps,
      previousPlanName: 'Basic Plan',
      previousPlanPrice: 1900, // $19.00
      previousPlanCurrency: CurrencyCode.USD,
      previousPlanInterval: IntervalUnit.Month,
    }
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...paidToPaidProps} />
    )

    expect(getByTestId('previous-plan')).toHaveTextContent(
      'Previous plan: Basic Plan ($19.00/month)'
    )
  })

  it('handles yearly previous plan correctly', () => {
    const yearlyPreviousProps = {
      ...baseProps,
      previousPlanName: 'Basic Yearly',
      previousPlanPrice: 20000, // $200.00
      previousPlanCurrency: CurrencyCode.USD,
      previousPlanInterval: IntervalUnit.Year,
    }
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...yearlyPreviousProps} />
    )

    expect(getByTestId('previous-plan')).toHaveTextContent(
      'Previous plan: Basic Yearly ($200.00/year)'
    )
  })

  it('handles different currencies for previous plan', () => {
    const differentCurrencyProps = {
      ...baseProps,
      previousPlanName: 'Euro Basic',
      previousPlanPrice: 2500, // €25.00
      previousPlanCurrency: CurrencyCode.EUR,
      previousPlanInterval: IntervalUnit.Month,
      currency: CurrencyCode.EUR,
      price: 4500, // €45.00
    }
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail
        {...differentCurrencyProps}
      />
    )

    expect(getByTestId('previous-plan')).toHaveTextContent(
      'Previous plan: Euro Basic (€25.00/month)'
    )
    expect(getByTestId('price')).toHaveTextContent(
      'Price: €45.00/month'
    )
  })

  it('includes payment method confirmation', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...baseProps} />
    )

    expect(getByTestId('payment-method')).toHaveTextContent(
      'Payment method: •••• 1234'
    )
  })

  it('includes billing portal link for management', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...baseProps} />
    )

    const button = getByTestId('manage-subscription-button')
    const expectedUrl = core.organizationBillingPortalURL({
      organizationId: baseProps.organizationId,
    })

    expect(button).toHaveAttribute('href', expectedUrl)
    expect(button).toHaveTextContent('Manage Subscription →')
  })

  it('displays upgrade-specific header title', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...baseProps} />
    )

    expect(getByTestId('email-title')).toHaveTextContent(
      'Subscription upgraded'
    )
  })

  it('shows clear message about the upgrade in body', () => {
    const { getByText } = render(
      <CustomerSubscriptionUpgradedEmail {...baseProps} />
    )

    expect(
      getByText('Your subscription has been successfully upgraded.')
    ).toBeInTheDocument()
  })

  it('includes first charge information in body text', () => {
    const { getByText } = render(
      <CustomerSubscriptionUpgradedEmail {...baseProps} />
    )

    // Check for the charge text - the date formatting may vary
    const chargeText = getByText((content, element) => {
      return (
        element?.tagName === 'P' &&
        content.includes(
          'Your first charge of $49.00 will be processed'
        )
      )
    })
    expect(chargeText).toBeInTheDocument()
  })

  it('handles missing payment method gracefully', () => {
    const propsWithoutPayment = {
      ...baseProps,
      paymentMethodLast4: undefined,
    }
    const { queryByTestId, getByText } = render(
      <CustomerSubscriptionUpgradedEmail {...propsWithoutPayment} />
    )

    expect(queryByTestId('payment-method')).not.toBeInTheDocument()
    // Should still show first charge date without payment method details
    const chargeText = getByText((content, element) => {
      return (
        element?.tagName === 'P' &&
        content.includes(
          'Your first charge of $49.00 will be processed'
        )
      )
    })
    expect(chargeText).toBeInTheDocument()
  })

  it('displays customer greeting correctly', () => {
    const { getByText } = render(
      <CustomerSubscriptionUpgradedEmail {...baseProps} />
    )

    expect(
      getByText(`Hi ${baseProps.customerName},`)
    ).toBeInTheDocument()
  })

  it('shows organization name in signature', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...baseProps} />
    )

    expect(getByTestId('signature-thanks')).toHaveTextContent(
      'Thanks,'
    )
    expect(getByTestId('signature-org-name')).toHaveTextContent(
      baseProps.organizationName
    )
  })

  it('handles different currency codes correctly', () => {
    const gbpProps = {
      ...baseProps,
      previousPlanCurrency: CurrencyCode.GBP,
      currency: CurrencyCode.GBP,
      price: 3500, // £35.00
    }
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...gbpProps} />
    )

    expect(getByTestId('price')).toHaveTextContent(
      'Price: £35.00/month'
    )
  })

  it('shows Free label for zero-price previous plan', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...baseProps} />
    )

    // Previous plan should clearly indicate it was free when price is 0
    expect(getByTestId('previous-plan')).toHaveTextContent('(Free)')
  })

  it('includes payment method info in charge description when provided', () => {
    const { getByText } = render(
      <CustomerSubscriptionUpgradedEmail {...baseProps} />
    )

    expect(
      getByText(/The payment method ending in 1234 will be used/)
    ).toBeInTheDocument()
  })

  it('excludes payment method from charge description when not provided', () => {
    const propsWithoutPayment = {
      ...baseProps,
      paymentMethodLast4: undefined,
    }
    const { container } = render(
      <CustomerSubscriptionUpgradedEmail {...propsWithoutPayment} />
    )

    const content = container.textContent
    expect(content).not.toContain('The payment method ending in')
  })

  it('renders without organization logo when not provided', () => {
    const propsWithoutLogo = {
      ...baseProps,
      organizationLogoUrl: undefined,
    }
    const { queryByAltText } = render(
      <CustomerSubscriptionUpgradedEmail {...propsWithoutLogo} />
    )

    expect(queryByAltText('Logo')).not.toBeInTheDocument()
  })

  it('handles non-renewing upgraded subscription without interval', () => {
    const nonRenewingProps = {
      ...baseProps,
      interval: undefined,
      nextBillingDate: undefined,
    }
    const { getByTestId, queryByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...nonRenewingProps} />
    )

    // Should show price without interval
    expect(getByTestId('price')).toHaveTextContent('Price: $49.00')
    // Should not show first charge date
    expect(queryByTestId('first-charge-date')).not.toBeInTheDocument()
  })

  it('handles weekly interval for upgraded subscription', () => {
    const weeklyProps = {
      ...baseProps,
      interval: IntervalUnit.Week,
      price: 700, // $7.00
    }
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...weeklyProps} />
    )

    expect(getByTestId('price')).toHaveTextContent(
      'Price: $7.00/week'
    )
  })

  it('handles daily interval for upgraded subscription', () => {
    const dailyProps = {
      ...baseProps,
      interval: IntervalUnit.Day,
      price: 199, // $1.99
    }
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...dailyProps} />
    )

    expect(getByTestId('price')).toHaveTextContent('Price: $1.99/day')
  })

  it('handles previous plan with weekly interval', () => {
    const weeklyPreviousProps = {
      ...baseProps,
      previousPlanName: 'Weekly Basic',
      previousPlanPrice: 700, // $7.00
      previousPlanCurrency: CurrencyCode.USD,
      previousPlanInterval: IntervalUnit.Week,
    }
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail {...weeklyPreviousProps} />
    )

    expect(getByTestId('previous-plan')).toHaveTextContent(
      'Previous plan: Weekly Basic ($7.00/week)'
    )
  })

  it('handles non-renewing previous plan', () => {
    const nonRenewingPreviousProps = {
      ...baseProps,
      previousPlanName: 'One-time Plan',
      previousPlanPrice: 9900, // $99.00
      previousPlanCurrency: CurrencyCode.USD,
      previousPlanInterval: undefined,
    }
    const { getByTestId } = render(
      <CustomerSubscriptionUpgradedEmail
        {...nonRenewingPreviousProps}
      />
    )

    expect(getByTestId('previous-plan')).toHaveTextContent(
      'Previous plan: One-time Plan ($99.00)'
    )
  })
})
