import { describe, it, expect } from 'vitest'
import { FlowgladServer } from './FlowgladServer'
import { BaseFlowgladServerSessionParams } from './types'

describe('FlowgladServer Billing Integration Tests', () => {
  it('should initialize with default configuration', async () => {
    const params: BaseFlowgladServerSessionParams = {
      getRequestingCustomer: async () => ({
        externalId: 'test-user',
        name: 'Test User',
        email: 'test@example.com',
      }),
      baseURL:
        process.env.FLOWGLAD_BASE_URL || 'http://localhost:3000',
      apiKey: process.env.FLOWGLAD_SECRET_KEY,
    }

    const server = new FlowgladServer(params)
    expect(server).toBeDefined()
    const billing = await server.getBilling()
    expect(billing).toBeDefined()
    expect(billing.customer.externalId).toBe('test-user')

    // Note: billingPortalUrl is added at the platform layer, not available in the server package
    // These tests document the expected API contract even though this package doesn't provide the field
    // @ts-expect-error - billingPortalUrl is not available in BillingWithChecks but will be in platform response
    expect(billing.billingPortalUrl).toBeUndefined()
    // The platform layer would add these properties:
    // expect(billing.billingPortalUrl).toBeDefined()
    // expect(typeof billing.billingPortalUrl).toBe('string')
    // expect(() => new URL(billing.billingPortalUrl)).not.toThrow()
    // expect(billing.billingPortalUrl).toContain('/billing-portal/')
    // expect(billing.billingPortalUrl).toMatch(/^https?:\/\//)
  })
})
