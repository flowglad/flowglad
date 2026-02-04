/**
 * @vitest-environment jsdom
 */
import { describe, it } from 'bun:test'

describe('useInvoices', () => {
  it.skip('returns invoices after successful fetch', () => {
    // Setup: Mock API client to return invoices
    // Action: Render hook, wait for data
    // Expectation: invoices array is returned, isLoading is false
  })

  it.skip('returns error on API error', () => {
    // Setup: Mock API client to throw error
    // Action: Render hook, wait for error
    // Expectation: error is set, invoices is undefined
  })

  it.skip('returns error on HTTP failure (non-2xx status)', () => {
    // Setup: Mock fetch to return 500 status
    // Action: Render hook, wait for error
    // Expectation: error is set with HTTP status info
  })

  it.skip('uses billingMocks in dev mode', () => {
    // Setup: Render with devMode=true and billingMocks.invoices
    // Action: Render hook
    // Expectation: Returns mocked invoices without API call
  })

  it.skip('passes limit param', () => {
    // Setup: Mock API client
    // Action: Render hook with { limit: 5 }
    // Expectation: API called with limit param
  })

  it.skip('uses betterAuthBasePath route when configured', () => {
    // Setup: Render with betterAuthBasePath configured
    // Action: Render hook
    // Expectation: API call uses betterAuthBasePath route
  })
})
