import { describe, expect, it } from 'vitest'
import { featuresRouteConfigs } from './featuresRouter'
import {
  findRouteConfigInArray,
  getAllRouteKeysFromArray,
  validateRouteConfigStructure,
  validateStandardCrudMappings,
} from './routeConfigs.test-utils'

describe('featuresRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(featuresRouteConfigs, routeKey)
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(featuresRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /features to features.create procedure', () => {
      const routeConfig = findRouteConfig('POST /features')

      expect(routeConfig).toMatchObject({
        procedure: 'features.create',
      })
      expect(routeConfig!.procedure).toBe('features.create')
      expect(routeConfig!.pattern.test('features')).toBe(true)

      // Test mapParams with body
      const testBody = {
        feature: { name: 'Test Feature', value: 'test' },
      }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /features/:id to features.update procedure', () => {
      const routeConfig = findRouteConfig('PUT /features/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'features.update',
      })
      expect(routeConfig!.procedure).toBe('features.update')
      expect(routeConfig!.pattern.test('features/test-id')).toBe(true)

      // Test mapParams with matches and body
      const testBody = { feature: { name: 'Updated Feature' } }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /features/:id to features.get procedure', () => {
      const routeConfig = findRouteConfig('GET /features/:id')

      expect(routeConfig).toMatchObject({ procedure: 'features.get' })
      expect(routeConfig!.procedure).toBe('features.get')
      expect(routeConfig!.pattern.test('features/test-id')).toBe(true)

      // Test mapParams with matches only
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map DELETE /features/:id to features.delete procedure', () => {
      const routeConfig = findRouteConfig('DELETE /features/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'features.delete',
      })
      expect(routeConfig!.procedure).toBe('features.delete')
      expect(routeConfig!.pattern.test('features/test-id')).toBe(true)

      // Test mapParams with matches only
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /features to features.list procedure', () => {
      const routeConfig = findRouteConfig('GET /features')

      expect(routeConfig).toMatchObject({
        procedure: 'features.list',
      })
      expect(routeConfig!.procedure).toBe('features.list')
      expect(routeConfig!.pattern.test('features')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Feature creation pattern should match 'features'
      const createConfig = findRouteConfig('POST /features')
      expect(createConfig!.pattern.test('features')).toBe(true)
      expect(createConfig!.pattern.test('features/id')).toBe(false)

      // Feature get pattern should match 'features/abc123'
      const getConfig = findRouteConfig('GET /features/:id')
      expect(getConfig!.pattern.test('features/abc123')).toBe(true)
      expect(getConfig!.pattern.test('features')).toBe(false)
      expect(getConfig!.pattern.test('features/abc123/extra')).toBe(
        false
      )

      // Feature update pattern should match 'features/abc123'
      const updateConfig = findRouteConfig('PUT /features/:id')
      expect(updateConfig!.pattern.test('features/abc123')).toBe(true)
      expect(updateConfig!.pattern.test('features')).toBe(false)

      // Feature delete pattern should match 'features/abc123'
      const deleteConfig = findRouteConfig('DELETE /features/:id')
      expect(deleteConfig!.pattern.test('features/abc123')).toBe(true)
      expect(deleteConfig!.pattern.test('features')).toBe(false)

      // Feature list pattern should match 'features' only
      const listConfig = findRouteConfig('GET /features')
      expect(listConfig!.pattern.test('features')).toBe(true)
      expect(listConfig!.pattern.test('features/id')).toBe(false)
    })

    it('should extract correct matches from URL paths', () => {
      // Test feature get pattern extraction
      const getConfig = findRouteConfig('GET /features/:id')
      const getMatches = getConfig!.pattern.exec('features/test-id')
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test feature update pattern extraction
      const updateConfig = findRouteConfig('PUT /features/:id')
      const updateMatches = updateConfig!.pattern.exec(
        'features/feature-456'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('feature-456') // First capture group

      // Test feature delete pattern extraction
      const deleteConfig = findRouteConfig('DELETE /features/:id')
      const deleteMatches = deleteConfig!.pattern.exec(
        'features/feature-789'
      )
      expect(typeof deleteMatches).toBe('object')
      expect(deleteMatches![1]).toBe('feature-789') // First capture group

      // Test feature list pattern (no captures)
      const listConfig = findRouteConfig('GET /features')
      const listMatches = listConfig!.pattern.exec('features')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test feature create pattern (no captures)
      const createConfig = findRouteConfig('POST /features')
      const createMatches = createConfig!.pattern.exec('features')
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for feature get requests', () => {
      const routeConfig = findRouteConfig('GET /features/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['feature-123'])

      expect(result).toEqual({
        id: 'feature-123',
      })
    })

    it('should correctly map URL parameters and body for feature update requests', () => {
      const routeConfig = findRouteConfig('PUT /features/:id')
      const testBody = {
        feature: {
          name: 'Updated Feature Name',
          description: 'Updated description',
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['feature-456'], testBody)

      expect(result).toEqual({
        feature: {
          name: 'Updated Feature Name',
          description: 'Updated description',
        },
        id: 'feature-456',
      })
    })

    it('should correctly map URL parameters for feature delete requests', () => {
      const routeConfig = findRouteConfig('DELETE /features/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['feature-789'])

      expect(result).toEqual({
        id: 'feature-789',
      })
    })

    it('should return body for feature create requests', () => {
      const routeConfig = findRouteConfig('POST /features')
      const testBody = {
        feature: {
          name: 'New Feature',
          key: 'new-feature',
          value: 'enabled',
        },
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for feature list requests', () => {
      const routeConfig = findRouteConfig('GET /features')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /features/:id')

      // Test with URL-encoded characters
      const result1 = routeConfig!.mapParams(['feature%2D2024'])
      expect(result1).toEqual({
        id: 'feature%2D2024',
      })

      // Test with hyphens and underscores
      const result2 = routeConfig!.mapParams(['feature_123-abc'])
      expect(result2).toEqual({ id: 'feature_123-abc' })

      // Test with alphanumeric combinations
      const result3 = routeConfig!.mapParams(['FEATURE123'])
      expect(result3).toEqual({ id: 'FEATURE123' })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected standard CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /features') // create
      expect(routeKeys).toContain('PUT /features/:id') // update
      expect(routeKeys).toContain('GET /features/:id') // get
      expect(routeKeys).toContain('GET /features') // list
      expect(routeKeys).toContain('DELETE /features/:id') // delete

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(5) // Standard CRUD routes
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /features/:id',
        'GET /features/:id',
        'DELETE /features/:id',
      ]

      idRoutes.forEach((routeKey) => {
        const config = findRouteConfig(routeKey)

        // Test that mapParams consistently uses 'id'
        const result = config!.mapParams(['test-id'], {
          someData: 'value',
        })
        expect(result).toHaveProperty('id', 'test-id')
      })
    })

    it('should have valid route config structure for all routes', () => {
      // Test all route configs from the array
      featuresRouteConfigs.forEach((routeConfigObj) => {
        Object.entries(routeConfigObj).forEach(
          ([routeKey, config]) => {
            validateRouteConfigStructure(config, 'features')
          }
        )
      })
    })

    it('should map to correct TRPC procedures', () => {
      validateStandardCrudMappings(
        findRouteConfig,
        'features',
        'features'
      )
    })

    it('should match expected standard CRUD pattern', () => {
      // Features router uses the standard generateOpenApiMetas function
      // which should produce exactly 5 standard CRUD routes
      const routeKeys = getAllRouteKeys()

      // Verify we have the standard set of CRUD operations
      const expectedRoutes = [
        'POST /features', // create
        'PUT /features/:id', // update
        'GET /features/:id', // get
        'DELETE /features/:id', // delete
        'GET /features', // list
      ]

      expectedRoutes.forEach((route) => {
        expect(routeKeys).toContain(route)
      })

      // Verify no additional custom routes exist
      expect(routeKeys.length).toBe(expectedRoutes.length)
    })
  })
})
