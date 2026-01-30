import { describe, expect, it } from 'bun:test'
import { paymentMethodsRouteConfigs } from './paymentMethodsRouter'
import {
  findRouteConfigInArray,
  getAllRouteKeysFromArray,
  validateRouteConfigStructure,
  validateStandardCrudMappings,
} from './routeConfigs.test-utils'

describe('paymentMethodsRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(
      paymentMethodsRouteConfigs,
      routeKey
    )
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(paymentMethodsRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /payment-methods to paymentMethods.create procedure', () => {
      const routeConfig = findRouteConfig('POST /payment-methods')

      expect(routeConfig).toMatchObject({
        procedure: 'paymentMethods.create',
      })
      expect(routeConfig!.procedure).toBe('paymentMethods.create')
      expect(routeConfig!.pattern.test('payment-methods')).toBe(true)

      // Test mapParams with body
      const testBody = { paymentMethod: { type: 'card' } }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /payment-methods/:id to paymentMethods.update procedure', () => {
      const routeConfig = findRouteConfig('PUT /payment-methods/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'paymentMethods.update',
      })
      expect(routeConfig!.procedure).toBe('paymentMethods.update')
      expect(
        routeConfig!.pattern.test('payment-methods/test-id')
      ).toBe(true)

      // Test mapParams with matches and body (simulate route handler slicing)
      const testBody = { paymentMethod: { type: 'bank_account' } }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /payment-methods/:id to paymentMethods.get procedure', () => {
      const routeConfig = findRouteConfig('GET /payment-methods/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'paymentMethods.get',
      })
      expect(routeConfig!.procedure).toBe('paymentMethods.get')
      expect(
        routeConfig!.pattern.test('payment-methods/test-id')
      ).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /payment-methods to paymentMethods.list procedure', () => {
      const routeConfig = findRouteConfig('GET /payment-methods')

      expect(routeConfig).toMatchObject({
        procedure: 'paymentMethods.list',
      })
      expect(routeConfig!.procedure).toBe('paymentMethods.list')
      expect(routeConfig!.pattern.test('payment-methods')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should map DELETE /payment-methods/:id to paymentMethods.delete procedure', () => {
      const routeConfig = findRouteConfig(
        'DELETE /payment-methods/:id'
      )

      expect(routeConfig).toMatchObject({
        procedure: 'paymentMethods.delete',
      })
      expect(routeConfig!.procedure).toBe('paymentMethods.delete')
      expect(
        routeConfig!.pattern.test('payment-methods/test-id')
      ).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Payment Methods creation pattern should match 'payment-methods'
      const createConfig = findRouteConfig('POST /payment-methods')
      expect(createConfig!.pattern.test('payment-methods')).toBe(true)
      expect(createConfig!.pattern.test('payment-methods/id')).toBe(
        false
      )

      // Payment Methods get pattern should match 'payment-methods/abc123'
      const getConfig = findRouteConfig('GET /payment-methods/:id')
      expect(getConfig!.pattern.test('payment-methods/abc123')).toBe(
        true
      )
      expect(getConfig!.pattern.test('payment-methods')).toBe(false)
      expect(
        getConfig!.pattern.test('payment-methods/abc123/extra')
      ).toBe(false)

      // Payment Methods edit pattern should match 'payment-methods/abc123'
      const updateConfig = findRouteConfig('PUT /payment-methods/:id')
      expect(
        updateConfig!.pattern.test('payment-methods/abc123')
      ).toBe(true)
      expect(updateConfig!.pattern.test('payment-methods')).toBe(
        false
      )

      // Payment Methods delete pattern should match 'payment-methods/abc123'
      const deleteConfig = findRouteConfig(
        'DELETE /payment-methods/:id'
      )
      expect(
        deleteConfig!.pattern.test('payment-methods/abc123')
      ).toBe(true)
      expect(deleteConfig!.pattern.test('payment-methods')).toBe(
        false
      )

      // Payment Methods list pattern should match 'payment-methods' only
      const listConfig = findRouteConfig('GET /payment-methods')
      expect(listConfig!.pattern.test('payment-methods')).toBe(true)
      expect(listConfig!.pattern.test('payment-methods/id')).toBe(
        false
      )
    })

    it('should extract correct matches from URL paths', () => {
      // Test Payment Methods get pattern extraction
      const getConfig = findRouteConfig('GET /payment-methods/:id')
      const getMatches = getConfig!.pattern.exec(
        'payment-methods/test-id'
      )
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test Payment Methods update pattern extraction
      const updateConfig = findRouteConfig('PUT /payment-methods/:id')
      const updateMatches = updateConfig!.pattern.exec(
        'payment-methods/test-id'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test Payment Methods delete pattern extraction
      const deleteConfig = findRouteConfig(
        'DELETE /payment-methods/:id'
      )
      const deleteMatches = deleteConfig!.pattern.exec(
        'payment-methods/test-id'
      )
      expect(typeof deleteMatches).toBe('object')
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test Payment Methods list pattern (no captures)
      const listConfig = findRouteConfig('GET /payment-methods')
      const listMatches = listConfig!.pattern.exec('payment-methods')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test Payment Methods create pattern (no captures)
      const createConfig = findRouteConfig('POST /payment-methods')
      const createMatches =
        createConfig!.pattern.exec('payment-methods')
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for Payment Methods get requests', () => {
      const routeConfig = findRouteConfig('GET /payment-methods/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['pm-123'])

      expect(result).toEqual({
        id: 'pm-123',
      })
    })

    it('should correctly map URL parameters and body for Payment Methods edit requests', () => {
      const routeConfig = findRouteConfig('PUT /payment-methods/:id')
      const testBody = {
        paymentMethod: {
          type: 'card',
          isDefault: true,
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['pm-456'], testBody)

      expect(result).toEqual({
        paymentMethod: {
          type: 'card',
          isDefault: true,
        },
        id: 'pm-456',
      })
    })

    it('should correctly map URL parameters for Payment Methods delete requests', () => {
      const routeConfig = findRouteConfig(
        'DELETE /payment-methods/:id'
      )

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['pm-789'])

      expect(result).toEqual({
        id: 'pm-789',
      })
    })

    it('should return body for Payment Methods create requests', () => {
      const routeConfig = findRouteConfig('POST /payment-methods')
      const testBody = {
        paymentMethod: {
          type: 'card',
          customerId: 'cus_123',
        },
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for Payment Methods list requests', () => {
      const routeConfig = findRouteConfig('GET /payment-methods')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /payment-methods/:id')

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams(['pm%40company.com'])
      expect(result1).toEqual({
        id: 'pm%40company.com',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams(['pm_123-abc'])
      expect(result2).toEqual({ id: 'pm_123-abc' })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /payment-methods') // create
      expect(routeKeys).toContain('PUT /payment-methods/:id') // update
      expect(routeKeys).toContain('GET /payment-methods/:id') // get
      expect(routeKeys).toContain('GET /payment-methods') // list
      expect(routeKeys).toContain('DELETE /payment-methods/:id') // delete

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(5) // Standard CRUD operations
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /payment-methods/:id',
        'GET /payment-methods/:id',
        'DELETE /payment-methods/:id',
      ]

      idRoutes.forEach((routeKey) => {
        const config = findRouteConfig(routeKey)

        // Test that mapParams consistently uses 'id' (simulate route handler slicing)
        const result = config!.mapParams(['test-id'], {
          someData: 'value',
        })
        expect(result).toHaveProperty('id', 'test-id')
      })
    })

    it('should have valid route config structure for all routes', () => {
      // Test all route configs from the array
      paymentMethodsRouteConfigs.forEach((routeConfigObj) => {
        Object.entries(routeConfigObj).forEach(
          ([routeKey, config]) => {
            validateRouteConfigStructure(config, 'paymentMethods')
          }
        )
      })
    })

    it('should map to correct TRPC procedures', () => {
      validateStandardCrudMappings(
        findRouteConfig,
        'payment-methods',
        'paymentMethods'
      )
    })
  })
})
