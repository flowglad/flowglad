import { describe, expect, it } from 'vitest'
import { purchasesRouteConfigs } from './purchasesRouter'
import {
  findRouteConfigInArray,
  findRouteConfigInObject,
  getAllRouteKeysFromArray,
  getAllRouteKeysFromObject,
  validateRouteConfigStructure,
  validateStandardCrudMappings,
} from './routeConfigs.test-utils'

describe('purchasesRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(purchasesRouteConfigs, routeKey)
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(purchasesRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /purchases to purchases.create procedure', () => {
      const routeConfig = findRouteConfig('POST /purchases')

      expect(routeConfig).toMatchObject({
        procedure: 'purchases.create',
      })
      expect(routeConfig!.procedure).toBe('purchases.create')
      expect(routeConfig!.pattern.test('purchases')).toBe(true)

      // Test mapParams with body
      const testBody = {
        purchase: { customerId: 'cust-123', amount: 5000 },
      }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /purchases/:id to purchases.update procedure', () => {
      const routeConfig = findRouteConfig('PUT /purchases/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'purchases.update',
      })
      expect(routeConfig!.procedure).toBe('purchases.update')
      expect(routeConfig!.pattern.test('purchases/test-id')).toBe(
        true
      )

      // Test mapParams with matches and body (simulate route handler slicing)
      const testBody = {
        purchase: { status: 'completed', amount: 6000 },
      }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /purchases/:id to purchases.get procedure', () => {
      const routeConfig = findRouteConfig('GET /purchases/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'purchases.get',
      })
      expect(routeConfig!.procedure).toBe('purchases.get')
      expect(routeConfig!.pattern.test('purchases/test-id')).toBe(
        true
      )

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /purchases to purchases.list procedure', () => {
      const routeConfig = findRouteConfig('GET /purchases')

      expect(routeConfig).toMatchObject({
        procedure: 'purchases.list',
      })
      expect(routeConfig!.procedure).toBe('purchases.list')
      expect(routeConfig!.pattern.test('purchases')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should map DELETE /purchases/:id to purchases.delete procedure', () => {
      const routeConfig = findRouteConfig('DELETE /purchases/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'purchases.delete',
      })
      expect(routeConfig!.procedure).toBe('purchases.delete')
      expect(routeConfig!.pattern.test('purchases/test-id')).toBe(
        true
      )

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Purchases creation pattern should match 'purchases'
      const createConfig = findRouteConfig('POST /purchases')
      expect(createConfig!.pattern.test('purchases')).toBe(true)
      expect(createConfig!.pattern.test('purchases/id')).toBe(false)

      // Purchases get pattern should match 'purchases/abc123'
      const getConfig = findRouteConfig('GET /purchases/:id')
      expect(getConfig!.pattern.test('purchases/abc123')).toBe(true)
      expect(getConfig!.pattern.test('purchases')).toBe(false)
      expect(getConfig!.pattern.test('purchases/abc123/extra')).toBe(
        false
      )

      // Purchases edit pattern should match 'purchases/abc123'
      const updateConfig = findRouteConfig('PUT /purchases/:id')
      expect(updateConfig!.pattern.test('purchases/abc123')).toBe(
        true
      )
      expect(updateConfig!.pattern.test('purchases')).toBe(false)

      // Purchases delete pattern should match 'purchases/abc123'
      const deleteConfig = findRouteConfig('DELETE /purchases/:id')
      expect(deleteConfig!.pattern.test('purchases/abc123')).toBe(
        true
      )
      expect(deleteConfig!.pattern.test('purchases')).toBe(false)

      // Purchases list pattern should match 'purchases' only
      const listConfig = findRouteConfig('GET /purchases')
      expect(listConfig!.pattern.test('purchases')).toBe(true)
      expect(listConfig!.pattern.test('purchases/id')).toBe(false)
    })

    it('should extract correct matches from URL paths', () => {
      // Test Purchases get pattern extraction
      const getConfig = findRouteConfig('GET /purchases/:id')
      const getMatches = getConfig!.pattern.exec('purchases/test-id')
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test Purchases update pattern extraction
      const updateConfig = findRouteConfig('PUT /purchases/:id')
      const updateMatches = updateConfig!.pattern.exec(
        'purchases/test-id'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test Purchases delete pattern extraction
      const deleteConfig = findRouteConfig('DELETE /purchases/:id')
      const deleteMatches = deleteConfig!.pattern.exec(
        'purchases/test-id'
      )
      expect(typeof deleteMatches).toBe('object')
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test Purchases list pattern (no captures)
      const listConfig = findRouteConfig('GET /purchases')
      const listMatches = listConfig!.pattern.exec('purchases')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test Purchases create pattern (no captures)
      const createConfig = findRouteConfig('POST /purchases')
      const createMatches = createConfig!.pattern.exec('purchases')
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for Purchases get requests', () => {
      const routeConfig = findRouteConfig('GET /purchases/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['purchase-123'])

      expect(result).toEqual({
        id: 'purchase-123',
      })
    })

    it('should correctly map URL parameters and body for Purchases edit requests', () => {
      const routeConfig = findRouteConfig('PUT /purchases/:id')
      const testBody = {
        purchase: {
          status: 'completed',
          amount: 7500,
          customerId: 'cust-456',
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(
        ['purchase-456'],
        testBody
      )

      expect(result).toEqual({
        purchase: {
          status: 'completed',
          amount: 7500,
          customerId: 'cust-456',
        },
        id: 'purchase-456',
      })
    })

    it('should correctly map URL parameters for Purchases delete requests', () => {
      const routeConfig = findRouteConfig('DELETE /purchases/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['purchase-789'])

      expect(result).toEqual({
        id: 'purchase-789',
      })
    })

    it('should return body for Purchases create requests', () => {
      const routeConfig = findRouteConfig('POST /purchases')
      const testBody = {
        purchase: {
          customerId: 'cust-123',
          amount: 5000,
          currency: 'USD',
        },
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for Purchases list requests', () => {
      const routeConfig = findRouteConfig('GET /purchases')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /purchases/:id')

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams([
        'purchase%40company.com',
      ])
      expect(result1).toEqual({
        id: 'purchase%40company.com',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams(['purchase_123-abc'])
      expect(result2).toEqual({ id: 'purchase_123-abc' })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /purchases') // create
      expect(routeKeys).toContain('PUT /purchases/:id') // update
      expect(routeKeys).toContain('GET /purchases/:id') // get
      expect(routeKeys).toContain('GET /purchases') // list
      expect(routeKeys).toContain('DELETE /purchases/:id') // delete

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(5) // Standard CRUD operations
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /purchases/:id',
        'GET /purchases/:id',
        'DELETE /purchases/:id',
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
      purchasesRouteConfigs.forEach((routeConfigObj) => {
        Object.entries(routeConfigObj).forEach(
          ([routeKey, config]) => {
            // Each config should have required properties
            validateRouteConfigStructure(config, 'purchases')
          }
        )
      })
    })

    it('should map to correct TRPC procedures', () => {
      validateStandardCrudMappings(
        findRouteConfig,
        'purchases',
        'purchases'
      )
    })
  })
})
