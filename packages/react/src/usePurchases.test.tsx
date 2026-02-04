/**
 * @vitest-environment jsdom
 */
import { describe, it } from 'bun:test'

describe('usePurchases', () => {
  it.skip('returns purchases after successful fetch', () => {
    // Setup: Mock API client to return purchases
    // Action: Render hook, wait for data
    // Expectation: purchases array is returned, isLoading is false
  })

  it.skip('returns error on API error', () => {
    // Setup: Mock API client to throw error
    // Action: Render hook, wait for error
    // Expectation: error is set, purchases is undefined
  })

  it.skip('returns error on HTTP failure (non-2xx status)', () => {
    // Setup: Mock fetch to return 500 status
    // Action: Render hook, wait for error
    // Expectation: error is set with HTTP status info
  })

  it.skip('uses billingMocks in dev mode', () => {
    // Setup: Render with devMode=true and billingMocks.purchases
    // Action: Render hook
    // Expectation: Returns mocked purchases without API call
  })

  it.skip('uses betterAuthBasePath route when configured', () => {
    // Setup: Render with betterAuthBasePath configured
    // Action: Render hook
    // Expectation: API call uses betterAuthBasePath route
  })

  it.skip('hasPurchased returns true when product purchased', () => {
    // Setup: Mock API to return purchase with product slug 'pro'
    // Action: Render hook, call hasPurchased('pro')
    // Expectation: Returns true
  })

  it.skip('hasPurchased returns false when product not purchased', () => {
    // Setup: Mock API to return purchases without 'pro' slug
    // Action: Render hook, call hasPurchased('pro')
    // Expectation: Returns false
  })

  it.skip('hasPurchased returns false when purchases not loaded', () => {
    // Setup: Render hook before data loads
    // Action: Call hasPurchased('pro') immediately
    // Expectation: Returns false
  })
})

describe('subscription mutations', () => {
  it.skip('invalidate invoices and purchases query keys', () => {
    // Setup: Mock queryClient
    // Action: Trigger subscription mutation
    // Expectation: Both INVOICES_QUERY_KEY and PURCHASES_QUERY_KEY invalidated
  })
})
