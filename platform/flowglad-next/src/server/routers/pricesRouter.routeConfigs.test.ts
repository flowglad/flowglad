import { describe, expect, it } from 'vitest'
import { pricesRouteConfigs } from './pricesRouter'
import {
  findRouteConfigInArray,
  getAllRouteKeysFromArray,
  validateRouteConfigStructure,
  validateStandardCrudMappings,
} from './routeConfigs.test-utils'

describe('pricesRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(pricesRouteConfigs, routeKey)
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(pricesRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /prices to prices.create procedure', () => {
      const routeConfig = findRouteConfig('POST /prices')

      expect(routeConfig).toMatchObject({
        procedure: 'prices.create',
      })
      expect(routeConfig!.procedure).toBe('prices.create')
      expect(routeConfig!.pattern.test('prices')).toBe(true)

      // Test mapParams with body
      const testBody = { price: { name: 'Test Price', amount: 1000 } }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /prices/:id to prices.update procedure', () => {
      const routeConfig = findRouteConfig('PUT /prices/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'prices.update',
      })
      expect(routeConfig!.procedure).toBe('prices.update')
      expect(routeConfig!.pattern.test('prices/test-id')).toBe(true)

      // Test mapParams with matches and body (simulate route handler slicing)
      const testBody = {
        price: { name: 'Updated Price', amount: 1500 },
      }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /prices/:id to prices.get procedure', () => {
      const routeConfig = findRouteConfig('GET /prices/:id')

      expect(routeConfig).toMatchObject({ procedure: 'prices.get' })
      expect(routeConfig!.procedure).toBe('prices.get')
      expect(routeConfig!.pattern.test('prices/test-id')).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /prices to prices.list procedure', () => {
      const routeConfig = findRouteConfig('GET /prices')

      expect(routeConfig).toMatchObject({ procedure: 'prices.list' })
      expect(routeConfig!.procedure).toBe('prices.list')
      expect(routeConfig!.pattern.test('prices')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should map DELETE /prices/:id to prices.delete procedure', () => {
      const routeConfig = findRouteConfig('DELETE /prices/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'prices.delete',
      })
      expect(routeConfig!.procedure).toBe('prices.delete')
      expect(routeConfig!.pattern.test('prices/test-id')).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Prices creation pattern should match 'prices'
      const createConfig = findRouteConfig('POST /prices')
      expect(createConfig!.pattern.test('prices')).toBe(true)
      expect(createConfig!.pattern.test('prices/id')).toBe(false)

      // Prices get pattern should match 'prices/abc123'
      const getConfig = findRouteConfig('GET /prices/:id')
      expect(getConfig!.pattern.test('prices/abc123')).toBe(true)
      expect(getConfig!.pattern.test('prices')).toBe(false)
      expect(getConfig!.pattern.test('prices/abc123/extra')).toBe(
        false
      )

      // Prices edit pattern should match 'prices/abc123'
      const updateConfig = findRouteConfig('PUT /prices/:id')
      expect(updateConfig!.pattern.test('prices/abc123')).toBe(true)
      expect(updateConfig!.pattern.test('prices')).toBe(false)

      // Prices delete pattern should match 'prices/abc123'
      const deleteConfig = findRouteConfig('DELETE /prices/:id')
      expect(deleteConfig!.pattern.test('prices/abc123')).toBe(true)
      expect(deleteConfig!.pattern.test('prices')).toBe(false)

      // Prices list pattern should match 'prices' only
      const listConfig = findRouteConfig('GET /prices')
      expect(listConfig!.pattern.test('prices')).toBe(true)
      expect(listConfig!.pattern.test('prices/id')).toBe(false)
    })

    it('should extract correct matches from URL paths', () => {
      // Test Prices get pattern extraction
      const getConfig = findRouteConfig('GET /prices/:id')
      const getMatches = getConfig!.pattern.exec('prices/test-id')
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test Prices update pattern extraction
      const updateConfig = findRouteConfig('PUT /prices/:id')
      const updateMatches =
        updateConfig!.pattern.exec('prices/test-id')
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test Prices delete pattern extraction
      const deleteConfig = findRouteConfig('DELETE /prices/:id')
      const deleteMatches =
        deleteConfig!.pattern.exec('prices/test-id')
      expect(typeof deleteMatches).toBe('object')
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test Prices list pattern (no captures)
      const listConfig = findRouteConfig('GET /prices')
      const listMatches = listConfig!.pattern.exec('prices')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test Prices create pattern (no captures)
      const createConfig = findRouteConfig('POST /prices')
      const createMatches = createConfig!.pattern.exec('prices')
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for Prices get requests', () => {
      const routeConfig = findRouteConfig('GET /prices/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['price-123'])

      expect(result).toEqual({
        id: 'price-123',
      })
    })

    it('should correctly map URL parameters and body for Prices edit requests', () => {
      const routeConfig = findRouteConfig('PUT /prices/:id')
      const testBody = {
        price: {
          name: 'Updated Price Name',
          amount: 2000,
          currency: 'USD',
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['price-456'], testBody)

      expect(result).toEqual({
        price: {
          name: 'Updated Price Name',
          amount: 2000,
          currency: 'USD',
        },
        id: 'price-456',
      })
    })

    it('should correctly map URL parameters for Prices delete requests', () => {
      const routeConfig = findRouteConfig('DELETE /prices/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['price-789'])

      expect(result).toEqual({
        id: 'price-789',
      })
    })

    it('should return body for Prices create requests', () => {
      const routeConfig = findRouteConfig('POST /prices')
      const testBody = {
        price: {
          name: 'New Price',
          amount: 1000,
          currency: 'USD',
        },
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for Prices list requests', () => {
      const routeConfig = findRouteConfig('GET /prices')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /prices/:id')

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams(['price%40company.com'])
      expect(result1).toEqual({
        id: 'price%40company.com',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams(['price_123-abc'])
      expect(result2).toEqual({ id: 'price_123-abc' })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /prices') // create
      expect(routeKeys).toContain('PUT /prices/:id') // update
      expect(routeKeys).toContain('GET /prices/:id') // get
      expect(routeKeys).toContain('GET /prices') // list
      expect(routeKeys).toContain('DELETE /prices/:id') // delete

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(5) // Standard CRUD operations
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /prices/:id',
        'GET /prices/:id',
        'DELETE /prices/:id',
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
      pricesRouteConfigs.forEach((routeConfigObj) => {
        Object.entries(routeConfigObj).forEach(
          ([routeKey, config]) => {
            validateRouteConfigStructure(config, 'prices')
          }
        )
      })
    })

    it('should map to correct TRPC procedures', () => {
      validateStandardCrudMappings(
        findRouteConfig,
        'prices',
        'prices'
      )
    })
  })
})
