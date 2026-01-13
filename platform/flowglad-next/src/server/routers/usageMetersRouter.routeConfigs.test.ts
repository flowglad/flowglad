import { describe, expect, it } from 'vitest'
import {
  findRouteConfigInArray,
  findRouteConfigInObject,
  getAllRouteKeysFromArray,
  getAllRouteKeysFromObject,
  validateRouteConfigStructure,
  validateStandardCrudMappings,
} from './routeConfigs.test-utils'
import { usageMetersRouteConfigs } from './usageMetersRouter'

describe('usageMetersRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(usageMetersRouteConfigs, routeKey)
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(usageMetersRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /usage-meters to usageMeters.create procedure', () => {
      const routeConfig = findRouteConfig('POST /usage-meters')

      expect(routeConfig).toMatchObject({
        procedure: 'usageMeters.create',
      })
      expect(routeConfig!.procedure).toBe('usageMeters.create')
      expect(routeConfig!.pattern.test('usage-meters')).toBe(true)

      // Test mapParams with body
      const testBody = {
        usageMeter: {
          name: 'Test Usage Meter',
          aggregationBehavior: 'sum',
        },
      }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /usage-meters/:id to usageMeters.update procedure', () => {
      const routeConfig = findRouteConfig('PUT /usage-meters/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'usageMeters.update',
      })
      expect(routeConfig!.procedure).toBe('usageMeters.update')
      expect(routeConfig!.pattern.test('usage-meters/test-id')).toBe(
        true
      )

      // Test mapParams with matches and body (simulate route handler slicing)
      const testBody = {
        usageMeter: {
          name: 'Updated Usage Meter',
          aggregationBehavior: 'max',
        },
      }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /usage-meters/:id to usageMeters.get procedure', () => {
      const routeConfig = findRouteConfig('GET /usage-meters/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'usageMeters.get',
      })
      expect(routeConfig!.procedure).toBe('usageMeters.get')
      expect(routeConfig!.pattern.test('usage-meters/test-id')).toBe(
        true
      )

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /usage-meters to usageMeters.list procedure', () => {
      const routeConfig = findRouteConfig('GET /usage-meters')

      expect(routeConfig).toMatchObject({
        procedure: 'usageMeters.list',
      })
      expect(routeConfig!.procedure).toBe('usageMeters.list')
      expect(routeConfig!.pattern.test('usage-meters')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should map DELETE /usage-meters/:id to usageMeters.delete procedure', () => {
      const routeConfig = findRouteConfig('DELETE /usage-meters/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'usageMeters.delete',
      })
      expect(routeConfig!.procedure).toBe('usageMeters.delete')
      expect(routeConfig!.pattern.test('usage-meters/test-id')).toBe(
        true
      )

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Usage Meters creation pattern should match 'usage-meters'
      const createConfig = findRouteConfig('POST /usage-meters')
      expect(createConfig!.pattern.test('usage-meters')).toBe(true)
      expect(createConfig!.pattern.test('usage-meters/id')).toBe(
        false
      )

      // Usage Meters get pattern should match 'usage-meters/abc123'
      const getConfig = findRouteConfig('GET /usage-meters/:id')
      expect(getConfig!.pattern.test('usage-meters/abc123')).toBe(
        true
      )
      expect(getConfig!.pattern.test('usage-meters')).toBe(false)
      expect(
        getConfig!.pattern.test('usage-meters/abc123/extra')
      ).toBe(false)

      // Usage Meters edit pattern should match 'usage-meters/abc123'
      const updateConfig = findRouteConfig('PUT /usage-meters/:id')
      expect(updateConfig!.pattern.test('usage-meters/abc123')).toBe(
        true
      )
      expect(updateConfig!.pattern.test('usage-meters')).toBe(false)

      // Usage Meters delete pattern should match 'usage-meters/abc123'
      const deleteConfig = findRouteConfig('DELETE /usage-meters/:id')
      expect(deleteConfig!.pattern.test('usage-meters/abc123')).toBe(
        true
      )
      expect(deleteConfig!.pattern.test('usage-meters')).toBe(false)

      // Usage Meters list pattern should match 'usage-meters' only
      const listConfig = findRouteConfig('GET /usage-meters')
      expect(listConfig!.pattern.test('usage-meters')).toBe(true)
      expect(listConfig!.pattern.test('usage-meters/id')).toBe(false)
    })

    it('should extract correct matches from URL paths', () => {
      // Test Usage Meters get pattern extraction
      const getConfig = findRouteConfig('GET /usage-meters/:id')
      const getMatches = getConfig!.pattern.exec(
        'usage-meters/test-id'
      )
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test Usage Meters update pattern extraction
      const updateConfig = findRouteConfig('PUT /usage-meters/:id')
      const updateMatches = updateConfig!.pattern.exec(
        'usage-meters/test-id'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test Usage Meters delete pattern extraction
      const deleteConfig = findRouteConfig('DELETE /usage-meters/:id')
      const deleteMatches = deleteConfig!.pattern.exec(
        'usage-meters/test-id'
      )
      expect(typeof deleteMatches).toBe('object')
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test Usage Meters list pattern (no captures)
      const listConfig = findRouteConfig('GET /usage-meters')
      const listMatches = listConfig!.pattern.exec('usage-meters')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test Usage Meters create pattern (no captures)
      const createConfig = findRouteConfig('POST /usage-meters')
      const createMatches = createConfig!.pattern.exec('usage-meters')
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for Usage Meters get requests', () => {
      const routeConfig = findRouteConfig('GET /usage-meters/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['usage-meter-123'])

      expect(result).toEqual({
        id: 'usage-meter-123',
      })
    })

    it('should correctly map URL parameters and body for Usage Meters edit requests', () => {
      const routeConfig = findRouteConfig('PUT /usage-meters/:id')
      const testBody = {
        usageMeter: {
          name: 'Updated Usage Meter Name',
          aggregationBehavior: 'last_ever',
          displayName: 'API Calls',
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(
        ['usage-meter-456'],
        testBody
      )

      expect(result).toEqual({
        usageMeter: {
          name: 'Updated Usage Meter Name',
          aggregationBehavior: 'last_ever',
          displayName: 'API Calls',
        },
        id: 'usage-meter-456',
      })
    })

    it('should correctly map URL parameters for Usage Meters delete requests', () => {
      const routeConfig = findRouteConfig('DELETE /usage-meters/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['usage-meter-789'])

      expect(result).toEqual({
        id: 'usage-meter-789',
      })
    })

    it('should return body for Usage Meters create requests', () => {
      const routeConfig = findRouteConfig('POST /usage-meters')
      const testBody = {
        usageMeter: {
          name: 'New Usage Meter',
          aggregationBehavior: 'sum',
          displayName: 'Database Queries',
        },
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for Usage Meters list requests', () => {
      const routeConfig = findRouteConfig('GET /usage-meters')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /usage-meters/:id')

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams(['meter%40company.com'])
      expect(result1).toEqual({
        id: 'meter%40company.com',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams(['meter_123-abc'])
      expect(result2).toEqual({ id: 'meter_123-abc' })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /usage-meters') // create
      expect(routeKeys).toContain('PUT /usage-meters/:id') // update
      expect(routeKeys).toContain('GET /usage-meters/:id') // get
      expect(routeKeys).toContain('GET /usage-meters') // list
      expect(routeKeys).toContain('DELETE /usage-meters/:id') // delete

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(5) // Standard CRUD operations
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /usage-meters/:id',
        'GET /usage-meters/:id',
        'DELETE /usage-meters/:id',
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
      usageMetersRouteConfigs.forEach((routeConfigObj) => {
        Object.entries(routeConfigObj).forEach(
          ([routeKey, config]) => {
            // Each config should have required properties
            validateRouteConfigStructure(config, 'usageMeters')
          }
        )
      })
    })

    it('should map to correct TRPC procedures', () => {
      validateStandardCrudMappings(
        findRouteConfig,
        'usage-meters',
        'usageMeters'
      )
    })
  })
})
