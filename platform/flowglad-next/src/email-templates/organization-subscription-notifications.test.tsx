import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  OrganizationSubscriptionCancellationScheduledNotificationEmail,
  OrganizationSubscriptionCanceledNotificationEmail,
} from './organization-subscription-notifications'

describe('OrganizationSubscriptionCancellationScheduledNotificationEmail', () => {
  const baseProps = {
    organizationName: 'Acme Corp',
    subscriptionName: 'Pro Plan',
    customerId: 'cus_456',
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
    scheduledCancellationDate: new Date('2025-02-01'),
    livemode: true,
  }

  it('renders email with key content indicating scheduled cancellation', () => {
    const { getByText } = render(
      <OrganizationSubscriptionCancellationScheduledNotificationEmail
        {...baseProps}
      />
    )

    expect(
      getByText(
        /A customer has scheduled a cancellation for their subscription to your/
      )
    ).toBeInTheDocument()
  })

  it('displays correct title for scheduled cancellation', () => {
    const { getByText } = render(
      <OrganizationSubscriptionCancellationScheduledNotificationEmail
        {...baseProps}
      />
    )

    expect(
      getByText('Subscription Cancellation Scheduled')
    ).toBeInTheDocument()
  })

  it('displays customer details correctly', () => {
    const { getByText } = render(
      <OrganizationSubscriptionCancellationScheduledNotificationEmail
        {...baseProps}
      />
    )

    expect(getByText('John Doe')).toBeInTheDocument()
    expect(getByText('john@example.com')).toBeInTheDocument()
  })

  it('displays subscription name', () => {
    const { getByText } = render(
      <OrganizationSubscriptionCancellationScheduledNotificationEmail
        {...baseProps}
      />
    )

    expect(getByText('Pro Plan')).toBeInTheDocument()
  })

  it('displays scheduled cancellation date', () => {
    const { getByText } = render(
      <OrganizationSubscriptionCancellationScheduledNotificationEmail
        {...baseProps}
      />
    )

    // Check for the date in the rendered output
    const dateString =
      baseProps.scheduledCancellationDate.toLocaleDateString()
    expect(getByText(dateString)).toBeInTheDocument()
  })

  it('shows status as active until cancellation date', () => {
    const { getByText } = render(
      <OrganizationSubscriptionCancellationScheduledNotificationEmail
        {...baseProps}
      />
    )

    expect(getByText('Status')).toBeInTheDocument()
    expect(getByText('Active until cancellation date')).toBeInTheDocument()
  })

  it('includes message about subscription remaining active', () => {
    const { getByText } = render(
      <OrganizationSubscriptionCancellationScheduledNotificationEmail
        {...baseProps}
      />
    )

    expect(
      getByText(
        /The subscription will remain active until the scheduled cancellation date/
      )
    ).toBeInTheDocument()
  })

  it('includes customer profile link', () => {
    const { container } = render(
      <OrganizationSubscriptionCancellationScheduledNotificationEmail
        {...baseProps}
      />
    )

    const link = container.querySelector(
      `a[href="https://app.flowglad.com/customers/${baseProps.customerId}"]`
    )
    expect(link).toBeInTheDocument()
    expect(link?.textContent).toContain('View Customer Profile')
  })

  it('handles different customer names correctly', () => {
    const customProps = {
      ...baseProps,
      customerName: 'Jane Smith',
    }
    const { getByText } = render(
      <OrganizationSubscriptionCancellationScheduledNotificationEmail
        {...customProps}
      />
    )

    expect(getByText('Jane Smith')).toBeInTheDocument()
  })

  it('handles different subscription names correctly', () => {
    const customProps = {
      ...baseProps,
      subscriptionName: 'Enterprise Plan',
    }
    const { getByText } = render(
      <OrganizationSubscriptionCancellationScheduledNotificationEmail
        {...customProps}
      />
    )

    expect(getByText('Enterprise Plan')).toBeInTheDocument()
  })

  it('formats scheduled cancellation date correctly', () => {
    const { getByText } = render(
      <OrganizationSubscriptionCancellationScheduledNotificationEmail
        {...baseProps}
      />
    )

    expect(getByText('Scheduled Cancellation Date')).toBeInTheDocument()
    // The date should be formatted using toLocaleDateString
    const dateString =
      baseProps.scheduledCancellationDate.toLocaleDateString()
    expect(getByText(dateString)).toBeInTheDocument()
  })
})

describe('OrganizationSubscriptionCanceledNotificationEmail', () => {
  const baseProps = {
    organizationName: 'Acme Corp',
    subscriptionName: 'Pro Plan',
    customerId: 'cus_456',
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
    cancellationDate: new Date('2025-01-15'),
    livemode: true,
  }

  it('renders email with key content indicating actual cancellation', () => {
    const { getByText } = render(
      <OrganizationSubscriptionCanceledNotificationEmail
        {...baseProps}
      />
    )

    expect(
      getByText(
        /A customer has canceled their subscription to your/
      )
    ).toBeInTheDocument()
  })

  it('displays correct title for actual cancellation', () => {
    const { getByText } = render(
      <OrganizationSubscriptionCanceledNotificationEmail
        {...baseProps}
      />
    )

    expect(
      getByText('Subscription Cancellation Alert')
    ).toBeInTheDocument()
  })

  it('displays customer details correctly', () => {
    const { getByText } = render(
      <OrganizationSubscriptionCanceledNotificationEmail
        {...baseProps}
      />
    )

    expect(getByText('John Doe')).toBeInTheDocument()
    expect(getByText('john@example.com')).toBeInTheDocument()
  })

  it('displays subscription name', () => {
    const { getByText } = render(
      <OrganizationSubscriptionCanceledNotificationEmail
        {...baseProps}
      />
    )

    expect(getByText('Pro Plan')).toBeInTheDocument()
  })

  it('displays cancellation date', () => {
    const { getByText } = render(
      <OrganizationSubscriptionCanceledNotificationEmail
        {...baseProps}
      />
    )

    // Check for the date in the rendered output
    const dateString = baseProps.cancellationDate.toLocaleDateString()
    expect(getByText(dateString)).toBeInTheDocument()
  })

  it('includes customer profile link', () => {
    const { container } = render(
      <OrganizationSubscriptionCanceledNotificationEmail
        {...baseProps}
      />
    )

    const link = container.querySelector(
      `a[href="https://app.flowglad.com/customers/${baseProps.customerId}"]`
    )
    expect(link).toBeInTheDocument()
    expect(link?.textContent).toContain('View Customer Profile')
  })

  it('handles different customer names correctly', () => {
    const customProps = {
      ...baseProps,
      customerName: 'Jane Smith',
    }
    const { getByText } = render(
      <OrganizationSubscriptionCanceledNotificationEmail
        {...customProps}
      />
    )

    expect(getByText('Jane Smith')).toBeInTheDocument()
  })

  it('handles different subscription names correctly', () => {
    const customProps = {
      ...baseProps,
      subscriptionName: 'Enterprise Plan',
    }
    const { getByText } = render(
      <OrganizationSubscriptionCanceledNotificationEmail
        {...customProps}
      />
    )

    expect(getByText('Enterprise Plan')).toBeInTheDocument()
  })
})
