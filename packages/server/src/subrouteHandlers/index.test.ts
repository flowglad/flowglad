import { FlowgladActionKey } from '@flowglad/shared'
import { describe, expect, it } from 'vitest'
import {
  hybridRouteToHandlerMap,
  isHybridActionKey,
  routeToHandlerMap,
} from './index'

describe('isHybridActionKey', () => {
  it('returns true for GetPricingModel which is defined as a hybrid route', () => {
    const result = isHybridActionKey(
      FlowgladActionKey.GetPricingModel
    )

    expect(result).toBe(true)
  })

  it('returns false for authenticated-only routes like GetCustomerBilling', () => {
    const result = isHybridActionKey(
      FlowgladActionKey.GetCustomerBilling
    )

    expect(result).toBe(false)
  })

  it('returns false for other authenticated-only routes', () => {
    const authenticatedRoutes = [
      FlowgladActionKey.FindOrCreateCustomer,
      FlowgladActionKey.CreateCheckoutSession,
      FlowgladActionKey.CancelSubscription,
      FlowgladActionKey.UncancelSubscription,
      FlowgladActionKey.AdjustSubscription,
      FlowgladActionKey.CreateUsageEvent,
      FlowgladActionKey.GetResourceUsages,
      FlowgladActionKey.ClaimResource,
      FlowgladActionKey.ReleaseResource,
      FlowgladActionKey.ListResourceClaims,
    ] as const

    for (const route of authenticatedRoutes) {
      expect(isHybridActionKey(route)).toBe(false)
    }
  })

  it('correctly narrows the type to HybridActionKey when true', () => {
    const key: FlowgladActionKey = FlowgladActionKey.GetPricingModel

    if (isHybridActionKey(key)) {
      // TypeScript should narrow `key` to HybridActionKey here
      // We verify by checking it exists in hybridRouteToHandlerMap
      expect(key in hybridRouteToHandlerMap).toBe(true)
    }
  })
})

describe('routeToHandlerMap', () => {
  it('contains all authenticated action keys but not hybrid routes', () => {
    // Verify GetPricingModel is NOT in routeToHandlerMap
    expect(
      FlowgladActionKey.GetPricingModel in routeToHandlerMap
    ).toBe(false)

    // Verify other routes ARE in routeToHandlerMap
    expect(
      FlowgladActionKey.GetCustomerBilling in routeToHandlerMap
    ).toBe(true)
    expect(
      FlowgladActionKey.FindOrCreateCustomer in routeToHandlerMap
    ).toBe(true)
    expect(
      FlowgladActionKey.CancelSubscription in routeToHandlerMap
    ).toBe(true)
  })
})

describe('hybridRouteToHandlerMap', () => {
  it('contains GetPricingModel handler', () => {
    expect(
      FlowgladActionKey.GetPricingModel in hybridRouteToHandlerMap
    ).toBe(true)
    expect(
      hybridRouteToHandlerMap[FlowgladActionKey.GetPricingModel]
    ).toBeTypeOf('function')
  })

  it('does not contain authenticated-only routes', () => {
    expect(
      FlowgladActionKey.GetCustomerBilling in hybridRouteToHandlerMap
    ).toBe(false)
  })
})
