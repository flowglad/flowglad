import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
    it('should render upgrade email with proration amount', () => {
      const { getByTestId, getByText } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={1500}
        />
      )

      expect(getByTestId('email-title')).toHaveTextContent(
        'Your subscription has been upgraded'
      )
      expect(
        getByText('Your subscription has been successfully upgraded.')
      ).toBeInTheDocument()
      expect(getByTestId('proration-amount')).toHaveTextContent(
        'Prorated charge: $15.00'
      )
    })

    it('should show previous items with prices', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={1500}
        />
      )

      expect(getByTestId('previous-plan-label')).toHaveTextContent(
        'Previous plan ($10.00/month):'
      )
      expect(getByTestId('previous-item-0')).toHaveTextContent(
        '• Basic Plan: $10.00/month'
      )
    })

    it('should show new items with prices', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={1500}
        />
      )

      expect(getByTestId('new-plan-label')).toHaveTextContent(
        'New plan ($25.00/month):'
      )
      expect(getByTestId('new-item-0')).toHaveTextContent(
        '• Pro Plan: $25.00/month'
      )
    })

    it('should show effective date', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionAdjustedEmail
          {...baseProps}
          adjustmentType="upgrade"
          prorationAmount={1500}
        />
      )

      expect(getByTestId('effective-date')).toHaveTextContent(
        'Effective date:'
      )
      expect(getByTestId('effective-date').textContent).toContain(
        '2025'
      )
    })
  })

  describe('downgrade emails', () => {
    it('should render downgrade email without proration', () => {
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

      expect(getByTestId('email-title')).toHaveTextContent(
        'Your subscription has been updated'
      )
      expect(
        getByText('Your subscription has been successfully updated.')
      ).toBeInTheDocument()
      expect(
        queryByTestId('proration-amount')
      ).not.toBeInTheDocument()
      expect(getByTestId('no-charge-notice')).toHaveTextContent(
        'No charge for this change.'
      )
    })

    it('should show previous and new items for downgrade', () => {
      const { getByTestId } = render(
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

      expect(getByTestId('previous-plan-label')).toHaveTextContent(
        'Previous plan ($25.00/month):'
      )
      expect(getByTestId('previous-item-0')).toHaveTextContent(
        '• Pro Plan: $25.00/month'
      )
      expect(getByTestId('new-plan-label')).toHaveTextContent(
        'New plan ($10.00/month):'
      )
      expect(getByTestId('new-item-0')).toHaveTextContent(
        '• Basic Plan: $10.00/month'
      )
    })
  })

  describe('multiple subscription items', () => {
    it('should handle multiple subscription items', () => {
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
    it('formats yearly pricing correctly', () => {
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

    it('formats weekly pricing correctly', () => {
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

    it('formats daily pricing correctly', () => {
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

    it('handles non-recurring subscription without interval', () => {
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
    it('handles different currency codes correctly', () => {
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
    it('includes billing portal link', () => {
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

    it('displays customer greeting correctly', () => {
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

    it('shows organization name in signature', () => {
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

    it('displays correct header with organization logo', () => {
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

    it('renders without organization logo when not provided', () => {
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

    it('shows next billing date when provided', () => {
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

    it('hides next billing date when not provided', () => {
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
