import { describe, expect, it } from 'bun:test'
import { SubscriptionStatus } from '@/types'
import { determineSubscriptionNotifications } from './helpers'

/**
 * Tests for the determineSubscriptionNotifications helper function.
 *
 * These tests verify the notification decision logic without mocks,
 * testing the pure function directly with different input combinations.
 */
describe('determineSubscriptionNotifications', () => {
  describe('Free Subscription Notification Behavior', () => {
    it('should NOT send any notifications when creating a free subscription (unitPrice = 0)', () => {
      const decision = determineSubscriptionNotifications({
        priceUnitPrice: 0,
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: false,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(decision.sendOrganizationNotification).toBe(false)
      expect(decision.sendCustomerNotification).toBe(false)
      expect(decision.customerNotificationType).toBeNull()
    })

    it('should NOT send notifications for free subscription even with payment method', () => {
      const decision = determineSubscriptionNotifications({
        priceUnitPrice: 0,
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(decision.sendOrganizationNotification).toBe(false)
      expect(decision.sendCustomerNotification).toBe(false)
      expect(decision.customerNotificationType).toBeNull()
    })

    it('should NOT send notifications for free subscription regardless of status', () => {
      // Test with Trialing status
      const trialingDecision = determineSubscriptionNotifications({
        priceUnitPrice: 0,
        subscriptionStatus: SubscriptionStatus.Trialing,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(trialingDecision.sendOrganizationNotification).toBe(
        false
      )
      expect(trialingDecision.sendCustomerNotification).toBe(false)

      // Test with Incomplete status
      const incompleteDecision = determineSubscriptionNotifications({
        priceUnitPrice: 0,
        subscriptionStatus: SubscriptionStatus.Incomplete,
        hasDefaultPaymentMethod: false,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(incompleteDecision.sendOrganizationNotification).toBe(
        false
      )
      expect(incompleteDecision.sendCustomerNotification).toBe(false)
    })
  })

  describe('Paid Subscription Notification Behavior', () => {
    it('should send both notifications when creating a paid subscription (unitPrice > 0)', () => {
      const decision = determineSubscriptionNotifications({
        priceUnitPrice: 5000, // $50
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(decision.sendOrganizationNotification).toBe(true)
      expect(decision.sendCustomerNotification).toBe(true)
      expect(decision.customerNotificationType).toBe('created')
    })

    it('should send customer notification for non-trial paid subscription without payment method', () => {
      const decision = determineSubscriptionNotifications({
        priceUnitPrice: 5000,
        subscriptionStatus: SubscriptionStatus.Incomplete,
        hasDefaultPaymentMethod: false,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      // Organization notification always sent for paid subscriptions
      expect(decision.sendOrganizationNotification).toBe(true)
      // Customer notification sent for non-trial (even without payment method)
      expect(decision.sendCustomerNotification).toBe(true)
      expect(decision.customerNotificationType).toBe('created')
    })
  })

  describe('Trial Subscription Notification Behavior', () => {
    it('should send customer notification when creating a trial subscription WITH payment method', () => {
      const decision = determineSubscriptionNotifications({
        priceUnitPrice: 5000, // $50
        subscriptionStatus: SubscriptionStatus.Trialing,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(decision.sendOrganizationNotification).toBe(true)
      expect(decision.sendCustomerNotification).toBe(true)
      expect(decision.customerNotificationType).toBe('created')
    })

    it('should send customer notification when trial has backup payment method only', () => {
      const decision = determineSubscriptionNotifications({
        priceUnitPrice: 5000,
        subscriptionStatus: SubscriptionStatus.Trialing,
        hasDefaultPaymentMethod: false,
        hasBackupPaymentMethod: true,
        canceledFreeSubscription: false,
      })

      expect(decision.sendOrganizationNotification).toBe(true)
      expect(decision.sendCustomerNotification).toBe(true)
      expect(decision.customerNotificationType).toBe('created')
    })

    it('should NOT send customer notification when creating a trial subscription WITHOUT payment method', () => {
      const decision = determineSubscriptionNotifications({
        priceUnitPrice: 5000, // $50
        subscriptionStatus: SubscriptionStatus.Trialing,
        hasDefaultPaymentMethod: false,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      // Organization notification SHOULD still be sent (internal awareness)
      expect(decision.sendOrganizationNotification).toBe(true)
      // Customer notification should NOT be sent (trial without payment = no billing commitment)
      expect(decision.sendCustomerNotification).toBe(false)
      expect(decision.customerNotificationType).toBeNull()
    })
  })

  describe('Upgrade from Free Subscription Notification Behavior', () => {
    it('should send upgrade notification when upgrading from free to paid', () => {
      const decision = determineSubscriptionNotifications({
        priceUnitPrice: 5000,
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: true,
      })

      expect(decision.sendOrganizationNotification).toBe(true)
      expect(decision.sendCustomerNotification).toBe(true)
      expect(decision.customerNotificationType).toBe('upgraded')
    })

    it('should send upgrade notification for trial upgrade with payment method', () => {
      const decision = determineSubscriptionNotifications({
        priceUnitPrice: 5000,
        subscriptionStatus: SubscriptionStatus.Trialing,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: true,
      })

      expect(decision.sendOrganizationNotification).toBe(true)
      expect(decision.sendCustomerNotification).toBe(true)
      expect(decision.customerNotificationType).toBe('upgraded')
    })

    it('should NOT send customer notification for trial upgrade without payment method', () => {
      const decision = determineSubscriptionNotifications({
        priceUnitPrice: 5000,
        subscriptionStatus: SubscriptionStatus.Trialing,
        hasDefaultPaymentMethod: false,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: true,
      })

      expect(decision.sendOrganizationNotification).toBe(true)
      // Even though it's an upgrade, no customer notification for trial without payment
      expect(decision.sendCustomerNotification).toBe(false)
      expect(decision.customerNotificationType).toBeNull()
    })
  })

  describe('Edge Cases', () => {
    it('should handle small paid amounts (e.g., $0.01)', () => {
      const decision = determineSubscriptionNotifications({
        priceUnitPrice: 1, // $0.01
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(decision.sendOrganizationNotification).toBe(true)
      expect(decision.sendCustomerNotification).toBe(true)
      expect(decision.customerNotificationType).toBe('created')
    })

    it('should handle very large prices', () => {
      const decision = determineSubscriptionNotifications({
        priceUnitPrice: 999999999, // Large amount
        subscriptionStatus: SubscriptionStatus.Active,
        hasDefaultPaymentMethod: true,
        hasBackupPaymentMethod: false,
        canceledFreeSubscription: false,
      })

      expect(decision.sendOrganizationNotification).toBe(true)
      expect(decision.sendCustomerNotification).toBe(true)
      expect(decision.customerNotificationType).toBe('created')
    })
  })
})
