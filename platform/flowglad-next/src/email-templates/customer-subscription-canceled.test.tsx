import { describe, expect, it } from 'bun:test'
import { render } from '@testing-library/react'
import core from '@/utils/core'
import { CustomerSubscriptionCanceledEmail } from './customer-subscription-canceled'

describe('CustomerSubscriptionCanceledEmail', () => {
  const baseProps = {
    customerName: 'John Doe',
    organizationName: 'Acme Corp',
    organizationLogoUrl: 'https://example.com/logo.png',
    organizationId: 'org_123',
    customerId: 'cus_456',
    subscriptionName: 'Pro Plan',
    cancellationDate: new Date('2025-02-01'),
    livemode: true,
  }

  it('renders email with key content', () => {
    const { getByText } = render(
      <CustomerSubscriptionCanceledEmail {...baseProps} />
    )

    expect(
      getByText(
        'Your subscription has been canceled and is no longer active.'
      )
    ).toBeInTheDocument()
  })

  it('displays subscription name and cancellation date', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCanceledEmail {...baseProps} />
    )

    expect(getByTestId('subscription-name')).toHaveTextContent(
      'Subscription: Pro Plan'
    )
    expect(getByTestId('cancellation-date')).toHaveTextContent(
      'Cancellation date:'
    )
    expect(getByTestId('cancellation-date').textContent).toContain(
      '2025'
    )
  })

  it('shows reassurance about no further charges', () => {
    const { getByText } = render(
      <CustomerSubscriptionCanceledEmail {...baseProps} />
    )

    expect(
      getByText(
        'There will be no further charges on your account for this subscription.'
      )
    ).toBeInTheDocument()
  })

  it('includes billing portal link with correct URL', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCanceledEmail {...baseProps} />
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
      <CustomerSubscriptionCanceledEmail {...baseProps} />
    )

    expect(getByTestId('email-title')).toHaveTextContent(
      'Subscription Canceled'
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
      <CustomerSubscriptionCanceledEmail {...propsWithoutLogo} />
    )

    expect(queryByAltText('Logo')).not.toBeInTheDocument()
  })

  it('displays customer greeting correctly', () => {
    const { getByText } = render(
      <CustomerSubscriptionCanceledEmail {...baseProps} />
    )

    expect(
      getByText(`Hi ${baseProps.customerName},`)
    ).toBeInTheDocument()
  })

  it('shows organization name in signature', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCanceledEmail {...baseProps} />
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
      <CustomerSubscriptionCanceledEmail {...baseProps} />
    )

    expect(
      getByText(
        'You can view your billing history at any time through your billing portal.'
      )
    ).toBeInTheDocument()
  })

  it('formats cancellation date correctly', () => {
    const { getByTestId } = render(
      <CustomerSubscriptionCanceledEmail {...baseProps} />
    )

    const dateElement = getByTestId('cancellation-date')
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
      <CustomerSubscriptionCanceledEmail {...customProps} />
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
      <CustomerSubscriptionCanceledEmail {...customProps} />
    )

    expect(getByText('Hi Jane Smith,')).toBeInTheDocument()
  })

  it('handles different organization names correctly', () => {
    const customProps = {
      ...baseProps,
      organizationName: 'TechCorp Inc',
    }
    const { getByTestId } = render(
      <CustomerSubscriptionCanceledEmail {...customProps} />
    )

    expect(getByTestId('signature-org-name')).toHaveTextContent(
      'TechCorp Inc'
    )
  })
})
