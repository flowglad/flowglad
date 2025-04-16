import { describe, it, expect } from 'vitest'
import { FlowgladServer } from '../FlowgladServer'
import { BaseFlowgladServerSessionParams } from '../types'

describe('FlowgladServer Integration Tests', () => {
  it('should initialize with default configuration', () => {
    const params: BaseFlowgladServerSessionParams = {
      getRequestingCustomer: async () => ({
        externalId: 'test-user',
        name: 'Test User',
        email: 'test@example.com',
      }),
      baseURL:
        process.env.FLOWGLAD_BASE_URL || 'http://localhost:3000',
      apiKey: process.env.FLOWGLAD_API_KEY || 'test-api-key',
    }

    const server = new FlowgladServer(params)
    expect(server).toBeDefined()
  })
})
