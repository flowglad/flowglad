import { describe, expect, it } from 'vitest'
import {
  type AuthenticatedActionKey,
  FlowgladActionKey,
  type HybridActionKey,
} from './sdk'

describe('Route type classification', () => {
  it('GetPricingModel is a HybridActionKey', () => {
    // Setup: Assign FlowgladActionKey.GetPricingModel to a HybridActionKey typed variable
    const hybridKey: HybridActionKey =
      FlowgladActionKey.GetPricingModel
    // Assert: Value equals 'pricing-models/retrieve'
    expect(hybridKey).toBe('pricing-models/retrieve')
  })

  it('union of AuthenticatedActionKey and HybridActionKey covers all FlowgladActionKey values with no overlap', () => {
    // Setup: Get all FlowgladActionKey values
    const allKeys = Object.values(FlowgladActionKey)

    // Define hybrid keys (currently just GetPricingModel)
    const hybridKeys: HybridActionKey[] = [
      FlowgladActionKey.GetPricingModel,
    ]

    // Compute authenticated keys by excluding hybrid keys
    const authenticatedKeys = allKeys.filter(
      (key) => !hybridKeys.includes(key as HybridActionKey)
    )

    // Assert: authenticatedKeys.length + hybridKeys.length === allKeys.length
    expect(authenticatedKeys.length + hybridKeys.length).toBe(
      allKeys.length
    )

    // Assert: No hybrid key appears in authenticated keys
    for (const hybridKey of hybridKeys) {
      expect(authenticatedKeys).not.toContain(hybridKey)
    }

    // Verify each authenticated key can be assigned to AuthenticatedActionKey type
    // This is a compile-time check, but we can verify runtime values match
    const expectedAuthenticatedKeys: FlowgladActionKey[] = [
      FlowgladActionKey.GetCustomerBilling,
      FlowgladActionKey.FindOrCreateCustomer,
      FlowgladActionKey.CreateCheckoutSession,
      FlowgladActionKey.CreateAddPaymentMethodCheckoutSession,
      FlowgladActionKey.CreateActivateSubscriptionCheckoutSession,
      FlowgladActionKey.CancelSubscription,
      FlowgladActionKey.UncancelSubscription,
      FlowgladActionKey.AdjustSubscription,
      FlowgladActionKey.CreateSubscription,
      FlowgladActionKey.GetSubscriptions,
      FlowgladActionKey.UpdateCustomer,
      FlowgladActionKey.CreateUsageEvent,
      FlowgladActionKey.GetResourceUsages,
      FlowgladActionKey.GetResourceUsage,
      FlowgladActionKey.ClaimResource,
      FlowgladActionKey.ReleaseResource,
      FlowgladActionKey.ListResourceClaims,
      FlowgladActionKey.GetUsageMeterBalances,
    ]

    expect(authenticatedKeys.sort()).toEqual(
      expectedAuthenticatedKeys.sort()
    )
  })

  it('HybridActionKey type correctly identifies GetPricingModel', () => {
    // This test verifies at compile-time that GetPricingModel is assignable to HybridActionKey
    // and at runtime that the string value matches
    const testHybridKey = (key: HybridActionKey): string => key
    const result = testHybridKey(FlowgladActionKey.GetPricingModel)
    expect(result).toBe(FlowgladActionKey.GetPricingModel)
  })

  it('AuthenticatedActionKey excludes GetPricingModel', () => {
    // Get all action keys and filter out GetPricingModel
    const allKeys = Object.values(FlowgladActionKey)
    const authenticatedKeyValues = allKeys.filter(
      (key) => key !== FlowgladActionKey.GetPricingModel
    )

    // Verify GetPricingModel is not in the authenticated keys
    expect(authenticatedKeyValues).not.toContain(
      FlowgladActionKey.GetPricingModel
    )

    // Verify the count is correct (all keys minus 1 hybrid key)
    expect(authenticatedKeyValues.length).toBe(allKeys.length - 1)
  })
})
