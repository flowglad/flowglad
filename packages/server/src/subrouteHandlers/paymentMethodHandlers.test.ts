import { describe, it } from 'bun:test'

describe('getPaymentMethods handler', () => {
  it.skip('returns 405 for GET request', () => {
    // Setup: Create mock FlowgladServer
    // Action: Call handler with GET method
    // Assert: Response has status 405
  })

  it.skip('returns 405 for PUT request', () => {
    // Setup: Create mock FlowgladServer
    // Action: Call handler with PUT method
    // Assert: Response has status 405
  })

  it.skip('returns payment methods via FlowgladServer', () => {
    // Setup: Create mock FlowgladServer with getPaymentMethods returning mock data
    // Action: Call handler with POST method
    // Assert: Response contains paymentMethods array
  })

  it.skip('returns billingPortalUrl', () => {
    // Setup: Create mock FlowgladServer with getPaymentMethods returning billingPortalUrl
    // Action: Call handler with POST method
    // Assert: Response contains billingPortalUrl
  })

  it.skip('returns empty array when no payment methods', () => {
    // Setup: Create mock FlowgladServer with getPaymentMethods returning empty array
    // Action: Call handler with POST method
    // Assert: Response contains empty paymentMethods array
  })

  it.skip('returns 500 with parsed error on failure', () => {
    // Setup: Create mock FlowgladServer with getPaymentMethods that throws
    // Action: Call handler with POST method
    // Assert: Response has status 500 and error message
  })
})
