/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CurrencyCode } from '@/types'
import { OrganizationSubscriptionAdjustedEmail } from './organization-subscription-adjusted'

describe('OrganizationSubscriptionAdjustedEmail', () => {
  const baseUpgradeProps = {
    organizationName: 'Acme Corp',
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
    customerId: 'cus_123',
    adjustmentType: 'upgrade' as const,
    previousItems: [
      { name: 'Basic Plan', unitPrice: 1000, quantity: 1 },
    ],
    newItems: [{ name: 'Pro Plan', unitPrice: 2500, quantity: 1 }],
    previousTotalPrice: 1000,
    newTotalPrice: 2500,
    currency: CurrencyCode.USD,
    prorationAmount: 1500,
    effectiveDate: new Date('2025-01-15'),
    livemode: true,
  }

  const baseDowngradeProps = {
    ...baseUpgradeProps,
    adjustmentType: 'downgrade' as const,
    previousItems: [
      { name: 'Pro Plan', unitPrice: 2500, quantity: 1 },
    ],
    newItems: [{ name: 'Basic Plan', unitPrice: 1000, quantity: 1 }],
    previousTotalPrice: 2500,
    newTotalPrice: 1000,
    prorationAmount: null,
  }

  it('renders upgrade email with title, message, customer details, plan items, proration, effective date, and customer profile link', () => {
    const { getByText, getByRole } = render(
      <OrganizationSubscriptionAdjustedEmail {...baseUpgradeProps} />
    )

    // Title and message
    expect(getByText('Subscription Upgraded')).toBeInTheDocument()
    expect(
      getByText('John Doe has upgraded their subscription.')
    ).toBeInTheDocument()

    // Customer details
    expect(getByText('Customer Name')).toBeInTheDocument()
    expect(getByText('John Doe')).toBeInTheDocument()
    expect(getByText('Customer Email')).toBeInTheDocument()
    expect(getByText('john@example.com')).toBeInTheDocument()

    // Previous plan
    expect(getByText('Previous Plan')).toBeInTheDocument()
    expect(getByText('Basic Plan x 1 @ $10.00')).toBeInTheDocument()
    expect(getByText('Total: $10.00')).toBeInTheDocument()

    // New plan
    expect(getByText('New Plan')).toBeInTheDocument()
    expect(getByText('Pro Plan x 1 @ $25.00')).toBeInTheDocument()
    expect(getByText('Total: $25.00')).toBeInTheDocument()

    // Proration
    expect(getByText('Proration Charged')).toBeInTheDocument()
    expect(getByText('$15.00')).toBeInTheDocument()

    // Effective date
    expect(getByText('Effective Date')).toBeInTheDocument()
    const dateString =
      baseUpgradeProps.effectiveDate.toLocaleDateString()
    expect(getByText(dateString)).toBeInTheDocument()

    // Customer profile link
    const link = getByRole('link', {
      name: /View Customer Profile/i,
    })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute(
      'href',
      `https://app.flowglad.com/customers/${baseUpgradeProps.customerId}`
    )

    // Dashboard management message
    expect(
      getByText(
        /You can manage this customer's subscription and access their information through your dashboard/
      )
    ).toBeInTheDocument()
  })

  it('renders downgrade email with title, message, no charge indicator, and plan items', () => {
    const { getByText, queryByText } = render(
      <OrganizationSubscriptionAdjustedEmail
        {...baseDowngradeProps}
      />
    )

    // Title and message
    expect(getByText('Subscription Downgraded')).toBeInTheDocument()
    expect(
      getByText('John Doe has downgraded their subscription.')
    ).toBeInTheDocument()

    // No charge indicator instead of proration
    expect(getByText('Charge')).toBeInTheDocument()
    expect(getByText('No charge (downgrade)')).toBeInTheDocument()
    expect(queryByText('Proration Charged')).not.toBeInTheDocument()

    // Plan items
    expect(getByText('Previous Plan')).toBeInTheDocument()
    expect(getByText('Pro Plan x 1 @ $25.00')).toBeInTheDocument()
    expect(getByText('New Plan')).toBeInTheDocument()
    expect(getByText('Basic Plan x 1 @ $10.00')).toBeInTheDocument()
  })

  it('renders multiple previous and new subscription items with correct totals', () => {
    const multiItemProps = {
      ...baseUpgradeProps,
      previousItems: [
        { name: 'Basic Plan', unitPrice: 1000, quantity: 1 },
        { name: 'Add-on Feature', unitPrice: 500, quantity: 2 },
      ],
      newItems: [
        { name: 'Pro Plan', unitPrice: 2500, quantity: 1 },
        { name: 'Premium Add-on', unitPrice: 1000, quantity: 3 },
      ],
      previousTotalPrice: 2000,
      newTotalPrice: 5500,
    }

    const { getByText } = render(
      <OrganizationSubscriptionAdjustedEmail {...multiItemProps} />
    )

    expect(getByText('Basic Plan x 1 @ $10.00')).toBeInTheDocument()
    expect(
      getByText('Add-on Feature x 2 @ $5.00')
    ).toBeInTheDocument()
    expect(getByText('Pro Plan x 1 @ $25.00')).toBeInTheDocument()
    expect(
      getByText('Premium Add-on x 3 @ $10.00')
    ).toBeInTheDocument()
    expect(getByText('Total: $20.00')).toBeInTheDocument()
    expect(getByText('Total: $55.00')).toBeInTheDocument()
  })

  it('omits email section when customerEmail is null', () => {
    const propsWithoutEmail = {
      ...baseUpgradeProps,
      customerEmail: null,
    }

    const { queryByText, getByText } = render(
      <OrganizationSubscriptionAdjustedEmail {...propsWithoutEmail} />
    )

    expect(getByText('Customer Name')).toBeInTheDocument()
    expect(getByText('John Doe')).toBeInTheDocument()
    expect(queryByText('Customer Email')).not.toBeInTheDocument()
  })

  it('formats EUR prices with € symbol', () => {
    const euroProps = {
      ...baseUpgradeProps,
      currency: CurrencyCode.EUR,
      previousItems: [
        { name: 'Basic Plan', unitPrice: 1000, quantity: 1 },
      ],
      newItems: [{ name: 'Pro Plan', unitPrice: 2500, quantity: 1 }],
      prorationAmount: 1500,
    }

    const { getByText } = render(
      <OrganizationSubscriptionAdjustedEmail {...euroProps} />
    )

    expect(getByText('Basic Plan x 1 @ €10.00')).toBeInTheDocument()
    expect(getByText('Pro Plan x 1 @ €25.00')).toBeInTheDocument()
    expect(getByText('€15.00')).toBeInTheDocument()
  })

  it('formats GBP prices with £ symbol', () => {
    const gbpProps = {
      ...baseUpgradeProps,
      currency: CurrencyCode.GBP,
      previousItems: [
        { name: 'Basic Plan', unitPrice: 1000, quantity: 1 },
      ],
      newItems: [{ name: 'Pro Plan', unitPrice: 2500, quantity: 1 }],
      prorationAmount: 1500,
    }

    const { getByText } = render(
      <OrganizationSubscriptionAdjustedEmail {...gbpProps} />
    )

    expect(getByText('Basic Plan x 1 @ £10.00')).toBeInTheDocument()
    expect(getByText('Pro Plan x 1 @ £25.00')).toBeInTheDocument()
    expect(getByText('£15.00')).toBeInTheDocument()
  })

  it('displays provided customer name in details and upgrade message', () => {
    const customProps = {
      ...baseUpgradeProps,
      customerName: 'Jane Smith',
    }

    const { getByText } = render(
      <OrganizationSubscriptionAdjustedEmail {...customProps} />
    )

    expect(getByText('Jane Smith')).toBeInTheDocument()
    expect(
      getByText('Jane Smith has upgraded their subscription.')
    ).toBeInTheDocument()
  })
})
