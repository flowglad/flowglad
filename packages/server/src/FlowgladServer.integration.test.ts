import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestFlowgladServer, retry } from './test/helpers'

describe('FlowgladServer Integration Tests', () => {
  const flowgladServer = createTestFlowgladServer()

  describe('getRequestingcustomerId', () => {
    it('should return the customer ID', async () => {
      const customerId =
        await flowgladServer.getRequestingcustomerId()
      expect(customerId).toBe('test-user-id')
    })
  })

  describe('getSession', () => {
    it('should return the customer session', async () => {
      const session = await flowgladServer.getSession()
      expect(session).toEqual({
        externalId: 'test-user-id',
        name: 'Test User',
        email: 'test@example.com',
      })
    })
  })

  describe('findOrCreateCustomer', () => {
    it('should find or create a customer', async () => {
      // This test might fail if the customer already exists
      // We use retry to handle potential race conditions
      const customer = await retry(async () => {
        return await flowgladServer.findOrCreateCustomer()
      })

      expect(customer).toBeDefined()
      expect(customer.externalId).toBe('test-user-id')
    })
  })

  describe('getCustomer', () => {
    it('should get a customer', async () => {
      const result = await flowgladServer.getCustomer()
      expect(result.customer).toBeDefined()
      expect(result.customer.externalId).toBe('test-user-id')
    })
  })

  describe('getBilling', () => {
    it('should get customer billing information', async () => {
      const billing = await flowgladServer.getBilling()
      expect(billing).toBeDefined()
      // Add more specific assertions based on the expected billing structure
    })
  })

  describe('getCatalog', () => {
    it('should get the catalog', async () => {
      const catalog = await flowgladServer.getCatalog()
      expect(catalog).toBeDefined()
      expect(catalog.catalog).toBeDefined()
      // Add more specific assertions based on the expected catalog structure
    })
  })
})
