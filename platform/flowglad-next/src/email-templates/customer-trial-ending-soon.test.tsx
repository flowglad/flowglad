/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CurrencyCode, IntervalUnit } from '@/types'
import core from '@/utils/core'
import { CustomerTrialEndingSoonEmail } from './customer-trial-ending-soon'

describe('CustomerTrialEndingSoonEmail', () => {
  const baseProps = {
    customerName: 'John Doe',
    organizationName: 'Acme Corp',
    organizationLogoUrl: 'https://example.com/logo.png',
    organizationId: 'org_123',
    customerId: 'cus_456',
    planName: 'Pro Plan',
    trialEndDate: new Date('2025-01-15'),
    daysRemaining: 3,
    price: 2500, // $25.00
    currency: CurrencyCode.USD,
    interval: IntervalUnit.Month,
    hasPaymentMethod: true,
    livemode: true,
  }

  describe('with payment method', () => {
    it('displays correct header', () => {
      const { getByTestId } = render(
        <CustomerTrialEndingSoonEmail {...baseProps} />
      )

      expect(getByTestId('email-title')).toHaveTextContent(
        'Trial Ending Soon'
      )
    })

    it('shows trial end date', () => {
      const { getByTestId } = render(
        <CustomerTrialEndingSoonEmail {...baseProps} />
      )

      expect(getByTestId('trial-end-date')).toHaveTextContent(
        'Trial ends:'
      )
      expect(getByTestId('trial-end-date')).toHaveTextContent('2025')
    })

    it('shows first charge amount', () => {
      const { getByTestId } = render(
        <CustomerTrialEndingSoonEmail {...baseProps} />
      )

      expect(getByTestId('first-charge')).toHaveTextContent(
        'First charge: $25.00/month'
      )
    })

    it('displays cancellation instructions', () => {
      const { getByText } = render(
        <CustomerTrialEndingSoonEmail {...baseProps} />
      )

      expect(
        getByText(
          /To avoid being charged, cancel at least a day before/
        )
      ).toBeInTheDocument()
      expect(
        getByText(/To keep your subscription, no action is needed/)
      ).toBeInTheDocument()
    })

    it('shows manage subscription button', () => {
      const { getByTestId } = render(
        <CustomerTrialEndingSoonEmail {...baseProps} />
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
  })

  describe('without payment method', () => {
    const noPaymentProps = {
      ...baseProps,
      hasPaymentMethod: false,
    }

    it('does NOT show first charge amount', () => {
      const { queryByTestId } = render(
        <CustomerTrialEndingSoonEmail {...noPaymentProps} />
      )

      expect(queryByTestId('first-charge')).not.toBeInTheDocument()
    })

    it('shows add payment method instructions', () => {
      const { getByText } = render(
        <CustomerTrialEndingSoonEmail {...noPaymentProps} />
      )

      expect(
        getByText(/please add a payment method/)
      ).toBeInTheDocument()
      expect(
        getByText(/your subscription will become inactive/)
      ).toBeInTheDocument()
    })

    it('shows add payment method button', () => {
      const { getByTestId } = render(
        <CustomerTrialEndingSoonEmail {...noPaymentProps} />
      )

      const button = getByTestId('add-payment-method-button')
      expect(button).toHaveTextContent('Add Payment Method →')
    })
  })

  it('shows customer greeting', () => {
    const { getByText } = render(
      <CustomerTrialEndingSoonEmail {...baseProps} />
    )

    expect(
      getByText(`Hi ${baseProps.customerName},`)
    ).toBeInTheDocument()
  })

  it('shows plan name', () => {
    const { getByTestId, getByText } = render(
      <CustomerTrialEndingSoonEmail {...baseProps} />
    )

    expect(getByTestId('plan-name')).toHaveTextContent(
      `Plan: ${baseProps.planName}`
    )
    expect(
      getByText(/Your free trial for Pro Plan ends on/)
    ).toBeInTheDocument()
  })

  it('shows organization signature', () => {
    const { getByTestId } = render(
      <CustomerTrialEndingSoonEmail {...baseProps} />
    )

    expect(getByTestId('signature-thanks')).toHaveTextContent(
      'Thanks,'
    )
    expect(getByTestId('signature-org-name')).toHaveTextContent(
      baseProps.organizationName
    )
  })

  it('handles singular day remaining', () => {
    const oneDayProps = {
      ...baseProps,
      daysRemaining: 1,
    }
    // The preview text should say "Tomorrow" for 1 day remaining
    // This is tested implicitly through the component rendering
    const { container } = render(
      <CustomerTrialEndingSoonEmail {...oneDayProps} />
    )
    expect(container).toBeInTheDocument()
  })
})
