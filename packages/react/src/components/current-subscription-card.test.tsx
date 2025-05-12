import { render, screen } from '@testing-library/react'
import {
  StandardCurrentSubscriptionCard,
  UsageCurrentSubscriptionCard,
} from './current-subscription-card'
import { format } from 'date-fns'
import { CurrencyCode } from '@flowglad/types'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { SubscriptionCardSubscriptionItem } from '../types'

// Mock the CancelSubscriptionModal component
vi.mock('./cancel-subscription-modal', () => ({
  CancelSubscriptionModal: ({
    subscription,
    cancelSubscription,
  }: {
    subscription: any
    cancelSubscription: (subscription: any) => void
  }) => (
    <button
      data-testid="cancel-subscription-modal"
      onClick={() => cancelSubscription(subscription)}
    >
      Cancel Subscription
    </button>
  ),
}))

// Mock the PriceLabel component
vi.mock('./currency-label', () => ({
  PriceLabel: ({
    price,
  }: {
    price: {
      currency: string
      unitPrice: number
      intervalCount: number
      intervalUnit: string
    }
  }) => (
    <div data-testid="price-label">
      {price.currency} {price.unitPrice} / {price.intervalCount}{' '}
      {price.intervalUnit}
    </div>
  ),
}))

describe('StandardCurrentSubscriptionCard', () => {
  const defaultProps = {
    subscription: {
      id: 'sub_123',
      cancelScheduledAt: null,
      trialEnd: null,
      status: 'active' as const,
      currentBillingPeriodEnd: '2023-12-31',
      interval: 'month' as const,
      intervalCount: 1,
      canceledAt: null,
    },
    product: {
      name: 'Pro Plan',
      pluralQuantityLabel: 'Users',
    },
    currency: 'USD' as CurrencyCode,
    subscriptionItems: [
      {
        id: 'item_123',
        quantity: 5,
        unitPrice: 10,
        price: {
          id: 'price_123',
          type: 'subscription',
        },
      } as SubscriptionCardSubscriptionItem,
    ],
    isPastDue: false,
    showTrialEnd: false,
    shouldShowBillingPeriodEnd: true,
    onCancel: vi.fn(),
  }

  it('renders the product name and badge', () => {
    render(<StandardCurrentSubscriptionCard {...defaultProps} />)
    expect(screen.getByText('Pro Plan')).toBeInTheDocument()
    expect(screen.getByText('Current Plan')).toBeInTheDocument()
  })

  it('displays the quantity when pluralQuantityLabel is provided', () => {
    render(<StandardCurrentSubscriptionCard {...defaultProps} />)
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('does not display quantity section when pluralQuantityLabel is not provided', () => {
    const propsWithoutQuantity = {
      ...defaultProps,
      product: { name: 'Pro Plan' },
    }
    render(
      // @ts-expect-error - plural quantity label is required - but we need to be resilient to its
      // absence
      <StandardCurrentSubscriptionCard {...propsWithoutQuantity} />
    )
    expect(screen.queryByText('Users')).not.toBeInTheDocument()
  })

  it('displays the price label with correct information', () => {
    render(<StandardCurrentSubscriptionCard {...defaultProps} />)
    const priceLabel = screen.getByTestId('price-label')
    expect(priceLabel).toHaveTextContent('USD 10 / 1 month')
  })

  it('shows cancellation date when subscription is scheduled to cancel', () => {
    const cancelDate = '2023-11-15'
    const propsWithCancellation = {
      ...defaultProps,
      subscription: {
        ...defaultProps.subscription,
        cancelScheduledAt: cancelDate,
      },
    }
    render(
      <StandardCurrentSubscriptionCard {...propsWithCancellation} />
    )
    expect(
      screen.getByText(
        `Cancels on ${format(new Date(cancelDate), 'MMM d, yyyy')}`
      )
    ).toBeInTheDocument()
  })

  it('shows trial end date when showTrialEnd is true', () => {
    const trialEndDate = '2023-11-30'
    const propsWithTrial = {
      ...defaultProps,
      subscription: {
        ...defaultProps.subscription,
        trialEnd: trialEndDate,
      },
      showTrialEnd: true,
    }
    render(<StandardCurrentSubscriptionCard {...propsWithTrial} />)
    expect(
      screen.getByText(
        `Trial ends on ${format(new Date(trialEndDate), 'MMM d, yyyy')}`
      )
    ).toBeInTheDocument()
  })

  it('shows past due message when isPastDue is true', () => {
    const propsWithPastDue = {
      ...defaultProps,
      isPastDue: true,
    }
    render(<StandardCurrentSubscriptionCard {...propsWithPastDue} />)
    expect(screen.getByText('Payment Past Due')).toBeInTheDocument()
  })

  it('shows renewal date when shouldShowBillingPeriodEnd is true and not canceled', () => {
    render(<StandardCurrentSubscriptionCard {...defaultProps} />)
    expect(
      screen.getByText(
        `Renews on ${format(new Date(defaultProps.subscription.currentBillingPeriodEnd), 'MMM d, yyyy')}`
      )
    ).toBeInTheDocument()
  })

  it('does not show renewal date when subscription is canceled', () => {
    const cancelDate = '2023-11-15'
    const propsWithCancellation = {
      ...defaultProps,
      subscription: {
        ...defaultProps.subscription,
        cancelScheduledAt: cancelDate,
      },
    }
    render(
      <StandardCurrentSubscriptionCard {...propsWithCancellation} />
    )
    expect(
      screen.queryByText(
        `Renews on ${format(new Date(defaultProps.subscription.currentBillingPeriodEnd), 'MMM d, yyyy')}`
      )
    ).not.toBeInTheDocument()
  })

  it('does not show renewal date when shouldShowBillingPeriodEnd is false', () => {
    const propsWithoutRenewal = {
      ...defaultProps,
      shouldShowBillingPeriodEnd: false,
    }
    render(
      <StandardCurrentSubscriptionCard {...propsWithoutRenewal} />
    )
    expect(
      screen.queryByText(
        `Renews on ${format(new Date(defaultProps.subscription.currentBillingPeriodEnd), 'MMM d, yyyy')}`
      )
    ).not.toBeInTheDocument()
  })

  it('shows cancel subscription modal when not canceled', () => {
    render(<StandardCurrentSubscriptionCard {...defaultProps} />)
    expect(
      screen.getByTestId('cancel-subscription-modal')
    ).toBeInTheDocument()
  })

  it('does not show cancel subscription modal when already canceled', () => {
    const cancelDate = '2023-11-15'
    const propsWithCancellation = {
      ...defaultProps,
      subscription: {
        ...defaultProps.subscription,
        cancelScheduledAt: cancelDate,
      },
    }
    render(
      <StandardCurrentSubscriptionCard {...propsWithCancellation} />
    )
    expect(
      screen.queryByTestId('cancel-subscription-modal')
    ).not.toBeInTheDocument()
  })

  it('calls onCancel when cancel button is clicked', () => {
    render(<StandardCurrentSubscriptionCard {...defaultProps} />)
    const cancelButton = screen.getByTestId(
      'cancel-subscription-modal'
    )
    cancelButton.click()
    expect(defaultProps.onCancel).toHaveBeenCalledWith(
      defaultProps.subscription
    )
  })
})

describe('UsageCurrentSubscriptionCard', () => {
  const defaultProps = {
    currency: 'USD' as CurrencyCode,
    subscription: {
      id: 'sub_123',
      cancelScheduledAt: null,
      trialEnd: null,
      status: 'active' as const,
      currentBillingPeriodEnd: '2023-12-31',
      interval: 'month' as const,
      intervalCount: 1,
      canceledAt: null,
    },
    product: {
      name: 'Usage Plan',
      pluralQuantityLabel: 'API Calls',
    },
    subscriptionItems: [
      {
        id: 'item_123',
        quantity: 1000,
        unitPrice: 0.01,
        price: {
          id: 'price_123',
          type: 'usage',
        },
      } as SubscriptionCardSubscriptionItem,
    ],
    isPastDue: false,
    showTrialEnd: false,
    shouldShowBillingPeriodEnd: true,
    onCancel: vi.fn(),
  }

  it('renders the product name and badge', () => {
    render(<UsageCurrentSubscriptionCard {...defaultProps} />)
    expect(screen.getByText('Usage Plan')).toBeInTheDocument()
    expect(screen.getByText('Current Plan')).toBeInTheDocument()
  })

  it('displays the quantity when pluralQuantityLabel is provided', () => {
    render(<UsageCurrentSubscriptionCard {...defaultProps} />)
    expect(screen.getByText('API Calls')).toBeInTheDocument()
    expect(screen.getByText('1000')).toBeInTheDocument()
  })

  it('does not display quantity section when pluralQuantityLabel is not provided', () => {
    const propsWithoutQuantity = {
      ...defaultProps,
      product: { name: 'Usage Plan' },
    }
    // @ts-expect-error - plural quantity label is required - but we need to be resilient to its
    // absence
    render(<UsageCurrentSubscriptionCard {...propsWithoutQuantity} />)
    expect(screen.queryByText('API Calls')).not.toBeInTheDocument()
  })

  it('displays "Pay as you go, billed monthly" text', () => {
    render(<UsageCurrentSubscriptionCard {...defaultProps} />)
    expect(
      screen.getByText('Pay as you go, billed monthly')
    ).toBeInTheDocument()
  })

  it('shows cancellation date when subscription is scheduled to cancel', () => {
    const cancelDate = '2023-11-15'
    const propsWithCancellation = {
      ...defaultProps,
      subscription: {
        ...defaultProps.subscription,
        cancelScheduledAt: cancelDate,
      },
    }
    render(
      <UsageCurrentSubscriptionCard {...propsWithCancellation} />
    )
    expect(
      screen.getByText(
        `Cancels on ${format(new Date(cancelDate), 'MMM d, yyyy')}`
      )
    ).toBeInTheDocument()
  })

  it('shows trial end date when showTrialEnd is true', () => {
    const trialEndDate = '2023-11-30'
    const propsWithTrial = {
      ...defaultProps,
      subscription: {
        ...defaultProps.subscription,
        trialEnd: trialEndDate,
      },
      showTrialEnd: true,
    }
    render(<UsageCurrentSubscriptionCard {...propsWithTrial} />)
    expect(
      screen.getByText(
        `Trial ends on ${format(new Date(trialEndDate), 'MMM d, yyyy')}`
      )
    ).toBeInTheDocument()
  })

  it('shows past due message when isPastDue is true', () => {
    const propsWithPastDue = {
      ...defaultProps,
      isPastDue: true,
    }
    render(<UsageCurrentSubscriptionCard {...propsWithPastDue} />)
    expect(screen.getByText('Payment Past Due')).toBeInTheDocument()
  })

  it('shows renewal date when shouldShowBillingPeriodEnd is true and not canceled', () => {
    render(<UsageCurrentSubscriptionCard {...defaultProps} />)
    expect(
      screen.getByText(
        `Renews on ${format(new Date(defaultProps.subscription.currentBillingPeriodEnd), 'MMM d, yyyy')}`
      )
    ).toBeInTheDocument()
  })

  it('does not show renewal date when subscription is canceled', () => {
    const cancelDate = '2023-11-15'
    const propsWithCancellation = {
      ...defaultProps,
      subscription: {
        ...defaultProps.subscription,
        cancelScheduledAt: cancelDate,
      },
    }
    render(
      <UsageCurrentSubscriptionCard {...propsWithCancellation} />
    )
    expect(
      screen.queryByText(
        `Renews on ${format(new Date(defaultProps.subscription.currentBillingPeriodEnd), 'MMM d, yyyy')}`
      )
    ).not.toBeInTheDocument()
  })

  it('does not show renewal date when shouldShowBillingPeriodEnd is false', () => {
    const propsWithoutRenewal = {
      ...defaultProps,
      shouldShowBillingPeriodEnd: false,
    }
    render(<UsageCurrentSubscriptionCard {...propsWithoutRenewal} />)
    expect(
      screen.queryByText(
        `Renews on ${format(new Date(defaultProps.subscription.currentBillingPeriodEnd), 'MMM d, yyyy')}`
      )
    ).not.toBeInTheDocument()
  })

  it('shows cancel subscription modal when not canceled', () => {
    render(<UsageCurrentSubscriptionCard {...defaultProps} />)
    expect(
      screen.getByTestId('cancel-subscription-modal')
    ).toBeInTheDocument()
  })

  it('does not show cancel subscription modal when already canceled', () => {
    const cancelDate = '2023-11-15'
    const propsWithCancellation = {
      ...defaultProps,
      subscription: {
        ...defaultProps.subscription,
        cancelScheduledAt: cancelDate,
      },
    }
    render(
      <UsageCurrentSubscriptionCard {...propsWithCancellation} />
    )
    expect(
      screen.queryByTestId('cancel-subscription-modal')
    ).not.toBeInTheDocument()
  })

  it('calls onCancel when cancel button is clicked', () => {
    render(<UsageCurrentSubscriptionCard {...defaultProps} />)
    const cancelButton = screen.getByTestId(
      'cancel-subscription-modal'
    )
    cancelButton.click()
    expect(defaultProps.onCancel).toHaveBeenCalledWith(
      defaultProps.subscription
    )
  })
})
