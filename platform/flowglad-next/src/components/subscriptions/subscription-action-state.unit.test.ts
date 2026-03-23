import { describe, expect, it } from 'bun:test'
import { PriceType, SubscriptionStatus } from '@db-core/enums'
import { getSubscriptionActionState } from './subscription-action-state'

describe('getSubscriptionActionState', () => {
  const baseSubscription = {
    isFreePlan: false,
    scheduledAdjustmentAt: null,
    status: SubscriptionStatus.Active,
  }

  it('allows adjust and cancel for a standard active subscription', () => {
    const result = getSubscriptionActionState({
      subscription: baseSubscription,
      priceType: PriceType.Subscription,
    })

    expect(result.cannotAdjust).toBe(false)
    expect(result.cannotCancel).toBe(false)
    expect(result.adjustHelperText).toBeUndefined()
    expect(result.cancelHelperText).toBeUndefined()
  })

  it('disables adjust for usage-based subscriptions', () => {
    const result = getSubscriptionActionState({
      subscription: baseSubscription,
      priceType: PriceType.Usage,
    })

    expect(result.cannotAdjust).toBe(true)
    expect(result.adjustHelperText).toBe(
      'Usage-based subscriptions cannot be adjusted'
    )
  })

  it('disables both actions for free plans', () => {
    const result = getSubscriptionActionState({
      subscription: {
        ...baseSubscription,
        isFreePlan: true,
      },
      priceType: PriceType.Subscription,
    })

    expect(result.cannotAdjust).toBe(true)
    expect(result.cannotCancel).toBe(true)
    expect(result.adjustHelperText).toBe(
      'Free plans cannot be adjusted'
    )
    expect(result.cancelHelperText).toBe(
      'Default free plans cannot be canceled'
    )
  })

  it('disables adjust when a cancellation is already scheduled', () => {
    const result = getSubscriptionActionState({
      subscription: {
        ...baseSubscription,
        status: SubscriptionStatus.CancellationScheduled,
      },
      priceType: PriceType.Subscription,
    })

    expect(result.cannotAdjust).toBe(true)
    expect(result.adjustHelperText).toBe(
      'Cannot adjust while a cancellation is scheduled'
    )
  })

  it('disables adjust when another adjustment is pending', () => {
    const result = getSubscriptionActionState({
      subscription: {
        ...baseSubscription,
        scheduledAdjustmentAt: Date.now(),
      },
      priceType: PriceType.Subscription,
    })

    expect(result.cannotAdjust).toBe(true)
    expect(result.adjustHelperText).toBe(
      'A scheduled adjustment is already pending'
    )
  })
})
