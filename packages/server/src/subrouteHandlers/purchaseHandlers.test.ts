import { describe, it } from 'bun:test'

describe('getPurchases handler', () => {
  it.skip('returns 405 for GET request', () => {
    // Setup: Create mock FlowgladServer
    // Action: Call handler with GET method
    // Expectation: Returns { status: 405, error: 'Method not allowed' }
  })

  it.skip('returns purchases via FlowgladServer', () => {
    // Setup: Create mock FlowgladServer with getPurchases returning purchases
    // Action: Call handler with POST method
    // Expectation: Returns { status: 200, data: { purchases: [...] } }
  })

  it.skip('respects limit param', () => {
    // Setup: Create mock FlowgladServer with getPurchases
    // Action: Call handler with { limit: 2 }
    // Expectation: FlowgladServer.getPurchases called with { limit: 2 }
  })

  it.skip('returns empty array when no purchases', () => {
    // Setup: Create mock FlowgladServer with getPurchases returning []
    // Action: Call handler with POST method
    // Expectation: Returns { status: 200, data: { purchases: [] } }
  })

  it.skip('returns 500 with parsed error on failure', () => {
    // Setup: Create mock FlowgladServer with getPurchases throwing error
    // Action: Call handler
    // Expectation: Returns { status: 500, error: parsed error message }
  })
})
