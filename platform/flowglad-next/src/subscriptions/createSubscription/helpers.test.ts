import { describe, expect, it } from 'vitest'
import { SubscriptionStatus } from '@/types'
import { deriveSubscriptionStatus } from './helpers'

describe('deriveSubscriptionStatus', () => {
  it('should return "trialing" if a trialEnd date is provided', () => {
    const status = deriveSubscriptionStatus({
      trialEnd: new Date(),
      autoStart: true,
      defaultPaymentMethodId: 'pm_123',
      isDefaultPlan: false,
    })
    expect(status).toBe(SubscriptionStatus.Trialing)
  })

  it('should return "active" if autoStart is true and a payment method is available', () => {
    const status = deriveSubscriptionStatus({
      autoStart: true,
      defaultPaymentMethodId: 'pm_123',
      isDefaultPlan: false,
    })
    expect(status).toBe(SubscriptionStatus.Active)
  })

  it('should return "incomplete" if autoStart is true but no payment method is available', () => {
    const status = deriveSubscriptionStatus({
      autoStart: true,
      isDefaultPlan: false,
    })
    expect(status).toBe(SubscriptionStatus.Incomplete)
  })

  it('should return "active" if doNotCharge is true even without payment method', () => {
    const status = deriveSubscriptionStatus({
      autoStart: true,
      isDefaultPlan: false,
      doNotCharge: true,
    })
    expect(status).toBe(SubscriptionStatus.Active)
  })

  it('should return "active" if doNotCharge is true with payment method', () => {
    const status = deriveSubscriptionStatus({
      autoStart: true,
      defaultPaymentMethodId: 'pm_123',
      isDefaultPlan: false,
      doNotCharge: true,
    })
    expect(status).toBe(SubscriptionStatus.Active)
  })

  it('should return "incomplete" if doNotCharge is true but autoStart is false', () => {
    const status = deriveSubscriptionStatus({
      autoStart: false,
      isDefaultPlan: false,
      doNotCharge: true,
    })
    expect(status).toBe(SubscriptionStatus.Incomplete)
  })

  it('should return "incomplete" if autoStart is false, regardless of payment method', () => {
    let status = deriveSubscriptionStatus({
      autoStart: false,
      defaultPaymentMethodId: 'pm_123',
      isDefaultPlan: false,
    })
    expect(status).toBe(SubscriptionStatus.Incomplete)

    status = deriveSubscriptionStatus({
      autoStart: false,
      isDefaultPlan: false,
    })
    expect(status).toBe(SubscriptionStatus.Incomplete)
  })

  it('should prioritize "trialing" over "active" when doNotCharge is false', () => {
    const status = deriveSubscriptionStatus({
      trialEnd: new Date(),
      autoStart: true,
      defaultPaymentMethodId: 'pm_123',
      isDefaultPlan: false,
      doNotCharge: false,
    })
    expect(status).toBe(SubscriptionStatus.Trialing)
  })

  it('should prioritize "trialing" over "incomplete"', () => {
    const status = deriveSubscriptionStatus({
      trialEnd: new Date(),
      autoStart: false,
      isDefaultPlan: false,
    })
    expect(status).toBe(SubscriptionStatus.Trialing)
  })

  it('should return "incomplete" if only autoStart is false', () => {
    const status = deriveSubscriptionStatus({
      autoStart: false,
      isDefaultPlan: false,
    })
    expect(status).toBe(SubscriptionStatus.Incomplete)
  })

  it('should prioritize doNotCharge over trialing - if doNotCharge is true, return Active even with trialEnd', () => {
    const status = deriveSubscriptionStatus({
      autoStart: true,
      trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      isDefaultPlan: false,
      doNotCharge: true,
    })
    // If doNotCharge is true, the subscription is already free, so a trial doesn't make sense
    expect(status).toBe(SubscriptionStatus.Active)
  })

  it('should return trialing when trialEnd is set and doNotCharge is false', () => {
    const status = deriveSubscriptionStatus({
      autoStart: true,
      trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isDefaultPlan: false,
      doNotCharge: false,
    })
    expect(status).toBe(SubscriptionStatus.Trialing)
  })
})
