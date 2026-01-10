import { describe, expect, it } from 'vitest'
import {
  findRouteConfigInArray,
  getAllRouteKeysFromArray,
  validateRouteConfigStructure,
  validateStandardCrudMappings,
} from './routeConfigs.test-utils'
import {
  usageEventsBulkRouteConfig,
  usageEventsRouteConfigs,
} from './usageEventsRouter'

describe('usageEventsRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(usageEventsRouteConfigs, routeKey)
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(usageEventsRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /usage-events to usageEvents.create procedure', () => {
      const routeConfig = findRouteConfig('POST /usage-events')

      expect(routeConfig).toMatchObject({
        procedure: 'usageEvents.create',
      })
      expect(routeConfig!.procedure).toBe('usageEvents.create')
      expect(routeConfig!.pattern.test('usage-events')).toBe(true)

      // Test mapParams with body
      const testBody = {
        usageEvent: { subscriptionId: 'sub-123', quantity: 100 },
      }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /usage-events/:id to usageEvents.update procedure', () => {
      const routeConfig = findRouteConfig('PUT /usage-events/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'usageEvents.update',
      })
      expect(routeConfig!.procedure).toBe('usageEvents.update')
      expect(routeConfig!.pattern.test('usage-events/test-id')).toBe(
        true
      )

      // Test mapParams with matches and body (simulate route handler slicing)
      const testBody = {
        usageEvent: { quantity: 150, priceId: 'price-456' },
      }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /usage-events/:id to usageEvents.get procedure', () => {
      const routeConfig = findRouteConfig('GET /usage-events/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'usageEvents.get',
      })
      expect(routeConfig!.procedure).toBe('usageEvents.get')
      expect(routeConfig!.pattern.test('usage-events/test-id')).toBe(
        true
      )

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /usage-events to usageEvents.list procedure', () => {
      const routeConfig = findRouteConfig('GET /usage-events')

      expect(routeConfig).toMatchObject({
        procedure: 'usageEvents.list',
      })
      expect(routeConfig!.procedure).toBe('usageEvents.list')
      expect(routeConfig!.pattern.test('usage-events')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should map DELETE /usage-events/:id to usageEvents.delete procedure', () => {
      const routeConfig = findRouteConfig('DELETE /usage-events/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'usageEvents.delete',
      })
      expect(routeConfig!.procedure).toBe('usageEvents.delete')
      expect(routeConfig!.pattern.test('usage-events/test-id')).toBe(
        true
      )

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map POST /usage-events/bulk to usageEvents.bulkInsert procedure', () => {
      const routeConfig =
        usageEventsBulkRouteConfig['POST /usage-events/bulk']

      expect(typeof routeConfig).toBe('object')
      expect(routeConfig.procedure).toBe('usageEvents.bulkInsert')

      // Test pattern matching
      expect(routeConfig.pattern.test('usage-events/bulk')).toBe(true)
      expect(
        routeConfig.pattern.test('usage-events/bulk/extra')
      ).toBe(false)
      expect(routeConfig.pattern.test('usage-events')).toBe(false)

      // Test mapParams with body
      const testBody = {
        usageEvents: [
          {
            subscriptionId: 'sub_123',
            amount: 100,
            priceId: 'price_456',
          },
        ],
      }
      const result = routeConfig.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Usage Events creation pattern should match 'usage-events'
      const createConfig = findRouteConfig('POST /usage-events')
      expect(createConfig!.pattern.test('usage-events')).toBe(true)
      expect(createConfig!.pattern.test('usage-events/id')).toBe(
        false
      )

      // Usage Events get pattern should match 'usage-events/abc123'
      const getConfig = findRouteConfig('GET /usage-events/:id')
      expect(getConfig!.pattern.test('usage-events/abc123')).toBe(
        true
      )
      expect(getConfig!.pattern.test('usage-events')).toBe(false)
      expect(
        getConfig!.pattern.test('usage-events/abc123/extra')
      ).toBe(false)

      // Usage Events edit pattern should match 'usage-events/abc123'
      const updateConfig = findRouteConfig('PUT /usage-events/:id')
      expect(updateConfig!.pattern.test('usage-events/abc123')).toBe(
        true
      )
      expect(updateConfig!.pattern.test('usage-events')).toBe(false)

      // Usage Events delete pattern should match 'usage-events/abc123'
      const deleteConfig = findRouteConfig('DELETE /usage-events/:id')
      expect(deleteConfig!.pattern.test('usage-events/abc123')).toBe(
        true
      )
      expect(deleteConfig!.pattern.test('usage-events')).toBe(false)

      // Usage Events list pattern should match 'usage-events' only
      const listConfig = findRouteConfig('GET /usage-events')
      expect(listConfig!.pattern.test('usage-events')).toBe(true)
      expect(listConfig!.pattern.test('usage-events/id')).toBe(false)
    })

    it('should extract correct matches from URL paths', () => {
      // Test Usage Events get pattern extraction
      const getConfig = findRouteConfig('GET /usage-events/:id')
      const getMatches = getConfig!.pattern.exec(
        'usage-events/test-id'
      )
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test Usage Events update pattern extraction
      const updateConfig = findRouteConfig('PUT /usage-events/:id')
      const updateMatches = updateConfig!.pattern.exec(
        'usage-events/test-id'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test Usage Events delete pattern extraction
      const deleteConfig = findRouteConfig('DELETE /usage-events/:id')
      const deleteMatches = deleteConfig!.pattern.exec(
        'usage-events/test-id'
      )
      expect(typeof deleteMatches).toBe('object')
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test Usage Events list pattern (no captures)
      const listConfig = findRouteConfig('GET /usage-events')
      const listMatches = listConfig!.pattern.exec('usage-events')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test Usage Events create pattern (no captures)
      const createConfig = findRouteConfig('POST /usage-events')
      const createMatches = createConfig!.pattern.exec('usage-events')
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for Usage Events get requests', () => {
      const routeConfig = findRouteConfig('GET /usage-events/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['usage-event-123'])

      expect(result).toEqual({
        id: 'usage-event-123',
      })
    })

    it('should correctly map URL parameters and body for Usage Events edit requests', () => {
      const routeConfig = findRouteConfig('PUT /usage-events/:id')
      const testBody = {
        usageEvent: {
          quantity: 250,
          subscriptionId: 'sub-456',
          priceId: 'price-789',
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(
        ['usage-event-456'],
        testBody
      )

      expect(result).toEqual({
        usageEvent: {
          quantity: 250,
          subscriptionId: 'sub-456',
          priceId: 'price-789',
        },
        id: 'usage-event-456',
      })
    })

    it('should correctly map URL parameters for Usage Events delete requests', () => {
      const routeConfig = findRouteConfig('DELETE /usage-events/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['usage-event-789'])

      expect(result).toEqual({
        id: 'usage-event-789',
      })
    })

    it('should return body for Usage Events create requests', () => {
      const routeConfig = findRouteConfig('POST /usage-events')
      const testBody = {
        usageEvent: {
          subscriptionId: 'sub-123',
          quantity: 100,
          priceId: 'price-456',
        },
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for Usage Events list requests', () => {
      const routeConfig = findRouteConfig('GET /usage-events')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /usage-events/:id')

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams(['event%40company.com'])
      expect(result1).toEqual({
        id: 'event%40company.com',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams(['event_123-abc'])
      expect(result2).toEqual({ id: 'event_123-abc' })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /usage-events') // create
      expect(routeKeys).toContain('PUT /usage-events/:id') // update
      expect(routeKeys).toContain('GET /usage-events/:id') // get
      expect(routeKeys).toContain('GET /usage-events') // list
      expect(routeKeys).toContain('DELETE /usage-events/:id') // delete

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(5) // Standard CRUD operations
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /usage-events/:id',
        'GET /usage-events/:id',
        'DELETE /usage-events/:id',
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
      usageEventsRouteConfigs.forEach((routeConfigObj) => {
        Object.entries(routeConfigObj).forEach(
          ([routeKey, config]) => {
            // Each config should have required properties
            validateRouteConfigStructure(config, 'usageEvents')
          }
        )
      })
    })

    it('should map to correct TRPC procedures', () => {
      validateStandardCrudMappings(
        findRouteConfig,
        'usage-events',
        'usageEvents'
      )
    })
  })

  describe('POST /usage-events schema validation', () => {
    it('should accept priceSlug in POST /usage-events request body', () => {
      const routeConfig = findRouteConfig('POST /usage-events')

      expect(routeConfig?.procedure).toBe('usageEvents.create')

      // Test with priceSlug instead of priceId
      const testBodyWithPriceSlug = {
        usageEvent: {
          subscriptionId: 'sub-123',
          priceSlug: 'price-slug-456',
          amount: 100,
          transactionId: 'txn-123',
        },
      }
      const result = routeConfig!.mapParams([], testBodyWithPriceSlug)
      expect(result).toEqual(testBodyWithPriceSlug)
    })
  })
})
