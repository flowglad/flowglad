import { describe, expect, it } from 'bun:test'
import { discountsRouteConfigs } from './discountsRouter'
import {
  findRouteConfigInObject,
  getAllRouteKeysFromObject,
  validateRouteConfigStructure,
} from './routeConfigs.test-utils'

describe('discountsRouteConfigs', () => {
  // Helper function to find route config in the object
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInObject(discountsRouteConfigs, routeKey)
  }

  // Helper function to get all route keys from the object
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromObject(discountsRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /discounts to discounts.create procedure', () => {
      const routeConfig = findRouteConfig('POST /discounts')

      expect(typeof routeConfig).toBe('object')
      expect(routeConfig.procedure).toBe('discounts.create')
      expect(routeConfig.pattern.test('discounts')).toBe(true)

      // Test mapParams with body
      const testBody = { discount: { code: 'SAVE10', amount: 10 } }
      const result = routeConfig.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /discounts/:id to discounts.update procedure', () => {
      const routeConfig = findRouteConfig('PUT /discounts/:id')

      expect(typeof routeConfig).toBe('object')
      expect(routeConfig.procedure).toBe('discounts.update')
      expect(routeConfig.pattern.test('discounts/test-id')).toBe(true)

      // Test mapParams with matches and body
      const testBody = { discount: { amount: 20 } }
      const result = routeConfig.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /discounts/:id to discounts.get procedure', () => {
      const routeConfig = findRouteConfig('GET /discounts/:id')

      expect(typeof routeConfig).toBe('object')
      expect(routeConfig.procedure).toBe('discounts.get')
      expect(routeConfig.pattern.test('discounts/test-id')).toBe(true)

      // Test mapParams with matches only
      const result = routeConfig.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /discounts to discounts.list procedure', () => {
      const routeConfig = findRouteConfig('GET /discounts')

      expect(typeof routeConfig).toBe('object')
      expect(routeConfig.procedure).toBe('discounts.list')
      expect(routeConfig.pattern.test('discounts')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig.mapParams([])
      expect(result).toBeUndefined()
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Discount creation pattern should match 'discounts'
      const createConfig = findRouteConfig('POST /discounts')
      expect(createConfig.pattern.test('discounts')).toBe(true)
      expect(createConfig.pattern.test('discounts/id')).toBe(false)

      // Discount get pattern should match 'discounts/abc123'
      const getConfig = findRouteConfig('GET /discounts/:id')
      expect(getConfig.pattern.test('discounts/abc123')).toBe(true)
      expect(getConfig.pattern.test('discounts')).toBe(false)
      expect(getConfig.pattern.test('discounts/abc123/extra')).toBe(
        false
      )

      // Discount update pattern should match 'discounts/abc123'
      const updateConfig = findRouteConfig('PUT /discounts/:id')
      expect(updateConfig.pattern.test('discounts/abc123')).toBe(true)
      expect(updateConfig.pattern.test('discounts')).toBe(false)

      // Discount list pattern should match 'discounts' only
      const listConfig = findRouteConfig('GET /discounts')
      expect(listConfig.pattern.test('discounts')).toBe(true)
      expect(listConfig.pattern.test('discounts/id')).toBe(false)
    })

    it('should extract correct matches from URL paths', () => {
      // Test discount get pattern extraction
      const getConfig = findRouteConfig('GET /discounts/:id')
      const getMatches = getConfig.pattern.exec('discounts/test-id')
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test discount update pattern extraction
      const updateConfig = findRouteConfig('PUT /discounts/:id')
      const updateMatches = updateConfig.pattern.exec(
        'discounts/discount-456'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('discount-456') // First capture group

      // Test discount list pattern (no captures)
      const listConfig = findRouteConfig('GET /discounts')
      const listMatches = listConfig.pattern.exec('discounts')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test discount create pattern (no captures)
      const createConfig = findRouteConfig('POST /discounts')
      const createMatches = createConfig.pattern.exec('discounts')
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for discount get requests', () => {
      const routeConfig = findRouteConfig('GET /discounts/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig.mapParams(['discount-123'])

      expect(result).toEqual({
        id: 'discount-123',
      })
    })

    it('should correctly map URL parameters and body for discount update requests', () => {
      const routeConfig = findRouteConfig('PUT /discounts/:id')
      const testBody = {
        discount: {
          amount: 25,
          code: 'UPDATED25',
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig.mapParams(['discount-456'], testBody)

      expect(result).toEqual({
        discount: {
          amount: 25,
          code: 'UPDATED25',
        },
        id: 'discount-456',
      })
    })

    it('should return body for discount create requests', () => {
      const routeConfig = findRouteConfig('POST /discounts')
      const testBody = {
        discount: {
          code: 'NEWCODE',
          amount: 15,
          type: 'percentage',
        },
      }

      const result = routeConfig.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for discount list requests', () => {
      const routeConfig = findRouteConfig('GET /discounts')

      const result = routeConfig.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /discounts/:id')

      // Test with URL-encoded characters
      const result1 = routeConfig.mapParams(['discount%2D2024'])
      expect(result1).toEqual({
        id: 'discount%2D2024',
      })

      // Test with hyphens and underscores
      const result2 = routeConfig.mapParams(['discount_123-abc'])
      expect(result2).toEqual({ id: 'discount_123-abc' })

      // Test with alphanumeric combinations
      const result3 = routeConfig.mapParams(['DISCOUNT123'])
      expect(result3).toEqual({ id: 'DISCOUNT123' })
    })
  })

  describe('Route config completeness', () => {
    it('should have exactly 4 expected route configs', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /discounts') // create
      expect(routeKeys).toContain('PUT /discounts/:id') // update
      expect(routeKeys).toContain('GET /discounts/:id') // get
      expect(routeKeys).toContain('GET /discounts') // list

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(4) // Only 4 routes (no delete, attempt, or clear)

      // Verify that commented out routes are NOT present
      expect(routeKeys).not.toContain('DELETE /discounts/:id')
      expect(routeKeys).not.toContain('POST /discounts/:id/attempt')
      expect(routeKeys).not.toContain('POST /discounts/:id/clear')
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = ['PUT /discounts/:id', 'GET /discounts/:id']

      idRoutes.forEach((routeKey) => {
        const config = findRouteConfig(routeKey)

        // Test that mapParams consistently uses 'id'
        const result = config.mapParams(['test-id'], {
          someData: 'value',
        })
        expect(result).toHaveProperty('id', 'test-id')
      })
    })

    it('should have valid route config structure for all routes', () => {
      Object.entries(discountsRouteConfigs).forEach(
        ([routeKey, config]) => {
          validateRouteConfigStructure(config, 'discounts')
        }
      )
    })

    it('should map to correct TRPC procedures', () => {
      const expectedMappings = {
        'POST /discounts': 'discounts.create',
        'PUT /discounts/:id': 'discounts.update',
        'GET /discounts/:id': 'discounts.get',
        'GET /discounts': 'discounts.list',
      }

      Object.entries(expectedMappings).forEach(
        ([routeKey, expectedProcedure]) => {
          const config = findRouteConfig(routeKey)
          expect(config!.procedure).toBe(expectedProcedure)
        }
      )
    })

    it('should confirm intentionally omitted routes are missing', () => {
      // These routes are commented out in the source code
      // Verify they are intentionally not included
      const omittedRoutes = [
        'DELETE /discounts/:id', // delete
        'POST /discounts/:id/attempt', // attempt
        'POST /discounts/:id/clear', // clear
      ]

      omittedRoutes.forEach((routeKey) => {
        expect(() => findRouteConfig(routeKey)).toThrow()
      })
    })
  })
})
