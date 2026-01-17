/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CurrencyCode, IntervalUnit } from '@/types'
import core from '@/utils/core'
import { CustomerSubscriptionRenewalReminderEmail } from './customer-subscription-renewal-reminder'

describe('CustomerSubscriptionRenewalReminderEmail', () => {
  const baseProps = {
    customerName: 'John Doe',
    organizationName: 'Acme Corp',
    organizationLogoUrl: 'https://example.com/logo.png',
    organizationId: 'org_123',
    customerId: 'cus_456',
    planName: 'Pro Plan',
    renewalDate: new Date('2025-01-15'),
    daysUntilRenewal: 7,
    price: 2500, // $25.00
    currency: CurrencyCode.USD,
    interval: IntervalUnit.Month,
    livemode: true,
  }

  it('displays correct header title', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionRenewalReminderEmail {...baseProps} />
    )

    expect(getByTestId('email-title')).toHaveTextContent(
      'Subscription Renewal'
    )
  })

  it('shows customer greeting', () => {
    const { getByText } = render(
      <CustomerSubscriptionRenewalReminderEmail {...baseProps} />
    )

    expect(
      getByText(`Hi ${baseProps.customerName},`)
    ).toBeInTheDocument()
  })

  it('shows enjoyment message', () => {
    const { getByText } = render(
      <CustomerSubscriptionRenewalReminderEmail {...baseProps} />
    )

    expect(
      getByText(
        "We hope you're enjoying your subscription, which will renew soon."
      )
    ).toBeInTheDocument()
  })

  it('shows plan name', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionRenewalReminderEmail {...baseProps} />
    )

    expect(getByTestId('plan-name')).toHaveTextContent(
      `Plan: ${baseProps.planName}`
    )
  })

  it('shows renewal date', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionRenewalReminderEmail {...baseProps} />
    )

    expect(getByTestId('renewal-date')).toHaveTextContent(
      'Renewal date:'
    )
    expect(getByTestId('renewal-date')).toHaveTextContent('2025')
  })

  it('shows renewal price with interval', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionRenewalReminderEmail {...baseProps} />
    )

    expect(getByTestId('renewal-price')).toHaveTextContent(
      'Renewal price: $25.00/month'
    )
  })

  it('shows auto-renewal notice with date and price', () => {
    const { getByText } = render(
      <CustomerSubscriptionRenewalReminderEmail {...baseProps} />
    )

    expect(
      getByText(
        /your subscription automatically renews for \$25\.00\/month/
      )
    ).toBeInTheDocument()
  })

  it('displays cancellation instructions', () => {
    const { getByText } = render(
      <CustomerSubscriptionRenewalReminderEmail {...baseProps} />
    )

    expect(
      getByText(
        /To avoid being charged, you must cancel at least a day before the renewal date/
      )
    ).toBeInTheDocument()
    expect(
      getByText(
        /To keep your subscription, no further action is needed/
      )
    ).toBeInTheDocument()
  })

  it('shows manage subscription button with correct link', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionRenewalReminderEmail {...baseProps} />
    )

    const button = getByTestId('manage-subscription-button')
    expect(button).toHaveTextContent('Manage Subscription →')
    expect(button).toHaveAttribute(
      'href',
      core.customerBillingPortalURL({
        organizationId: baseProps.organizationId,
        customerId: baseProps.customerId,
      })
    )
  })

  it('shows organization signature', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionRenewalReminderEmail {...baseProps} />
    )

    expect(getByTestId('signature-thanks')).toHaveTextContent(
      'Thanks,'
    )
    expect(getByTestId('signature-org-name')).toHaveTextContent(
      baseProps.organizationName
    )
  })

  describe('price formatting', () => {
    it('shows yearly interval correctly', () => {
      const yearlyProps = {
        ...baseProps,
        interval: IntervalUnit.Year,
        price: 29900, // $299.00
      }

      const { getByTestId } = render(
        <CustomerSubscriptionRenewalReminderEmail {...yearlyProps} />
      )

      expect(getByTestId('renewal-price')).toHaveTextContent(
        'Renewal price: $299.00/year'
      )
    })

    it('shows weekly interval correctly', () => {
      const weeklyProps = {
        ...baseProps,
        interval: IntervalUnit.Week,
        price: 999, // $9.99
      }

      const { getByTestId } = render(
        <CustomerSubscriptionRenewalReminderEmail {...weeklyProps} />
      )

      expect(getByTestId('renewal-price')).toHaveTextContent(
        'Renewal price: $9.99/week'
      )
    })

    it('shows price without interval when interval is not provided', () => {
      const noIntervalProps = {
        ...baseProps,
        interval: undefined,
      }

      const { getByTestId } = render(
        <CustomerSubscriptionRenewalReminderEmail
          {...noIntervalProps}
        />
      )

      expect(getByTestId('renewal-price')).toHaveTextContent(
        'Renewal price: $25.00'
      )
    })
  })

  describe('test mode', () => {
    it('shows test mode banner when livemode is false', () => {
      const testModeProps = {
        ...baseProps,
        livemode: false,
      }

      const { getByText } = render(
        <CustomerSubscriptionRenewalReminderEmail
          {...testModeProps}
        />
      )

      expect(getByText('Test mode')).toBeInTheDocument()
    })

    it('does not show test mode banner when livemode is true', () => {
      const { queryByText } = render(
        <CustomerSubscriptionRenewalReminderEmail {...baseProps} />
      )

      expect(queryByText('Test mode')).not.toBeInTheDocument()
    })
  })
})
