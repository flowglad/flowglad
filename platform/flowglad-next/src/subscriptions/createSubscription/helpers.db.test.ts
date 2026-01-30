import { describe, expect, it } from 'bun:test'
import { SubscriptionStatus } from '@db-core/enums'
import {
  deriveSubscriptionStatus,
  determineSubscriptionNotifications,
} from './helpers'

describe('determineSubscriptionNotifications', () => {
  describe('free subscriptions (unitPrice === 0)', () => {
    it('should return no notifications for free subscription', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 0,
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(result).toEqual({
        sendOrganizationNotification: false,
        sendCustomerNotification: false,
        customerNotificationType: null,
      })
    })

    it('should return no notifications for free subscription regardless of payment methods', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 0,
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: false,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(result).toEqual({
        sendOrganizationNotification: false,
        sendCustomerNotification: false,
        customerNotificationType: null,
      })
    })

    it('should return no notifications for free subscription even when trialing', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 0,
        subscriptionStatus: SubscriptionStatus.Trialing,
        hasDefaultPaymentMethod: false,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(result).toEqual({
        sendOrganizationNotification: false,
        sendCustomerNotification: false,
        customerNotificationType: null,
      })
    })
  })

  describe('paid subscriptions - active status', () => {
    it('should send created notification for new paid subscription with default payment method', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 1000,
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: true,
        customerNotificationType: 'created',
      })
    })

    it('should send created notification for new paid subscription with backup payment method', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 1000,
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: false,
        hasBackupPaymentMethod: true,
        canceledFreeSubscription: false,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: true,
        customerNotificationType: 'created',
      })
    })

    it('should send created notification for new paid subscription with both payment methods', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 2500,
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: true,
        canceledFreeSubscription: false,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: true,
        customerNotificationType: 'created',
      })
    })

    it('should send created notification for active subscription without payment method', () => {
      // This case may occur for specific business scenarios
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 500,
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: false,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: true,
        customerNotificationType: 'created',
      })
    })
  })

  describe('paid subscriptions - upgrade from free', () => {
    it('should send upgrade notification when canceling free subscription', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 1000,
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: true,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: true,
        customerNotificationType: 'upgraded',
      })
    })

    it('should send upgrade notification when upgrading from free with backup payment method', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 2000,
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: false,
        hasBackupPaymentMethod: true,
        canceledFreeSubscription: true,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: true,
        customerNotificationType: 'upgraded',
      })
    })
  })

  describe('paid subscriptions - trialing status', () => {
    it('should not send customer notification for trial without any payment method', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 1000,
        subscriptionStatus: SubscriptionStatus.Trialing,
        hasDefaultPaymentMethod: false,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: false,
        customerNotificationType: null,
      })
    })

    it('should send created notification for trial with default payment method', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 1000,
        subscriptionStatus: SubscriptionStatus.Trialing,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: true,
        customerNotificationType: 'created',
      })
    })

    it('should send created notification for trial with backup payment method', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 1500,
        subscriptionStatus: SubscriptionStatus.Trialing,
        hasDefaultPaymentMethod: false,
        hasBackupPaymentMethod: true,
        canceledFreeSubscription: false,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: true,
        customerNotificationType: 'created',
      })
    })

    it('should send created notification for trial with both payment methods', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 1000,
        subscriptionStatus: SubscriptionStatus.Trialing,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: true,
        canceledFreeSubscription: false,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: true,
        customerNotificationType: 'created',
      })
    })

    it('should send upgrade notification for trial with payment method when upgrading from free', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 1000,
        subscriptionStatus: SubscriptionStatus.Trialing,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: true,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: true,
        customerNotificationType: 'upgraded',
      })
    })

    it('should not send customer notification for trial upgrade without payment method', () => {
      // Even if upgrading from free, if no payment method exists, no customer notification
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 1000,
        subscriptionStatus: SubscriptionStatus.Trialing,
        hasDefaultPaymentMethod: false,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: true,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: false,
        customerNotificationType: null,
      })
    })
  })

  describe('paid subscriptions - incomplete status', () => {
    it('should send created notification for incomplete subscription with payment method', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 1000,
        subscriptionStatus: SubscriptionStatus.Incomplete,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: true,
        customerNotificationType: 'created',
      })
    })

    it('should send created notification for incomplete subscription without payment method', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 1000,
        subscriptionStatus: SubscriptionStatus.Incomplete,
        hasDefaultPaymentMethod: false,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: true,
        customerNotificationType: 'created',
      })
    })
  })

  describe('edge cases', () => {
    it('should handle very small non-zero price', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 1, // 1 cent
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: true,
        customerNotificationType: 'created',
      })
    })

    it('should handle very large price', () => {
      const result = determineSubscriptionNotifications({
        priceUnitPrice: 100000000, // $1,000,000
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(result).toEqual({
        sendOrganizationNotification: true,
        sendCustomerNotification: true,
        customerNotificationType: 'created',
      })
    })
  })
})

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
