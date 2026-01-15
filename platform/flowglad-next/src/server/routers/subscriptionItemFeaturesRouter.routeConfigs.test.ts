import { describe, expect, it } from 'vitest'
import {
  findRouteConfigInArray,
  getAllRouteKeysFromArray,
  validateRouteConfigStructure,
} from './routeConfigs.test-utils'
import { subscriptionItemFeaturesRouteConfigs } from './subscriptionItemFeaturesRouter'

describe('subscriptionItemFeaturesRouteConfigs', () => {
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(
      subscriptionItemFeaturesRouteConfigs,
      routeKey
    )
  }

  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(
      subscriptionItemFeaturesRouteConfigs
    )
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /subscription-item-features to subscriptionItemFeatures.create procedure', () => {
      const routeConfig = findRouteConfig(
        'POST /subscription-item-features'
      )

      expect(typeof routeConfig).toBe('object')
      expect(routeConfig!.procedure).toBe(
        'subscriptionItemFeatures.create'
      )
      expect(
        routeConfig!.pattern.test('subscription-item-features')
      ).toBe(true)

      // Test mapParams with body
      const testBody = {
        subscriptionItemFeature: {
          subscriptionId: 'sub-123',
          featureId: 'feat-456',
          productFeatureId: 'prod-feat-789',
        },
      }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /subscription-item-features/:id to subscriptionItemFeatures.update procedure', () => {
      const routeConfig = findRouteConfig(
        'PUT /subscription-item-features/:id'
      )

      expect(typeof routeConfig).toBe('object')
      expect(routeConfig!.procedure).toBe(
        'subscriptionItemFeatures.update'
      )
      expect(
        routeConfig!.pattern.test(
          'subscription-item-features/test-id'
        )
      ).toBe(true)

      // Test mapParams with matches and body (simulate route handler slicing)
      const testBody = {
        subscriptionItemFeature: {
          quantity: 10,
          metadata: { key: 'value' },
        },
      }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /subscription-item-features/:id to subscriptionItemFeatures.get procedure', () => {
      const routeConfig = findRouteConfig(
        'GET /subscription-item-features/:id'
      )

      expect(typeof routeConfig).toBe('object')
      expect(routeConfig!.procedure).toBe(
        'subscriptionItemFeatures.get'
      )
      expect(
        routeConfig!.pattern.test(
          'subscription-item-features/test-id'
        )
      ).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /subscription-item-features to subscriptionItemFeatures.list procedure', () => {
      const routeConfig = findRouteConfig(
        'GET /subscription-item-features'
      )

      expect(typeof routeConfig).toBe('object')
      expect(routeConfig!.procedure).toBe(
        'subscriptionItemFeatures.list'
      )
      expect(
        routeConfig!.pattern.test('subscription-item-features')
      ).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should map DELETE /subscription-item-features/:id to subscriptionItemFeatures.delete procedure', () => {
      const routeConfig = findRouteConfig(
        'DELETE /subscription-item-features/:id'
      )

      expect(typeof routeConfig).toBe('object')
      expect(routeConfig!.procedure).toBe(
        'subscriptionItemFeatures.delete'
      )
      expect(
        routeConfig!.pattern.test(
          'subscription-item-features/test-id'
        )
      ).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Custom routes', () => {
    it('should map POST /subscription-item-features/:id/expire to subscriptionItemFeatures.expire procedure', () => {
      const routeConfig = findRouteConfig(
        'POST /subscription-item-features/:id/expire'
      )

      expect(typeof routeConfig).toBe('object')
      expect(routeConfig!.procedure).toBe(
        'subscriptionItemFeatures.expire'
      )
      expect(
        routeConfig!.pattern.test(
          'subscription-item-features/test-id/expire'
        )
      ).toBe(true)

      // Test that it doesn't match other patterns
      expect(
        routeConfig!.pattern.test(
          'subscription-item-features/test-id'
        )
      ).toBe(false)
      expect(
        routeConfig!.pattern.test(
          'subscription-item-features/test-id/expire/extra'
        )
      ).toBe(false)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // SubscriptionItemFeatures creation pattern should match 'subscription-item-features'
      const createConfig = findRouteConfig(
        'POST /subscription-item-features'
      )
      expect(
        createConfig!.pattern.test('subscription-item-features')
      ).toBe(true)
      expect(
        createConfig!.pattern.test('subscription-item-features/id')
      ).toBe(false)

      // SubscriptionItemFeatures get pattern should match 'subscription-item-features/abc123'
      const getConfig = findRouteConfig(
        'GET /subscription-item-features/:id'
      )
      expect(
        getConfig!.pattern.test('subscription-item-features/abc123')
      ).toBe(true)
      expect(
        getConfig!.pattern.test('subscription-item-features')
      ).toBe(false)
      expect(
        getConfig!.pattern.test(
          'subscription-item-features/abc123/extra'
        )
      ).toBe(false)

      // SubscriptionItemFeatures edit pattern should match 'subscription-item-features/abc123'
      const updateConfig = findRouteConfig(
        'PUT /subscription-item-features/:id'
      )
      expect(
        updateConfig!.pattern.test(
          'subscription-item-features/abc123'
        )
      ).toBe(true)
      expect(
        updateConfig!.pattern.test('subscription-item-features')
      ).toBe(false)

      // SubscriptionItemFeatures delete pattern should match 'subscription-item-features/abc123'
      const deleteConfig = findRouteConfig(
        'DELETE /subscription-item-features/:id'
      )
      expect(
        deleteConfig!.pattern.test(
          'subscription-item-features/abc123'
        )
      ).toBe(true)
      expect(
        deleteConfig!.pattern.test('subscription-item-features')
      ).toBe(false)

      // SubscriptionItemFeatures list pattern should match 'subscription-item-features' only
      const listConfig = findRouteConfig(
        'GET /subscription-item-features'
      )
      expect(
        listConfig!.pattern.test('subscription-item-features')
      ).toBe(true)
      expect(
        listConfig!.pattern.test('subscription-item-features/id')
      ).toBe(false)

      // Expire pattern should match 'subscription-item-features/abc123/expire'
      const expireConfig = findRouteConfig(
        'POST /subscription-item-features/:id/expire'
      )
      expect(
        expireConfig!.pattern.test(
          'subscription-item-features/abc123/expire'
        )
      ).toBe(true)
      expect(
        expireConfig!.pattern.test(
          'subscription-item-features/abc123'
        )
      ).toBe(false)
      expect(
        expireConfig!.pattern.test('subscription-item-features')
      ).toBe(false)
    })

    it('should extract correct matches from URL paths', () => {
      // Test SubscriptionItemFeatures get pattern extraction
      const getConfig = findRouteConfig(
        'GET /subscription-item-features/:id'
      )
      const getMatches = getConfig!.pattern.exec(
        'subscription-item-features/test-id'
      )
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test SubscriptionItemFeatures update pattern extraction
      const updateConfig = findRouteConfig(
        'PUT /subscription-item-features/:id'
      )
      const updateMatches = updateConfig!.pattern.exec(
        'subscription-item-features/test-id'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test SubscriptionItemFeatures delete pattern extraction
      const deleteConfig = findRouteConfig(
        'DELETE /subscription-item-features/:id'
      )
      const deleteMatches = deleteConfig!.pattern.exec(
        'subscription-item-features/test-id'
      )
      expect(typeof deleteMatches).toBe('object')
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test SubscriptionItemFeatures expire pattern extraction
      const expireConfig = findRouteConfig(
        'POST /subscription-item-features/:id/expire'
      )
      const expireMatches = expireConfig!.pattern.exec(
        'subscription-item-features/test-id/expire'
      )
      expect(typeof expireMatches).toBe('object')
      expect(expireMatches![1]).toBe('test-id') // First capture group

      // Test SubscriptionItemFeatures list pattern (no captures)
      const listConfig = findRouteConfig(
        'GET /subscription-item-features'
      )
      const listMatches = listConfig!.pattern.exec(
        'subscription-item-features'
      )
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test SubscriptionItemFeatures create pattern (no captures)
      const createConfig = findRouteConfig(
        'POST /subscription-item-features'
      )
      const createMatches = createConfig!.pattern.exec(
        'subscription-item-features'
      )
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for subscription item features get requests', () => {
      const routeConfig = findRouteConfig(
        'GET /subscription-item-features/:id'
      )

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams([
        'subscription-item-feature-123',
      ])

      expect(result).toEqual({
        id: 'subscription-item-feature-123',
      })
    })

    it('should correctly map URL parameters and body for subscription item features edit requests', () => {
      const routeConfig = findRouteConfig(
        'PUT /subscription-item-features/:id'
      )
      const testBody = {
        subscriptionItemFeature: {
          quantity: 15,
          metadata: { updated: 'true' },
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(
        ['subscription-item-feature-456'],
        testBody
      )

      expect(result).toEqual({
        subscriptionItemFeature: {
          quantity: 15,
          metadata: { updated: 'true' },
        },
        id: 'subscription-item-feature-456',
      })
    })

    it('should correctly map URL parameters for subscription item features delete requests', () => {
      const routeConfig = findRouteConfig(
        'DELETE /subscription-item-features/:id'
      )

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams([
        'subscription-item-feature-789',
      ])

      expect(result).toEqual({
        id: 'subscription-item-feature-789',
      })
    })

    it('should correctly map URL parameters for subscription item features expire requests', () => {
      const routeConfig = findRouteConfig(
        'POST /subscription-item-features/:id/expire'
      )

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams([
        'subscription-item-feature-expire-123',
      ])

      expect(result).toEqual({
        id: 'subscription-item-feature-expire-123',
      })
    })

    it('should return body for subscription item features create requests', () => {
      const routeConfig = findRouteConfig(
        'POST /subscription-item-features'
      )
      const testBody = {
        subscriptionItemFeature: {
          subscriptionId: 'sub-new-123',
          featureId: 'feat-new-456',
          productFeatureId: 'prod-feat-new-789',
          quantity: 5,
        },
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for subscription item features list requests', () => {
      const routeConfig = findRouteConfig(
        'GET /subscription-item-features'
      )

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig(
        'GET /subscription-item-features/:id'
      )

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams([
        'subscription-item-feature%40company.com',
      ])
      expect(result1).toEqual({
        id: 'subscription-item-feature%40company.com',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams([
        'subscription-item-feature_123-abc',
      ])
      expect(result2).toEqual({
        id: 'subscription-item-feature_123-abc',
      })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs plus custom expire route', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /subscription-item-features') // create
      expect(routeKeys).toContain(
        'PUT /subscription-item-features/:id'
      ) // update
      expect(routeKeys).toContain(
        'GET /subscription-item-features/:id'
      ) // get
      expect(routeKeys).toContain('GET /subscription-item-features') // list
      expect(routeKeys).toContain(
        'DELETE /subscription-item-features/:id'
      ) // delete

      // Check that custom expire route exists
      expect(routeKeys).toContain(
        'POST /subscription-item-features/:id/expire'
      ) // custom expire

      // Check that we have exactly 6 routes (5 CRUD + 1 custom)
      expect(routeKeys).toHaveLength(6)
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /subscription-item-features/:id',
        'GET /subscription-item-features/:id',
        'DELETE /subscription-item-features/:id',
        'POST /subscription-item-features/:id/expire',
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
      // Test all route configs from the flattened object
      getAllRouteKeys().forEach((routeKey) => {
        const config = findRouteConfig(routeKey)
        validateRouteConfigStructure(
          config!,
          'subscriptionItemFeatures'
        )
      })
    })

    it('should map to correct TRPC procedures', () => {
      const expectedMappings = {
        'POST /subscription-item-features':
          'subscriptionItemFeatures.create',
        'PUT /subscription-item-features/:id':
          'subscriptionItemFeatures.update',
        'GET /subscription-item-features/:id':
          'subscriptionItemFeatures.get',
        'GET /subscription-item-features':
          'subscriptionItemFeatures.list',
        'DELETE /subscription-item-features/:id':
          'subscriptionItemFeatures.delete',
        'POST /subscription-item-features/:id/expire':
          'subscriptionItemFeatures.expire',
      }

      Object.entries(expectedMappings).forEach(
        ([routeKey, expectedProcedure]) => {
          const config = findRouteConfig(routeKey)
          expect(config!.procedure).toBe(expectedProcedure)
        }
      )
    })

    it('should handle route config object merging correctly', () => {
      // This test verifies that the base route configs are properly merged
      // with the custom expire route config using object spread syntax

      const routeKeys = getAllRouteKeys()

      // Verify that we have both base CRUD routes and the custom expire route
      const baseRoutes = [
        'POST /subscription-item-features',
        'PUT /subscription-item-features/:id',
        'GET /subscription-item-features/:id',
        'GET /subscription-item-features',
        'DELETE /subscription-item-features/:id',
      ]

      const customRoutes = [
        'POST /subscription-item-features/:id/expire',
      ]

      baseRoutes.forEach((route) => {
        expect(routeKeys).toContain(route)
      })

      customRoutes.forEach((route) => {
        expect(routeKeys).toContain(route)
      })

      // Verify the object structure is correct (not an array)
      expect(typeof subscriptionItemFeaturesRouteConfigs).toBe(
        'object'
      )
      expect(
        Array.isArray(subscriptionItemFeaturesRouteConfigs)
      ).toBe(false)
    })
  })
})
