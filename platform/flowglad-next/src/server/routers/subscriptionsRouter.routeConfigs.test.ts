import { describe, it, expect } from 'vitest'
import { subscriptionsRouteConfigs } from './subscriptionsRouter'
import {
  findRouteConfigInArray,
  getAllRouteKeysFromArray,
  findRouteConfigInObject,
  getAllRouteKeysFromObject,
  validateRouteConfigStructure,
  validateStandardCrudMappings,
} from './routeConfigs.test-utils'

describe('subscriptionsRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(subscriptionsRouteConfigs, routeKey)
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(subscriptionsRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /subscriptions to subscriptions.create procedure', () => {
      const routeConfig = findRouteConfig('POST /subscriptions')

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('subscriptions.create')
      expect(routeConfig!.pattern.test('subscriptions')).toBe(true)

      // Test mapParams with body
      const testBody = {
        customerId: 'cus-123',
        priceId: 'price-456',
        quantity: 1,
      }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /subscriptions/:id to subscriptions.update procedure', () => {
      const routeConfig = findRouteConfig('PUT /subscriptions/:id')

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('subscriptions.update')
      expect(routeConfig!.pattern.test('subscriptions/test-id')).toBe(
        true
      )

      // Test mapParams with matches and body (simulate route handler slicing)
      const testBody = {
        subscription: {
          metadata: { updated: 'true' },
        },
      }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /subscriptions/:id to subscriptions.get procedure', () => {
      const routeConfig = findRouteConfig('GET /subscriptions/:id')

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('subscriptions.get')
      expect(routeConfig!.pattern.test('subscriptions/test-id')).toBe(
        true
      )

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /subscriptions to subscriptions.list procedure', () => {
      const routeConfig = findRouteConfig('GET /subscriptions')

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('subscriptions.list')
      expect(routeConfig!.pattern.test('subscriptions')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should map DELETE /subscriptions/:id to subscriptions.delete procedure', () => {
      const routeConfig = findRouteConfig('DELETE /subscriptions/:id')

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('subscriptions.delete')
      expect(routeConfig!.pattern.test('subscriptions/test-id')).toBe(
        true
      )

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Custom routes', () => {
    it('should map POST /subscriptions/:id/adjust to subscriptions.adjust procedure', () => {
      const routeConfig = findRouteConfig(
        'POST /subscriptions/:id/adjust'
      )

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('subscriptions.adjust')
      expect(
        routeConfig!.pattern.test('subscriptions/test-id/adjust')
      ).toBe(true)

      // Test that it doesn't match other patterns
      expect(routeConfig!.pattern.test('subscriptions/test-id')).toBe(
        false
      )
      expect(
        routeConfig!.pattern.test(
          'subscriptions/test-id/adjust/extra'
        )
      ).toBe(false)

      // Test mapParams - simulate route handler behavior by slicing the matches
      const fullMatch = routeConfig!.pattern.exec(
        'subscriptions/test-id/adjust'
      )
      const result = routeConfig!.mapParams(fullMatch!.slice(1) as any)
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map POST /subscriptions/:id/cancel to subscriptions.cancel procedure', () => {
      const routeConfig = findRouteConfig(
        'POST /subscriptions/:id/cancel'
      )

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('subscriptions.cancel')
      expect(
        routeConfig!.pattern.test('subscriptions/test-id/cancel')
      ).toBe(true)

      // Test that it doesn't match other patterns
      expect(routeConfig!.pattern.test('subscriptions/test-id')).toBe(
        false
      )
      expect(
        routeConfig!.pattern.test(
          'subscriptions/test-id/cancel/extra'
        )
      ).toBe(false)

      // Test mapParams - simulate route handler behavior by slicing the matches
      const fullMatch = routeConfig!.pattern.exec(
        'subscriptions/test-id/cancel'
      )
      const result = routeConfig!.mapParams(fullMatch!.slice(1) as any)
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Subscriptions creation pattern should match 'subscriptions'
      const createConfig = findRouteConfig('POST /subscriptions')
      expect(createConfig!.pattern.test('subscriptions')).toBe(true)
      expect(createConfig!.pattern.test('subscriptions/id')).toBe(
        false
      )

      // Subscriptions get pattern should match 'subscriptions/abc123'
      const getConfig = findRouteConfig('GET /subscriptions/:id')
      expect(getConfig!.pattern.test('subscriptions/abc123')).toBe(
        true
      )
      expect(getConfig!.pattern.test('subscriptions')).toBe(false)
      expect(
        getConfig!.pattern.test('subscriptions/abc123/extra')
      ).toBe(false)

      // Subscriptions edit pattern should match 'subscriptions/abc123'
      const updateConfig = findRouteConfig('PUT /subscriptions/:id')
      expect(updateConfig!.pattern.test('subscriptions/abc123')).toBe(
        true
      )
      expect(updateConfig!.pattern.test('subscriptions')).toBe(false)

      // Subscriptions delete pattern should match 'subscriptions/abc123'
      const deleteConfig = findRouteConfig(
        'DELETE /subscriptions/:id'
      )
      expect(deleteConfig!.pattern.test('subscriptions/abc123')).toBe(
        true
      )
      expect(deleteConfig!.pattern.test('subscriptions')).toBe(false)

      // Subscriptions list pattern should match 'subscriptions' only
      const listConfig = findRouteConfig('GET /subscriptions')
      expect(listConfig!.pattern.test('subscriptions')).toBe(true)
      expect(listConfig!.pattern.test('subscriptions/id')).toBe(false)

      // Adjust pattern should match 'subscriptions/abc123/adjust'
      const adjustConfig = findRouteConfig(
        'POST /subscriptions/:id/adjust'
      )
      expect(
        adjustConfig!.pattern.test('subscriptions/abc123/adjust')
      ).toBe(true)
      expect(adjustConfig!.pattern.test('subscriptions/abc123')).toBe(
        false
      )
      expect(adjustConfig!.pattern.test('subscriptions')).toBe(false)

      // Cancel pattern should match 'subscriptions/abc123/cancel'
      const cancelConfig = findRouteConfig(
        'POST /subscriptions/:id/cancel'
      )
      expect(
        cancelConfig!.pattern.test('subscriptions/abc123/cancel')
      ).toBe(true)
      expect(cancelConfig!.pattern.test('subscriptions/abc123')).toBe(
        false
      )
      expect(cancelConfig!.pattern.test('subscriptions')).toBe(false)
    })

    it('should extract correct matches from URL paths', () => {
      // Test Subscriptions get pattern extraction
      const getConfig = findRouteConfig('GET /subscriptions/:id')
      const getMatches = getConfig!.pattern.exec(
        'subscriptions/test-id'
      )
      expect(getMatches).not.toBeNull()
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test Subscriptions update pattern extraction
      const updateConfig = findRouteConfig('PUT /subscriptions/:id')
      const updateMatches = updateConfig!.pattern.exec(
        'subscriptions/test-id'
      )
      expect(updateMatches).not.toBeNull()
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test Subscriptions delete pattern extraction
      const deleteConfig = findRouteConfig(
        'DELETE /subscriptions/:id'
      )
      const deleteMatches = deleteConfig!.pattern.exec(
        'subscriptions/test-id'
      )
      expect(deleteMatches).not.toBeNull()
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test Subscriptions adjust pattern extraction
      const adjustConfig = findRouteConfig(
        'POST /subscriptions/:id/adjust'
      )
      const adjustMatches = adjustConfig!.pattern.exec(
        'subscriptions/test-id/adjust'
      )
      expect(adjustMatches).not.toBeNull()
      expect(adjustMatches![1]).toBe('test-id') // First capture group

      // Test Subscriptions cancel pattern extraction
      const cancelConfig = findRouteConfig(
        'POST /subscriptions/:id/cancel'
      )
      const cancelMatches = cancelConfig!.pattern.exec(
        'subscriptions/test-id/cancel'
      )
      expect(cancelMatches).not.toBeNull()
      expect(cancelMatches![1]).toBe('test-id') // First capture group

      // Test Subscriptions list pattern (no captures)
      const listConfig = findRouteConfig('GET /subscriptions')
      const listMatches = listConfig!.pattern.exec('subscriptions')
      expect(listMatches).not.toBeNull()
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test Subscriptions create pattern (no captures)
      const createConfig = findRouteConfig('POST /subscriptions')
      const createMatches =
        createConfig!.pattern.exec('subscriptions')
      expect(createMatches).not.toBeNull()
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for subscriptions get requests', () => {
      const routeConfig = findRouteConfig('GET /subscriptions/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['subscription-123'])

      expect(result).toEqual({
        id: 'subscription-123',
      })
    })

    it('should correctly map URL parameters and body for subscriptions edit requests', () => {
      const routeConfig = findRouteConfig('PUT /subscriptions/:id')
      const testBody = {
        subscription: {
          metadata: { updated: 'true', version: '2' },
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(
        ['subscription-456'],
        testBody
      )

      expect(result).toEqual({
        subscription: {
          metadata: { updated: 'true', version: '2' },
        },
        id: 'subscription-456',
      })
    })

    it('should correctly map URL parameters for subscriptions delete requests', () => {
      const routeConfig = findRouteConfig('DELETE /subscriptions/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['subscription-789'])

      expect(result).toEqual({
        id: 'subscription-789',
      })
    })

    it('should correctly map URL parameters for subscriptions adjust requests', () => {
      const routeConfig = findRouteConfig(
        'POST /subscriptions/:id/adjust'
      )

      // Simulate route handler behavior by slicing the matches
      const fullMatch = routeConfig!.pattern.exec(
        'subscriptions/subscription-adjust-123/adjust'
      )
      const result = routeConfig!.mapParams(fullMatch!.slice(1) as any)

      expect(result).toEqual({
        id: 'subscription-adjust-123',
      })
    })

    it('should correctly map URL parameters for subscriptions cancel requests', () => {
      const routeConfig = findRouteConfig(
        'POST /subscriptions/:id/cancel'
      )

      // Simulate route handler behavior by slicing the matches
      const fullMatch = routeConfig!.pattern.exec(
        'subscriptions/subscription-cancel-456/cancel'
      )
      const result = routeConfig!.mapParams(fullMatch!.slice(1) as any)

      expect(result).toEqual({
        id: 'subscription-cancel-456',
      })
    })

    it('should return body for subscriptions create requests', () => {
      const routeConfig = findRouteConfig('POST /subscriptions')
      const testBody = {
        customerId: 'cus-new-123',
        priceId: 'price-new-456',
        quantity: 2,
        startDate: new Date(),
        metadata: { created: 'via-api' },
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for subscriptions list requests', () => {
      const routeConfig = findRouteConfig('GET /subscriptions')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /subscriptions/:id')

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams([
        'subscription%40company.com',
      ])
      expect(result1).toEqual({
        id: 'subscription%40company.com',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams(['subscription_123-abc'])
      expect(result2).toEqual({ id: 'subscription_123-abc' })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs plus custom routes', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /subscriptions') // create
      expect(routeKeys).toContain('PUT /subscriptions/:id') // update
      expect(routeKeys).toContain('GET /subscriptions/:id') // get
      expect(routeKeys).toContain('GET /subscriptions') // list
      expect(routeKeys).toContain('DELETE /subscriptions/:id') // delete

      // Check that custom routes exist
      expect(routeKeys).toContain('POST /subscriptions/:id/adjust') // custom adjust
      expect(routeKeys).toContain('POST /subscriptions/:id/cancel') // custom cancel

      // Check that we have exactly 7 routes (5 CRUD + 2 custom)
      expect(routeKeys).toHaveLength(7)
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /subscriptions/:id',
        'GET /subscriptions/:id',
        'DELETE /subscriptions/:id',
        'POST /subscriptions/:id/adjust',
        'POST /subscriptions/:id/cancel',
      ]

      idRoutes.forEach((routeKey) => {
        const config = findRouteConfig(routeKey)

        // For adjust and cancel routes, use full match array; for others use sliced
        if (
          routeKey.includes('adjust') ||
          routeKey.includes('cancel')
        ) {
          const path = routeKey.includes('adjust')
            ? 'subscriptions/test-id/adjust'
            : 'subscriptions/test-id/cancel'
          const fullMatch = config!.pattern.exec(path)
          const result = config!.mapParams(fullMatch!.slice(1) as any, {
            someData: 'value',
          })
          expect(result).toHaveProperty('id', 'test-id')
        } else {
          // Standard routes use sliced array
          const result = config!.mapParams(['test-id'], {
            someData: 'value',
          })
          expect(result).toHaveProperty('id', 'test-id')
        }
      })
    })

    it('should have valid route config structure for all routes', () => {
      // Test all route configs from the array
      subscriptionsRouteConfigs.forEach((routeConfigObj) => {
        if (typeof routeConfigObj === 'object') {
          Object.entries(routeConfigObj).forEach(
            ([routeKey, config]) => {
              // Each config should have required properties
              validateRouteConfigStructure(config, 'subscriptions')
            }
          )
        }
      })
    })

    it('should map to correct TRPC procedures', () => {
      const expectedMappings = {
        'POST /subscriptions': 'subscriptions.create',
        'PUT /subscriptions/:id': 'subscriptions.update',
        'GET /subscriptions/:id': 'subscriptions.get',
        'GET /subscriptions': 'subscriptions.list',
        'DELETE /subscriptions/:id': 'subscriptions.delete',
        'POST /subscriptions/:id/adjust': 'subscriptions.adjust',
        'POST /subscriptions/:id/cancel': 'subscriptions.cancel',
      }

      Object.entries(expectedMappings).forEach(
        ([routeKey, expectedProcedure]) => {
          const config = findRouteConfig(routeKey)
          expect(config!.procedure).toBe(expectedProcedure)
        }
      )
    })

    it('should use array structure (not object) as noted in requirements', () => {
      // This test verifies that subscriptionsRouteConfigs is an array structure
      // as noted in the requirements, unlike other routers which use objects

      expect(Array.isArray(subscriptionsRouteConfigs)).toBe(true)
      expect(subscriptionsRouteConfigs.length).toBeGreaterThan(0)

      // Each item in the array should be an object with route configs
      subscriptionsRouteConfigs.forEach((item) => {
        expect(typeof item).toBe('object')
        expect(item).not.toBeNull()

        // Each object should have at least one route config
        const keys = Object.keys(item)
        expect(keys.length).toBeGreaterThan(0)
      })
    })

    it('should properly merge base route configs with custom routes using trpcToRest', () => {
      // This test verifies that the router properly uses the trpcToRest utility
      // for custom routes with routeParams as specified in the requirements

      const routeKeys = getAllRouteKeys()

      // Verify that custom routes exist and follow the expected pattern
      const customRoutes = [
        'POST /subscriptions/:id/adjust',
        'POST /subscriptions/:id/cancel',
      ]

      customRoutes.forEach((route) => {
        expect(routeKeys).toContain(route)
        const config = findRouteConfig(route)
        expect(config).toBeDefined()
        expect(config!.procedure).toMatch(
          /^subscriptions\.(adjust|cancel)$/
        )
      })

      // Verify that base CRUD routes also exist
      const baseRoutes = [
        'POST /subscriptions',
        'PUT /subscriptions/:id',
        'GET /subscriptions/:id',
        'GET /subscriptions',
        'DELETE /subscriptions/:id',
      ]

      baseRoutes.forEach((route) => {
        expect(routeKeys).toContain(route)
      })
    })
  })
})
