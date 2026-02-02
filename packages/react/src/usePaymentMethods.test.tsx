/**
 * @vitest-environment jsdom
 */

import { describe, it } from 'vitest'

describe('usePaymentMethods', () => {
  it.skip('returns payment methods after successful fetch', () => {
    // Setup: Mock API client to return payment methods
    // Action: Render hook
    // Assert: paymentMethods contains expected data
  })

  it.skip('returns billingPortalUrl after successful fetch', () => {
    // Setup: Mock API client to return billingPortalUrl
    // Action: Render hook
    // Assert: billingPortalUrl matches expected value
  })

  it.skip('returns error on API error', () => {
    // Setup: Mock API client to throw error
    // Action: Render hook
    // Assert: error is set
  })

  it.skip('uses billingMocks in dev mode', () => {
    // Setup: Configure devMode=true with billingMocks
    // Action: Render hook
    // Assert: Returns billingMocks data without API call
  })

  it.skip('returns empty array when billingMocks.paymentMethods missing', () => {
    // Setup: Configure devMode=true with empty billingMocks
    // Action: Render hook
    // Assert: paymentMethods is empty array
  })

  it.skip('returns error on HTTP failure (non-2xx status)', () => {
    // Setup: Mock API client to return non-2xx response
    // Action: Render hook
    // Assert: error is set for HTTP failure
  })

  it.skip('uses betterAuthBasePath route when configured', () => {
    // Setup: Configure betterAuthBasePath in context
    // Action: Render hook
    // Assert: API call uses betterAuthBasePath route
  })
})

describe('subscription mutations', () => {
  it.skip('invalidate payment methods query key', () => {
    // Setup: Pre-populate query cache with payment methods
    // Action: Trigger subscription mutation
    // Assert: Payment methods query is invalidated
  })
})
