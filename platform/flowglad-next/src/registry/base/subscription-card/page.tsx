'use client'

import { useState } from 'react'
import { SubscriptionCard } from './subscription-card'
import { Subscription, SubscriptionStatus } from './types'

const mockSubscriptions: Record<string, Subscription> = {
  active: {
    id: 'sub_1234567890',
    name: 'Pro Plan',
    status: 'active',
    currentPeriodStart: new Date('2024-01-01'),
    currentPeriodEnd: new Date('2024-02-01'),
    cancelAtPeriodEnd: false,
    items: [
      {
        id: 'si_1',
        priceId: 'price_1234',
        productId: 'prod_1234',
        productName: 'Pro Plan',
        quantity: 1,
        unitAmount: 2900,
        currency: 'USD',
        interval: 'month',
        intervalCount: 1,
      },
    ],
    currency: 'USD',
  },
  trialing: {
    id: 'sub_trial_123',
    name: 'Enterprise Plan',
    status: 'trialing',
    currentPeriodStart: new Date('2024-01-01'),
    currentPeriodEnd: new Date('2024-01-15'),
    cancelAtPeriodEnd: false,
    trialEnd: new Date('2024-01-15'),
    items: [
      {
        id: 'si_2',
        priceId: 'price_5678',
        productId: 'prod_5678',
        productName: 'Enterprise Plan',
        quantity: 5,
        unitAmount: 9900,
        currency: 'USD',
        interval: 'month',
        intervalCount: 1,
      },
    ],
    currency: 'USD',
  },
  pastDue: {
    id: 'sub_pastdue_456',
    name: 'Starter Plan',
    status: 'past_due',
    currentPeriodStart: new Date('2023-12-01'),
    currentPeriodEnd: new Date('2024-01-01'),
    cancelAtPeriodEnd: false,
    items: [
      {
        id: 'si_3',
        priceId: 'price_9999',
        productId: 'prod_9999',
        productName: 'Starter Plan',
        quantity: 1,
        unitAmount: 900,
        currency: 'USD',
        interval: 'month',
        intervalCount: 1,
      },
    ],
    currency: 'USD',
  },
  canceling: {
    id: 'sub_cancel_789',
    name: 'Team Plan',
    status: 'active',
    currentPeriodStart: new Date('2024-01-01'),
    currentPeriodEnd: new Date('2024-02-01'),
    cancelAtPeriodEnd: true,
    canceledAt: new Date('2024-01-10'),
    items: [
      {
        id: 'si_4',
        priceId: 'price_team',
        productId: 'prod_team',
        productName: 'Team Plan',
        quantity: 10,
        unitAmount: 1900,
        currency: 'USD',
        interval: 'month',
        intervalCount: 1,
      },
    ],
    currency: 'USD',
  },
  multiItem: {
    id: 'sub_multi_111',
    name: 'Custom Bundle',
    status: 'active',
    currentPeriodStart: new Date('2024-01-01'),
    currentPeriodEnd: new Date('2024-02-01'),
    cancelAtPeriodEnd: false,
    items: [
      {
        id: 'si_5',
        priceId: 'price_base',
        productId: 'prod_base',
        productName: 'Base Plan',
        quantity: 1,
        unitAmount: 4900,
        currency: 'USD',
        interval: 'month',
        intervalCount: 1,
      },
      {
        id: 'si_6',
        priceId: 'price_seats',
        productId: 'prod_seats',
        productName: 'Additional Seats',
        quantity: 5,
        unitAmount: 1000,
        currency: 'USD',
        interval: 'month',
        intervalCount: 1,
      },
      {
        id: 'si_7',
        priceId: 'price_storage',
        productId: 'prod_storage',
        productName: 'Extra Storage',
        quantity: 100,
        unitAmount: 10,
        currency: 'USD',
        interval: 'month',
        intervalCount: 1,
        usageType: 'metered',
      },
    ],
    currency: 'USD',
  },
}

export default function SubscriptionCardDemo() {
  const [loadingStates, setLoadingStates] = useState<
    Record<string, boolean>
  >({})

  const handleCancel = async (subscriptionId: string) => {
    // Demo: Canceling subscription
    setLoadingStates((prev) => ({ ...prev, [subscriptionId]: true }))

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000))

    setLoadingStates((prev) => ({ ...prev, [subscriptionId]: false }))
    // Demo: Subscription canceled successfully
  }

  const handleReactivate = async (subscriptionId: string) => {
    // Demo: Reactivating subscription
    setLoadingStates((prev) => ({ ...prev, [subscriptionId]: true }))

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000))

    setLoadingStates((prev) => ({ ...prev, [subscriptionId]: false }))
    // Demo: Subscription reactivated successfully
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">
            Subscription Card Component
          </h1>
          <p className="text-muted-foreground">
            A flexible subscription card component that displays
            subscription details, billing information, and actions.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Active Subscription */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">
              Active Subscription
            </h3>
            <SubscriptionCard
              subscription={mockSubscriptions.active}
              onCancel={handleCancel}
              loading={loadingStates[mockSubscriptions.active.id]}
            />
          </div>

          {/* Trial Subscription */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">
              Trial Subscription
            </h3>
            <SubscriptionCard
              subscription={mockSubscriptions.trialing}
              onCancel={handleCancel}
              loading={loadingStates[mockSubscriptions.trialing.id]}
            />
          </div>

          {/* Past Due Subscription */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">
              Past Due Subscription
            </h3>
            <SubscriptionCard
              subscription={mockSubscriptions.pastDue}
              loading={loadingStates[mockSubscriptions.pastDue.id]}
            />
          </div>

          {/* Canceling Subscription */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">
              Scheduled for Cancellation
            </h3>
            <SubscriptionCard
              subscription={mockSubscriptions.canceling}
              onReactivate={handleReactivate}
              loading={loadingStates[mockSubscriptions.canceling.id]}
            />
          </div>
        </div>

        {/* Multi-item Subscription (Full Width) */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">
            Multi-item Subscription
          </h3>
          <SubscriptionCard
            subscription={mockSubscriptions.multiItem}
            onCancel={handleCancel}
            loading={loadingStates[mockSubscriptions.multiItem.id]}
            className="max-w-2xl"
          />
        </div>

        {/* Loading State */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Loading State</h3>
          <SubscriptionCard
            subscription={mockSubscriptions.active}
            loading={true}
            className="max-w-md"
          />
        </div>

        {/* Minimal (No Actions) */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">
            Read-only (No Actions)
          </h3>
          <SubscriptionCard
            subscription={mockSubscriptions.active}
            className="max-w-md"
          />
        </div>
      </div>
    </div>
  )
}
