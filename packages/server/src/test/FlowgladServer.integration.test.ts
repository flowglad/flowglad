import { describe, it, expect } from 'vitest'
import { FlowgladServer } from '../FlowgladServer'
import { BaseFlowgladServerSessionParams } from '../types'

describe('FlowgladServer Integration Tests', () => {
  it('should initialize with default configuration', async () => {
    const params: BaseFlowgladServerSessionParams = {
      getRequestingCustomer: async () => ({
        externalId: 'test-user',
        name: 'Test User',
        email: 'test@example.com',
      }),
      baseURL:
        process.env.FLOWGLAD_BASE_URL || 'http://localhost:3000',
    }

    const server = new FlowgladServer(params)
    expect(server).toBeDefined()
    const billing = await server.getBilling()
    expect(billing).toBeDefined()
    expect(billing.customer.externalId).toBe('test-user')
  })
})
