import { describe, it } from 'bun:test'

describe('getInvoices handler', () => {
  it.skip('returns 405 for GET request', () => {
    // Setup: Create mock FlowgladServer
    // Action: Call handler with GET method
    // Expectation: Returns { status: 405, error: 'Method not allowed' }
  })

  it.skip('returns invoices via FlowgladServer', () => {
    // Setup: Create mock FlowgladServer with getInvoices returning invoices
    // Action: Call handler with POST method
    // Expectation: Returns { status: 200, data: { invoices: [...] } }
  })

  it.skip('respects limit param', () => {
    // Setup: Create mock FlowgladServer with getInvoices
    // Action: Call handler with { limit: 2 }
    // Expectation: FlowgladServer.getInvoices called with { limit: 2 }
  })

  it.skip('returns empty array when no invoices', () => {
    // Setup: Create mock FlowgladServer with getInvoices returning []
    // Action: Call handler with POST method
    // Expectation: Returns { status: 200, data: { invoices: [] } }
  })

  it.skip('returns 500 with parsed error on failure', () => {
    // Setup: Create mock FlowgladServer with getInvoices throwing error
    // Action: Call handler
    // Expectation: Returns { status: 500, error: parsed error message }
  })
})
