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

  describe('upgrade email', () => {
    it('renders upgrade email with correct title', () => {
      const { getByText } = render(
        <OrganizationSubscriptionAdjustedEmail
          {...baseUpgradeProps}
        />
      )

      expect(getByText('Subscription Upgraded')).toBeInTheDocument()
    })

    it('displays customer has upgraded message', () => {
      const { getByText } = render(
        <OrganizationSubscriptionAdjustedEmail
          {...baseUpgradeProps}
        />
      )

      expect(
        getByText('John Doe has upgraded their subscription.')
      ).toBeInTheDocument()
    })

    it('shows customer details', () => {
      const { getByText } = render(
        <OrganizationSubscriptionAdjustedEmail
          {...baseUpgradeProps}
        />
      )

      expect(getByText('Customer Name')).toBeInTheDocument()
      expect(getByText('John Doe')).toBeInTheDocument()
      expect(getByText('Customer Email')).toBeInTheDocument()
      expect(getByText('john@example.com')).toBeInTheDocument()
    })

    it('shows previous plan items with prices', () => {
      const { getByText } = render(
        <OrganizationSubscriptionAdjustedEmail
          {...baseUpgradeProps}
        />
      )

      expect(getByText('Previous Plan')).toBeInTheDocument()
      expect(getByText('Basic Plan x 1 @ $10.00')).toBeInTheDocument()
      expect(getByText('Total: $10.00')).toBeInTheDocument()
    })

    it('shows new plan items with prices', () => {
      const { getByText } = render(
        <OrganizationSubscriptionAdjustedEmail
          {...baseUpgradeProps}
        />
      )

      expect(getByText('New Plan')).toBeInTheDocument()
      expect(getByText('Pro Plan x 1 @ $25.00')).toBeInTheDocument()
      expect(getByText('Total: $25.00')).toBeInTheDocument()
    })

    it('shows proration amount for upgrades', () => {
      const { getByText } = render(
        <OrganizationSubscriptionAdjustedEmail
          {...baseUpgradeProps}
        />
      )

      expect(getByText('Proration Charged')).toBeInTheDocument()
      expect(getByText('$15.00')).toBeInTheDocument()
    })

    it('shows effective date', () => {
      const { getByText } = render(
        <OrganizationSubscriptionAdjustedEmail
          {...baseUpgradeProps}
        />
      )

      expect(getByText('Effective Date')).toBeInTheDocument()
      const dateString =
        baseUpgradeProps.effectiveDate.toLocaleDateString()
      expect(getByText(dateString)).toBeInTheDocument()
    })

    it('includes customer profile link', () => {
      const { getByRole } = render(
        <OrganizationSubscriptionAdjustedEmail
          {...baseUpgradeProps}
        />
      )

      const link = getByRole('link', {
        name: /View Customer Profile/i,
      })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute(
        'href',
        `https://app.flowglad.com/customers/${baseUpgradeProps.customerId}`
      )
    })
  })

  describe('downgrade email', () => {
    it('renders downgrade email with correct title', () => {
      const { getByText } = render(
        <OrganizationSubscriptionAdjustedEmail
          {...baseDowngradeProps}
        />
      )

      expect(getByText('Subscription Downgraded')).toBeInTheDocument()
    })

    it('displays customer has downgraded message', () => {
      const { getByText } = render(
        <OrganizationSubscriptionAdjustedEmail
          {...baseDowngradeProps}
        />
      )

      expect(
        getByText('John Doe has downgraded their subscription.')
      ).toBeInTheDocument()
    })

    it('shows no charge for downgrades', () => {
      const { getByText, queryByText } = render(
        <OrganizationSubscriptionAdjustedEmail
          {...baseDowngradeProps}
        />
      )

      expect(getByText('Charge')).toBeInTheDocument()
      expect(getByText('No charge (downgrade)')).toBeInTheDocument()
      expect(queryByText('Proration Charged')).not.toBeInTheDocument()
    })

    it('shows previous and new plan items', () => {
      const { getByText } = render(
        <OrganizationSubscriptionAdjustedEmail
          {...baseDowngradeProps}
        />
      )

      expect(getByText('Previous Plan')).toBeInTheDocument()
      expect(getByText('Pro Plan x 1 @ $25.00')).toBeInTheDocument()
      expect(getByText('New Plan')).toBeInTheDocument()
      expect(getByText('Basic Plan x 1 @ $10.00')).toBeInTheDocument()
    })
  })

  describe('multiple subscription items', () => {
    it('handles multiple previous and new items', () => {
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
  })

  describe('customer email handling', () => {
    it('handles null customer email gracefully', () => {
      const propsWithoutEmail = {
        ...baseUpgradeProps,
        customerEmail: null,
      }

      const { queryByText, getByText } = render(
        <OrganizationSubscriptionAdjustedEmail
          {...propsWithoutEmail}
        />
      )

      expect(getByText('Customer Name')).toBeInTheDocument()
      expect(getByText('John Doe')).toBeInTheDocument()
      expect(queryByText('Customer Email')).not.toBeInTheDocument()
    })
  })

  describe('currency formatting', () => {
    it('handles EUR currency correctly', () => {
      const euroProps = {
        ...baseUpgradeProps,
        currency: CurrencyCode.EUR,
        previousItems: [
          { name: 'Basic Plan', unitPrice: 1000, quantity: 1 },
        ],
        newItems: [
          { name: 'Pro Plan', unitPrice: 2500, quantity: 1 },
        ],
        prorationAmount: 1500,
      }

      const { getByText } = render(
        <OrganizationSubscriptionAdjustedEmail {...euroProps} />
      )

      expect(getByText('Basic Plan x 1 @ €10.00')).toBeInTheDocument()
      expect(getByText('Pro Plan x 1 @ €25.00')).toBeInTheDocument()
      expect(getByText('€15.00')).toBeInTheDocument()
    })

    it('handles GBP currency correctly', () => {
      const gbpProps = {
        ...baseUpgradeProps,
        currency: CurrencyCode.GBP,
        previousItems: [
          { name: 'Basic Plan', unitPrice: 1000, quantity: 1 },
        ],
        newItems: [
          { name: 'Pro Plan', unitPrice: 2500, quantity: 1 },
        ],
        prorationAmount: 1500,
      }

      const { getByText } = render(
        <OrganizationSubscriptionAdjustedEmail {...gbpProps} />
      )

      expect(getByText('Basic Plan x 1 @ £10.00')).toBeInTheDocument()
      expect(getByText('Pro Plan x 1 @ £25.00')).toBeInTheDocument()
      expect(getByText('£15.00')).toBeInTheDocument()
    })
  })

  describe('different customer names', () => {
    it('handles different customer names correctly', () => {
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

  describe('dashboard footer text', () => {
    it('includes dashboard management message', () => {
      const { getByText } = render(
        <OrganizationSubscriptionAdjustedEmail
          {...baseUpgradeProps}
        />
      )

      expect(
        getByText(
          /You can manage this customer's subscription and access their information through your dashboard/
        )
      ).toBeInTheDocument()
    })
  })
})
