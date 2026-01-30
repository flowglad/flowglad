/**
 * @vitest-environment jsdom
 */
import { describe, it } from 'vitest'

describe('useSubscriptions', () => {
  it.skip('returns subscriptions after successful fetch', async () => {
    // Test stub: Verify hook returns subscriptions array after API call succeeds
  })

  it.skip('returns currentSubscriptions and currentSubscription', async () => {
    // Test stub: Verify hook returns both currentSubscriptions array and currentSubscription object
  })

  it.skip('returns error on API error', async () => {
    // Test stub: Verify error handling when API responds with error (e.g., auth failure)
  })

  it.skip('uses billingMocks in dev mode', async () => {
    // Test stub: Verify hook uses billingMocks when __devMode is true
  })

  it.skip('passes includeHistorical param', async () => {
    // Test stub: Verify includeHistorical parameter is passed to API endpoint
  })
})
