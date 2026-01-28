import { describe, expect, it } from 'bun:test'
import { render } from '@testing-library/react'
import {
  OrganizationSubscriptionCanceledNotificationEmail,
  OrganizationSubscriptionCancellationScheduledNotificationEmail,
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
    expect(
      getByText('Active until cancellation date')
    ).toBeInTheDocument()
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
    const { getByRole } = render(
      <OrganizationSubscriptionCancellationScheduledNotificationEmail
        {...baseProps}
      />
    )

    // IMPORTANT: Use getByRole instead of container.querySelector() to prevent CI/CD failures.
    // querySelector() can return null if the element isn't found, and toBeInTheDocument() requires
    // an HTMLElement. In CI/CD environments, timing differences or how @react-email/components
    // renders can cause querySelector to return null even when the element exists, leading to
    // "received value must be an HTMLElement or an SVGElement" errors. getByRole() properly
    // waits for the element, throws helpful errors if not found, and returns an HTMLElement
    // that works correctly with toBeInTheDocument().
    const link = getByRole('link', { name: /View Customer Profile/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute(
      'href',
      `https://app.flowglad.com/customers/${baseProps.customerId}`
    )
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

    expect(
      getByText('Scheduled Cancellation Date')
    ).toBeInTheDocument()
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
      getByText(/A customer has canceled their subscription to your/)
    ).toBeInTheDocument()
  })

  it('displays correct title for actual cancellation', () => {
    const { getByText } = render(
      <OrganizationSubscriptionCanceledNotificationEmail
        {...baseProps}
      />
    )

    expect(
      getByText('A Subscription was Canceled')
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
    const { getByRole } = render(
      <OrganizationSubscriptionCanceledNotificationEmail
        {...baseProps}
      />
    )

    // IMPORTANT: Use getByRole instead of container.querySelector() to prevent CI/CD failures.
    // querySelector() can return null if the element isn't found, and toBeInTheDocument() requires
    // an HTMLElement. In CI/CD environments, timing differences or how @react-email/components
    // renders can cause querySelector to return null even when the element exists, leading to
    // "received value must be an HTMLElement or an SVGElement" errors. getByRole() properly
    // waits for the element, throws helpful errors if not found, and returns an HTMLElement
    // that works correctly with toBeInTheDocument().
    const link = getByRole('link', { name: /View Customer Profile/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute(
      'href',
      `https://app.flowglad.com/customers/${baseProps.customerId}`
    )
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
