import { describe, expect, it } from 'bun:test'
import { render } from '@testing-library/react'
import { CurrencyCode, IntervalUnit } from '@/types'
import core from '@/utils/core'
import { CustomerSubscriptionAdjustedEmail } from './customer-subscription-adjusted'

describe('CustomerSubscriptionAdjustedEmail', () => {
  const baseProps = {
    customerName: 'John Doe',
    organizationName: 'Acme Corp',
    organizationLogoUrl: 'https://example.com/logo.png',
    organizationId: 'org_123',
    previousItems: [
      { name: 'Basic Plan', unitPrice: 1000, quantity: 1 },
    ],
    newItems: [{ name: 'Pro Plan', unitPrice: 2500, quantity: 1 }],
    previousTotalPrice: 1000,
    newTotalPrice: 2500,
    currency: CurrencyCode.USD,
    interval: IntervalUnit.Month,
    effectiveDate: new Date('2025-01-15'),
    nextBillingDate: new Date('2025-02-01'),
  }

  describe('upgrade emails', () => {
    it('renders title, proration amount, previous items, new items, and effective date', () => {
      const { getByTestId, getByText } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={1500}
        />
      )

      // Title and body text
      expect(getByTestId('email-title')).toHaveTextContent(
        'Your subscription has been upgraded'
      )
      expect(
        getByText('Your subscription has been successfully upgraded.')
      ).toBeInTheDocument()

      // Proration amount
      expect(getByTestId('proration-amount')).toHaveTextContent(
        'Prorated charge: $15.00'
      )

      // Previous items with prices
      expect(getByTestId('previous-plan-label')).toHaveTextContent(
        'Previous plan ($10.00/month):'
      )
      expect(getByTestId('previous-item-0')).toHaveTextContent(
        '• Basic Plan: $10.00/month'
      )

      // New items with prices
      expect(getByTestId('new-plan-label')).toHaveTextContent(
        'New plan ($25.00/month):'
      )
      expect(getByTestId('new-item-0')).toHaveTextContent(
        '• Pro Plan: $25.00/month'
      )

      // Effective date
      expect(getByTestId('effective-date')).toHaveTextContent(
        'Effective date:'
      )
      expect(getByTestId('effective-date').textContent).toContain(
        '2025'
      )
    })
  })

  describe('downgrade emails', () => {
    it('renders title, no proration, no-charge notice, and previous/new plan pricing', () => {
      const { getByTestId, getByText, queryByTestId } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="downgrade"
          prorationAmount={null}
          previousItems={[
            { name: 'Pro Plan', unitPrice: 2500, quantity: 1 },
          ]}
          newItems={[
            { name: 'Basic Plan', unitPrice: 1000, quantity: 1 },
          ]}
          previousTotalPrice={2500}
          newTotalPrice={1000}
        />
      )

      // Title and body text
      expect(getByTestId('email-title')).toHaveTextContent(
        'Your subscription has been updated'
      )
      expect(
        getByText('Your subscription has been successfully updated.')
      ).toBeInTheDocument()

      // No proration for downgrade
      expect(
        queryByTestId('proration-amount')
      ).not.toBeInTheDocument()
      expect(getByTestId('no-charge-notice')).toHaveTextContent(
        'No charge for this change.'
      )

      // Previous plan pricing
      expect(getByTestId('previous-plan-label')).toHaveTextContent(
        'Previous plan ($25.00/month):'
      )
      expect(getByTestId('previous-item-0')).toHaveTextContent(
        '• Pro Plan: $25.00/month'
      )

      // New plan pricing
      expect(getByTestId('new-plan-label')).toHaveTextContent(
        'New plan ($10.00/month):'
      )
      expect(getByTestId('new-item-0')).toHaveTextContent(
        '• Basic Plan: $10.00/month'
      )
    })
  })

  describe('multiple subscription items', () => {
    it('renders all previous and new items with quantities when subscription has multiple items', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={2000}
          previousItems={[
            { name: 'Basic Plan', unitPrice: 1000, quantity: 1 },
            { name: 'Add-on A', unitPrice: 500, quantity: 2 },
          ]}
          newItems={[
            { name: 'Pro Plan', unitPrice: 2500, quantity: 1 },
            { name: 'Add-on A', unitPrice: 500, quantity: 2 },
            { name: 'Add-on B', unitPrice: 300, quantity: 1 },
          ]}
          previousTotalPrice={2000}
          newTotalPrice={3800}
        />
      )

      // Check all previous items are listed
      expect(getByTestId('previous-item-0')).toHaveTextContent(
        '• Basic Plan: $10.00/month'
      )
      expect(getByTestId('previous-item-1')).toHaveTextContent(
        '• Add-on A: $5.00/month × 2'
      )

      // Check all new items are listed
      expect(getByTestId('new-item-0')).toHaveTextContent(
        '• Pro Plan: $25.00/month'
      )
      expect(getByTestId('new-item-1')).toHaveTextContent(
        '• Add-on A: $5.00/month × 2'
      )
      expect(getByTestId('new-item-2')).toHaveTextContent(
        '• Add-on B: $3.00/month'
      )
    })
  })

  describe('interval formatting', () => {
    it('displays prices with /year suffix when interval is Year', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={10000}
          interval={IntervalUnit.Year}
          previousTotalPrice={12000}
          newTotalPrice={24000}
        />
      )

      expect(getByTestId('previous-plan-label')).toHaveTextContent(
        'Previous plan ($120.00/year):'
      )
      expect(getByTestId('new-plan-label')).toHaveTextContent(
        'New plan ($240.00/year):'
      )
    })

    it('displays prices with /week suffix when interval is Week', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={500}
          interval={IntervalUnit.Week}
          previousTotalPrice={500}
          newTotalPrice={1000}
        />
      )

      expect(getByTestId('previous-plan-label')).toHaveTextContent(
        'Previous plan ($5.00/week):'
      )
    })

    it('displays prices with /day suffix when interval is Day', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={100}
          interval={IntervalUnit.Day}
          previousTotalPrice={100}
          newTotalPrice={200}
        />
      )

      expect(getByTestId('previous-plan-label')).toHaveTextContent(
        'Previous plan ($1.00/day):'
      )
    })

    it('displays prices without interval suffix when interval is undefined', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={1500}
          interval={undefined}
        />
      )

      // Should show price without interval
      expect(getByTestId('previous-plan-label')).toHaveTextContent(
        'Previous plan ($10.00):'
      )
      expect(getByTestId('new-plan-label')).toHaveTextContent(
        'New plan ($25.00):'
      )
    })
  })

  describe('currency formatting', () => {
    it('formats prices with EUR currency symbol when currency is EUR', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={1500}
          currency={CurrencyCode.EUR}
        />
      )

      expect(getByTestId('previous-plan-label')).toHaveTextContent(
        '€10.00/month'
      )
      expect(getByTestId('new-plan-label')).toHaveTextContent(
        '€25.00/month'
      )
      expect(getByTestId('proration-amount')).toHaveTextContent(
        '€15.00'
      )
    })
  })

  describe('UI elements', () => {
    it('includes billing portal link with correct URL and button text', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={1500}
        />
      )

      const button = getByTestId('manage-subscription-button')
      const expectedUrl = core.organizationBillingPortalURL({
        organizationId: baseProps.organizationId,
      })

      expect(button).toHaveAttribute('href', expectedUrl)
      expect(button).toHaveTextContent('Manage Subscription →')
    })

    it('displays greeting with customer name', () => {
      const { getByText } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={1500}
        />
      )

      expect(
        getByText(`Hi ${baseProps.customerName},`)
      ).toBeInTheDocument()
    })

    it('displays organization name in signature', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={1500}
        />
      )

      expect(getByTestId('signature-thanks')).toHaveTextContent(
        'Thanks,'
      )
      expect(getByTestId('signature-org-name')).toHaveTextContent(
        baseProps.organizationName
      )
    })

    it('displays organization logo in header when provided', () => {
      const { getByAltText } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={1500}
        />
      )

      expect(getByAltText('Logo')).toHaveAttribute(
        'src',
        baseProps.organizationLogoUrl
      )
    })

    it('omits logo when organizationLogoUrl is not provided', () => {
      const { queryByAltText } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          organizationLogoUrl={undefined}
          adjustmentType="upgrade"
          prorationAmount={1500}
        />
      )

      expect(queryByAltText('Logo')).not.toBeInTheDocument()
    })

    it('displays next billing date when provided', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={1500}
        />
      )

      expect(getByTestId('next-billing')).toHaveTextContent(
        'Your next billing date is'
      )
      expect(getByTestId('next-billing').textContent).toContain(
        '2025'
      )
    })

    it('omits next billing date section when nextBillingDate is not provided', () => {
      const { queryByTestId } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={1500}
          nextBillingDate={undefined}
        />
      )

      expect(queryByTestId('next-billing')).not.toBeInTheDocument()
    })
  })
})
