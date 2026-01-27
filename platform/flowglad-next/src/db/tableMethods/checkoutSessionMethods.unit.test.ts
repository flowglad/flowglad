import { describe, expect, it } from 'bun:test'
import { CheckoutSessionStatus, CheckoutSessionType } from '@/types'
import type { CheckoutSession } from '../schema/checkoutSessions'
import {
  checkoutSessionIsInTerminalState,
  isCheckoutSessionSubscriptionCreating,
} from './checkoutSessionMethods'

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
        createdAt: Date.now(),
        updatedAt: Date.now(),
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
        createdAt: Date.now(),
        updatedAt: Date.now(),
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
        createdAt: Date.now(),
        updatedAt: Date.now(),
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
    ]

    // Test each non-subscription creating type
    nonSubscriptionCreatingTypes.forEach((type) => {
      const checkoutSession = {
        type,
        // Include minimal required properties for the stub
        id: 'test-id',
        status: CheckoutSessionStatus.Open,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as CheckoutSession.Record

      expect(
        isCheckoutSessionSubscriptionCreating(checkoutSession)
      ).toBe(false)
    })
  })
})
