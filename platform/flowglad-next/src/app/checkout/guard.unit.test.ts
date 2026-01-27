import { describe, expect, it } from 'bun:test'
import { PriceType, SubscriptionStatus } from '@/types'
import { shouldBlockCheckout } from './guard'

describe('shouldBlockCheckout', () => {
  const activePaid = {
    status: SubscriptionStatus.Active,
    isFreePlan: false,
  }
  const activeFree = {
    status: SubscriptionStatus.Active,
    isFreePlan: true,
  }
  const canceledPaid = {
    status: SubscriptionStatus.Canceled,
    isFreePlan: false,
  }

  it('blocks when active paid exists, price is subscription, multiples disallowed', () => {
    const result = shouldBlockCheckout({
      currentSubscriptions: [activePaid],
      priceType: PriceType.Subscription,
      allowMultipleSubscriptionsPerCustomer: false,
    })
    expect(result).toBe(true)
  })

  it('does not block when only free plan exists', () => {
    const result = shouldBlockCheckout({
      currentSubscriptions: [activeFree],
      priceType: PriceType.Subscription,
      allowMultipleSubscriptionsPerCustomer: false,
    })
    expect(result).toBe(false)
  })

  it('does not block for single payment price types', () => {
    const result = shouldBlockCheckout({
      currentSubscriptions: [activePaid],
      priceType: PriceType.SinglePayment,
      allowMultipleSubscriptionsPerCustomer: false,
    })
    expect(result).toBe(false)
  })

  it('does not block when multiples are allowed', () => {
    const result = shouldBlockCheckout({
      currentSubscriptions: [activePaid],
      priceType: PriceType.Subscription,
      allowMultipleSubscriptionsPerCustomer: true,
    })
    expect(result).toBe(false)
  })

  it('treats null allowMultipleSubscriptionsPerCustomer as disallowed', () => {
    const result = shouldBlockCheckout({
      currentSubscriptions: [activePaid],
      priceType: PriceType.Subscription,
      allowMultipleSubscriptionsPerCustomer: null,
    })
    expect(result).toBe(true)
  })

  it('ignores canceled paid subscriptions', () => {
    const result = shouldBlockCheckout({
      currentSubscriptions: [canceledPaid],
      priceType: PriceType.Subscription,
      allowMultipleSubscriptionsPerCustomer: false,
    })
    expect(result).toBe(false)
  })
})
