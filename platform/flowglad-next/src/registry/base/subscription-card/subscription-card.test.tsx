/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SubscriptionCard } from './subscription-card'
import type { Subscription } from './types'

describe('SubscriptionCard - Cancellation Button Conditional Logic', () => {
  const baseSubscription: Subscription = {
    id: 'sub_123',
    name: 'Test Subscription',
    status: 'active',
    cancelAtPeriodEnd: false,
    currency: 'usd',
    items: [],
  }

  describe('Default plan subscription - button should be hidden', () => {
    it('should not render cancellation button when onCancel is undefined', () => {
      render(
        <SubscriptionCard
          subscription={baseSubscription}
          onCancel={undefined}
        />
      )

      // SubscriptionActions should not be rendered when onCancel is undefined
      expect(
        screen.queryByText('Cancel Subscription')
      ).not.toBeInTheDocument()
    })
  })

  describe('Non-default plan subscription - button should be shown', () => {
    it('should render cancellation button when onCancel is provided', () => {
      render(
        <SubscriptionCard
          subscription={baseSubscription}
          onCancel={async () => {}}
        />
      )

      // SubscriptionActions should be rendered when onCancel is provided
      expect(
        screen.getByText('Cancel Subscription')
      ).toBeInTheDocument()
    })
  })

  describe('Canceled subscription - button should be hidden', () => {
    it('should not render cancellation button when subscription is canceled, even if onCancel is provided', () => {
      const canceledSubscription = {
        ...baseSubscription,
        status: 'canceled' as const,
      }

      render(
        <SubscriptionCard
          subscription={canceledSubscription}
          onCancel={async () => {}}
        />
      )

      // SubscriptionActions should not be rendered for canceled subscriptions
      // even when onCancel is provided, because canCancel checks status
      expect(
        screen.queryByText('Cancel Subscription')
      ).not.toBeInTheDocument()
    })
  })
})
