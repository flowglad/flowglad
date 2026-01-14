/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import core from '@/utils/core'
import { CustomerSubscriptionCancellationScheduledEmail } from './customer-subscription-cancellation-scheduled'

describe('CustomerSubscriptionCancellationScheduledEmail', () => {
  const baseProps = {
    customerName: 'John Doe',
    organizationName: 'Acme Corp',
    organizationLogoUrl: 'https://example.com/logo.png',
    organizationId: 'org_123',
    customerId: 'cus_456',
    subscriptionName: 'Pro Plan',
    scheduledCancellationDate: new Date('2025-02-01'),
    livemode: true,
  }

  it('renders email with key content', () => {
    const { getByText } = render(
      <CustomerSubscriptionCancellationScheduledEmail
        {...baseProps}
      />
    )

    expect(
      getByText(
        'Your request to cancel your subscription has been received and scheduled.'
      )
    ).toBeInTheDocument()
  })

  it('displays subscription name and scheduled cancellation date', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCancellationScheduledEmail
        {...baseProps}
      />
    )

    expect(getByTestId('subscription-name')).toHaveTextContent(
      'Subscription: Pro Plan'
    )
    expect(
      getByTestId('scheduled-cancellation-date')
    ).toHaveTextContent('Cancellation date:')
    expect(
      getByTestId('scheduled-cancellation-date').textContent
    ).toContain('2025')
  })

  it('shows message about subscription remaining active until cancellation date', () => {
    const { getByText } = render(
      <CustomerSubscriptionCancellationScheduledEmail
        {...baseProps}
      />
    )

    expect(
      getByText(/Your subscription will remain active until/)
    ).toBeInTheDocument()
    expect(
      getByText(
        /You will continue to have access to all features until that date/
      )
    ).toBeInTheDocument()
  })

  it('shows reassurance about no further charges after cancellation date', () => {
    const { getByText } = render(
      <CustomerSubscriptionCancellationScheduledEmail
        {...baseProps}
      />
    )

    expect(
      getByText(
        /There will be no further charges after the cancellation date/
      )
    ).toBeInTheDocument()
  })

  it('includes billing portal link with correct URL', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCancellationScheduledEmail
        {...baseProps}
      />
    )

    const button = getByTestId('view-billing-portal-button')
    const expectedUrl = core.customerBillingPortalURL({
      organizationId: baseProps.organizationId,
      customerId: baseProps.customerId,
    })

    expect(button).toHaveAttribute('href', expectedUrl)
    expect(button).toHaveTextContent('View Billing Portal →')
  })

  it('displays correct header with organization logo', () => {
    const { getByTestId, getByAltText } = render(
      <CustomerSubscriptionCancellationScheduledEmail
        {...baseProps}
      />
    )

    expect(getByTestId('email-title')).toHaveTextContent(
      'Cancellation Scheduled'
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
      <CustomerSubscriptionCancellationScheduledEmail
        {...propsWithoutLogo}
      />
    )

    expect(queryByAltText('Logo')).not.toBeInTheDocument()
  })

  it('displays customer greeting correctly', () => {
    const { getByText } = render(
      <CustomerSubscriptionCancellationScheduledEmail
        {...baseProps}
      />
    )

    expect(
      getByText(`Hi ${baseProps.customerName},`)
    ).toBeInTheDocument()
  })

  it('shows organization name in signature', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCancellationScheduledEmail
        {...baseProps}
      />
    )

    expect(getByTestId('signature-thanks')).toHaveTextContent(
      'Thanks,'
    )
    expect(getByTestId('signature-org-name')).toHaveTextContent(
      baseProps.organizationName
    )
  })

  it('includes message about billing portal access', () => {
    const { getByText } = render(
      <CustomerSubscriptionCancellationScheduledEmail
        {...baseProps}
      />
    )

    expect(
      getByText(
        /You can view your billing history and manage your subscription at any time through your billing portal/
      )
    ).toBeInTheDocument()
  })

  it('formats scheduled cancellation date correctly', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCancellationScheduledEmail
        {...baseProps}
      />
    )

    const dateElement = getByTestId('scheduled-cancellation-date')
    expect(dateElement.textContent).toContain('Cancellation date:')
    // Check that it contains the year at least
    expect(dateElement.textContent).toContain('2025')
  })

  it('handles different subscription names correctly', () => {
    const customProps = {
      ...baseProps,
      subscriptionName: 'Enterprise Plan',
    }
    const { getByTestId } = render(
      <CustomerSubscriptionCancellationScheduledEmail
        {...customProps}
      />
    )

    expect(getByTestId('subscription-name')).toHaveTextContent(
      'Subscription: Enterprise Plan'
    )
  })

  it('handles different customer names correctly', () => {
    const customProps = {
      ...baseProps,
      customerName: 'Jane Smith',
    }
    const { getByText } = render(
      <CustomerSubscriptionCancellationScheduledEmail
        {...customProps}
      />
    )

    expect(getByText('Hi Jane Smith,')).toBeInTheDocument()
  })

  it('handles different organization names correctly', () => {
    const customProps = {
      ...baseProps,
      organizationName: 'TechCorp Inc',
    }
    const { getByTestId } = render(
      <CustomerSubscriptionCancellationScheduledEmail
        {...customProps}
      />
    )

    expect(getByTestId('signature-org-name')).toHaveTextContent(
      'TechCorp Inc'
    )
  })
})
