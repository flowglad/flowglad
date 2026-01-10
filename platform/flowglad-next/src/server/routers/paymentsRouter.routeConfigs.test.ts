import { describe, expect, it } from 'vitest'
import {
  paymentsRouteConfigs,
  refundPaymentRouteConfig,
} from './paymentsRouter'
import {
  findRouteConfigInArray,
  findRouteConfigInObject,
  getAllRouteKeysFromArray,
  getAllRouteKeysFromObject,
  validateRouteConfigStructure,
  validateStandardCrudMappings,
} from './routeConfigs.test-utils'

describe('paymentsRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(paymentsRouteConfigs, routeKey)
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(paymentsRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /payments to payments.create procedure', () => {
      const routeConfig = findRouteConfig('POST /payments')

      expect(routeConfig).toMatchObject({
        procedure: 'payments.create',
      })
      expect(routeConfig!.procedure).toBe('payments.create')
      expect(routeConfig!.pattern.test('payments')).toBe(true)

      // Test mapParams with body
      const testBody = { payment: { amount: 1000 } }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /payments/:id to payments.update procedure', () => {
      const routeConfig = findRouteConfig('PUT /payments/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'payments.update',
      })
      expect(routeConfig!.procedure).toBe('payments.update')
      expect(routeConfig!.pattern.test('payments/test-id')).toBe(true)

      // Test mapParams with matches and body (simulate route handler slicing)
      const testBody = { payment: { status: 'completed' } }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /payments/:id to payments.get procedure', () => {
      const routeConfig = findRouteConfig('GET /payments/:id')

      expect(routeConfig).toMatchObject({ procedure: 'payments.get' })
      expect(routeConfig!.procedure).toBe('payments.get')
      expect(routeConfig!.pattern.test('payments/test-id')).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /payments to payments.list procedure', () => {
      const routeConfig = findRouteConfig('GET /payments')

      expect(routeConfig).toMatchObject({
        procedure: 'payments.list',
      })
      expect(routeConfig!.procedure).toBe('payments.list')
      expect(routeConfig!.pattern.test('payments')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should map DELETE /payments/:id to payments.delete procedure', () => {
      const routeConfig = findRouteConfig('DELETE /payments/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'payments.delete',
      })
      expect(routeConfig!.procedure).toBe('payments.delete')
      expect(routeConfig!.pattern.test('payments/test-id')).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map POST /payments/:id/refund to payments.refund procedure', () => {
      const routeConfig =
        refundPaymentRouteConfig['POST /payments/:id/refund']

      expect(routeConfig).toMatchObject({
        procedure: 'payments.refund',
      })
      expect(routeConfig!.procedure).toBe('payments.refund')
      expect(
        routeConfig!.pattern.test('payments/test-id/refund')
      ).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Payments creation pattern should match 'payments'
      const createConfig = findRouteConfig('POST /payments')
      expect(createConfig!.pattern.test('payments')).toBe(true)
      expect(createConfig!.pattern.test('payments/id')).toBe(false)

      // Payments get pattern should match 'payments/abc123'
      const getConfig = findRouteConfig('GET /payments/:id')
      expect(getConfig!.pattern.test('payments/abc123')).toBe(true)
      expect(getConfig!.pattern.test('payments')).toBe(false)
      expect(getConfig!.pattern.test('payments/abc123/extra')).toBe(
        false
      )

      // Payments edit pattern should match 'payments/abc123'
      const updateConfig = findRouteConfig('PUT /payments/:id')
      expect(updateConfig!.pattern.test('payments/abc123')).toBe(true)
      expect(updateConfig!.pattern.test('payments')).toBe(false)

      // Payments delete pattern should match 'payments/abc123'
      const deleteConfig = findRouteConfig('DELETE /payments/:id')
      expect(deleteConfig!.pattern.test('payments/abc123')).toBe(true)
      expect(deleteConfig!.pattern.test('payments')).toBe(false)

      // Payments list pattern should match 'payments' only
      const listConfig = findRouteConfig('GET /payments')
      expect(listConfig!.pattern.test('payments')).toBe(true)
      expect(listConfig!.pattern.test('payments/id')).toBe(false)

      // Refund pattern should match 'payments/abc123/refund'
      const refundConfig =
        refundPaymentRouteConfig['POST /payments/:id/refund']
      expect(
        refundConfig!.pattern.test('payments/abc123/refund')
      ).toBe(true)
      expect(refundConfig!.pattern.test('payments/abc123')).toBe(
        false
      )
      expect(refundConfig!.pattern.test('payments')).toBe(false)
      expect(
        refundConfig!.pattern.test('payments/abc123/refund/extra')
      ).toBe(false)
    })

    it('should extract correct matches from URL paths', () => {
      // Test Payments get pattern extraction
      const getConfig = findRouteConfig('GET /payments/:id')
      const getMatches = getConfig!.pattern.exec('payments/test-id')
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test Payments update pattern extraction
      const updateConfig = findRouteConfig('PUT /payments/:id')
      const updateMatches = updateConfig!.pattern.exec(
        'payments/test-id'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test Payments delete pattern extraction
      const deleteConfig = findRouteConfig('DELETE /payments/:id')
      const deleteMatches = deleteConfig!.pattern.exec(
        'payments/test-id'
      )
      expect(typeof deleteMatches).toBe('object')
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test Payments list pattern (no captures)
      const listConfig = findRouteConfig('GET /payments')
      const listMatches = listConfig!.pattern.exec('payments')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test Payments create pattern (no captures)
      const createConfig = findRouteConfig('POST /payments')
      const createMatches = createConfig!.pattern.exec('payments')
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test Refund pattern extraction
      const refundConfig =
        refundPaymentRouteConfig['POST /payments/:id/refund']
      const refundMatches = refundConfig!.pattern.exec(
        'payments/test-id/refund'
      )
      expect(typeof refundMatches).toBe('object')
      expect(refundMatches![1]).toBe('test-id') // First capture group
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for Payments get requests', () => {
      const routeConfig = findRouteConfig('GET /payments/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['pay-123'])

      expect(result).toEqual({
        id: 'pay-123',
      })
    })

    it('should correctly map URL parameters and body for Payments edit requests', () => {
      const routeConfig = findRouteConfig('PUT /payments/:id')
      const testBody = {
        payment: {
          status: 'completed',
          amount: 5000,
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['pay-456'], testBody)

      expect(result).toEqual({
        payment: {
          status: 'completed',
          amount: 5000,
        },
        id: 'pay-456',
      })
    })

    it('should correctly map URL parameters for Payments delete requests', () => {
      const routeConfig = findRouteConfig('DELETE /payments/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['pay-789'])

      expect(result).toEqual({
        id: 'pay-789',
      })
    })

    it('should return body for Payments create requests', () => {
      const routeConfig = findRouteConfig('POST /payments')
      const testBody = {
        payment: {
          amount: 1000,
          currency: 'USD',
        },
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for Payments list requests', () => {
      const routeConfig = findRouteConfig('GET /payments')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should correctly map URL parameters for refund requests', () => {
      const routeConfig =
        refundPaymentRouteConfig['POST /payments/:id/refund']

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['pay-999'])

      expect(result).toEqual({
        id: 'pay-999',
      })
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /payments/:id')

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams(['pay%40company.com'])
      expect(result1).toEqual({
        id: 'pay%40company.com',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams(['pay_123-abc'])
      expect(result2).toEqual({ id: 'pay_123-abc' })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /payments') // create
      expect(routeKeys).toContain('PUT /payments/:id') // update
      expect(routeKeys).toContain('GET /payments/:id') // get
      expect(routeKeys).toContain('GET /payments') // list
      expect(routeKeys).toContain('DELETE /payments/:id') // delete

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(5) // Standard CRUD operations
    })

    it('should have the custom refund route config', () => {
      const refundRouteKeys = Object.keys(refundPaymentRouteConfig)

      expect(refundRouteKeys).toContain('POST /payments/:id/refund')
      expect(refundRouteKeys).toHaveLength(1)
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /payments/:id',
        'GET /payments/:id',
        'DELETE /payments/:id',
      ]

      idRoutes.forEach((routeKey) => {
        const config = findRouteConfig(routeKey)

        // Test that mapParams consistently uses 'id' (simulate route handler slicing)
        const result = config!.mapParams(['test-id'], {
          someData: 'value',
        })
        expect(result).toHaveProperty('id', 'test-id')
      })

      // Also test the refund route
      const refundConfig =
        refundPaymentRouteConfig['POST /payments/:id/refund']
      const refundResult = refundConfig!.mapParams(['test-id'])
      expect(refundResult).toHaveProperty('id', 'test-id')
    })

    it('should have valid route config structure for all routes', () => {
      // Test all standard route configs from the array
      paymentsRouteConfigs.forEach((routeConfigObj) => {
        Object.entries(routeConfigObj).forEach(
          ([routeKey, config]) => {
            // Each config should have required properties
            validateRouteConfigStructure(config, 'payments')
          }
        )
      })

      // Test the refund route config
      Object.entries(refundPaymentRouteConfig).forEach(
        ([routeKey, config]) => {
          expect(config).toHaveProperty('procedure')
          expect(config).toHaveProperty('pattern')
          expect(config).toHaveProperty('mapParams')
          expect(config.procedure).toBe('payments.refund')
          expect(config.pattern).toBeInstanceOf(RegExp)
          expect(typeof config.mapParams).toBe('function')
        }
      )
    })

    it('should map to correct TRPC procedures', () => {
      const expectedMappings = {
        'POST /payments': 'payments.create',
        'PUT /payments/:id': 'payments.update',
        'GET /payments/:id': 'payments.get',
        'GET /payments': 'payments.list',
        'DELETE /payments/:id': 'payments.delete',
      }

      Object.entries(expectedMappings).forEach(
        ([routeKey, expectedProcedure]) => {
          const config = findRouteConfig(routeKey)
          expect(config!.procedure).toBe(expectedProcedure)
        }
      )

      // Test the refund route
      const refundConfig =
        refundPaymentRouteConfig['POST /payments/:id/refund']
      expect(refundConfig!.procedure).toBe('payments.refund')
    })
  })
})
