import { describe, it } from 'bun:test'

describe('useSubscription', () => {
  it.skip('returns currentSubscription', async () => {
    // Test stub: Verify hook returns currentSubscription from useSubscriptions
  })

  it.skip('cancel() calls cancel endpoint with subscription id', async () => {
    // Test stub: Verify cancel mutation calls CancelSubscription endpoint with correct params
  })

  it.skip('cancel() throws when no active subscription', async () => {
    // Test stub: Verify cancel throws error when currentSubscription is null
  })

  it.skip('uncancel() calls uncancel endpoint', async () => {
    // Test stub: Verify uncancel mutation calls UncancelSubscription endpoint
  })

  it.skip('adjust() calls adjust endpoint', async () => {
    // Test stub: Verify adjust mutation calls AdjustSubscription endpoint
  })

  it.skip('mutations invalidate all customer query keys', async () => {
    // Test stub: Verify mutations call invalidateCustomerData helper
  })

  it.skip('uses billingMocks in dev mode', async () => {
    // Test stub: Verify hook uses billingMocks when __devMode is true
  })
})
