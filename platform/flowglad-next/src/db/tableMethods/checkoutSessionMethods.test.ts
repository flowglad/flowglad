import { describe, it, expect } from 'vitest'
import { CheckoutSessionStatus, CheckoutSessionType } from '@/types'
import {
  checkoutSessionIsInTerminalState,
  isCheckoutSessionSubscriptionCreating,
} from './checkoutSessionMethods'
import { CheckoutSession } from '../schema/checkoutSessions'

describe('checkoutSessionIsInTerminalState', () => {
  it('should return true for terminal statuses', () => {
    // Create stubs for terminal statuses
    const terminalStatuses = [
      CheckoutSessionStatus.Succeeded,
      CheckoutSessionStatus.Failed,
      CheckoutSessionStatus.Expired,
    ]

    // Test each terminal status
    terminalStatuses.forEach((status) => {
      const checkoutSession = {
        status,
        // Include minimal required properties for the stub
        id: 'test-id',
        type: CheckoutSessionType.Product,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as CheckoutSession.Record

      expect(checkoutSessionIsInTerminalState(checkoutSession)).toBe(
        true
      )
    })
  })

  it('should return false for non-terminal statuses', () => {
    // Create stubs for non-terminal statuses
    const nonTerminalStatuses = [
      CheckoutSessionStatus.Open,
      CheckoutSessionStatus.Pending,
    ]

    // Test each non-terminal status
    nonTerminalStatuses.forEach((status) => {
      const checkoutSession = {
        status,
        // Include minimal required properties for the stub
        id: 'test-id',
        type: CheckoutSessionType.Product,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as CheckoutSession.Record

      expect(checkoutSessionIsInTerminalState(checkoutSession)).toBe(
        false
      )
    })
  })
})

describe('isCheckoutSessionSubscriptionCreating', () => {
  it('should return true for subscription creating types', () => {
    // Create stubs for subscription creating types
    const subscriptionCreatingTypes = [
      CheckoutSessionType.Product,
      CheckoutSessionType.Purchase,
    ]

    // Test each subscription creating type
    subscriptionCreatingTypes.forEach((type) => {
      const checkoutSession = {
        type,
        // Include minimal required properties for the stub
        id: 'test-id',
        status: CheckoutSessionStatus.Open,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as CheckoutSession.Record

      expect(
        isCheckoutSessionSubscriptionCreating(checkoutSession)
      ).toBe(true)
    })
  })

  it('should return false for non-subscription creating types', () => {
    // Create stubs for non-subscription creating types
    const nonSubscriptionCreatingTypes = [
      CheckoutSessionType.AddPaymentMethod,
      CheckoutSessionType.Invoice,
    ]

    // Test each non-subscription creating type
    nonSubscriptionCreatingTypes.forEach((type) => {
      const checkoutSession = {
        type,
        // Include minimal required properties for the stub
        id: 'test-id',
        status: CheckoutSessionStatus.Open,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as CheckoutSession.Record

      expect(
        isCheckoutSessionSubscriptionCreating(checkoutSession)
      ).toBe(false)
    })
  })
})
