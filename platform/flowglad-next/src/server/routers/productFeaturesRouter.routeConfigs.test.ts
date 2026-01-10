import { describe, expect, it } from 'vitest'
import { productFeaturesRouteConfigs } from './productFeaturesRouter'
import {
  findRouteConfigInArray,
  findRouteConfigInObject,
  getAllRouteKeysFromArray,
  getAllRouteKeysFromObject,
  validateRouteConfigStructure,
  validateStandardCrudMappings,
} from './routeConfigs.test-utils'

describe('productFeaturesRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(
      productFeaturesRouteConfigs,
      routeKey
    )
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(productFeaturesRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /product-features to productFeatures.create procedure', () => {
      const routeConfig = findRouteConfig('POST /product-features')

      expect(routeConfig).toMatchObject({
        procedure: 'productFeatures.create',
      })
      expect(routeConfig!.procedure).toBe('productFeatures.create')
      expect(routeConfig!.pattern.test('product-features')).toBe(true)

      // Test mapParams with body
      const testBody = {
        productFeature: {
          name: 'Test Feature',
          productId: 'prod-123',
        },
      }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /product-features/:id to productFeatures.update procedure', () => {
      const routeConfig = findRouteConfig('PUT /product-features/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'productFeatures.update',
      })
      expect(routeConfig!.procedure).toBe('productFeatures.update')
      expect(
        routeConfig!.pattern.test('product-features/test-id')
      ).toBe(true)

      // Test mapParams with matches and body (simulate route handler slicing)
      const testBody = {
        productFeature: {
          name: 'Updated Feature',
          productId: 'prod-456',
        },
      }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /product-features/:id to productFeatures.get procedure', () => {
      const routeConfig = findRouteConfig('GET /product-features/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'productFeatures.get',
      })
      expect(routeConfig!.procedure).toBe('productFeatures.get')
      expect(
        routeConfig!.pattern.test('product-features/test-id')
      ).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /product-features to productFeatures.list procedure', () => {
      const routeConfig = findRouteConfig('GET /product-features')

      expect(routeConfig).toMatchObject({
        procedure: 'productFeatures.list',
      })
      expect(routeConfig!.procedure).toBe('productFeatures.list')
      expect(routeConfig!.pattern.test('product-features')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should map DELETE /product-features/:id to productFeatures.delete procedure', () => {
      const routeConfig = findRouteConfig(
        'DELETE /product-features/:id'
      )

      expect(routeConfig).toMatchObject({
        procedure: 'productFeatures.delete',
      })
      expect(routeConfig!.procedure).toBe('productFeatures.delete')
      expect(
        routeConfig!.pattern.test('product-features/test-id')
      ).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Product Features creation pattern should match 'product-features'
      const createConfig = findRouteConfig('POST /product-features')
      expect(createConfig!.pattern.test('product-features')).toBe(
        true
      )
      expect(createConfig!.pattern.test('product-features/id')).toBe(
        false
      )

      // Product Features get pattern should match 'product-features/abc123'
      const getConfig = findRouteConfig('GET /product-features/:id')
      expect(getConfig!.pattern.test('product-features/abc123')).toBe(
        true
      )
      expect(getConfig!.pattern.test('product-features')).toBe(false)
      expect(
        getConfig!.pattern.test('product-features/abc123/extra')
      ).toBe(false)

      // Product Features edit pattern should match 'product-features/abc123'
      const updateConfig = findRouteConfig(
        'PUT /product-features/:id'
      )
      expect(
        updateConfig!.pattern.test('product-features/abc123')
      ).toBe(true)
      expect(updateConfig!.pattern.test('product-features')).toBe(
        false
      )

      // Product Features delete pattern should match 'product-features/abc123'
      const deleteConfig = findRouteConfig(
        'DELETE /product-features/:id'
      )
      expect(
        deleteConfig!.pattern.test('product-features/abc123')
      ).toBe(true)
      expect(deleteConfig!.pattern.test('product-features')).toBe(
        false
      )

      // Product Features list pattern should match 'product-features' only
      const listConfig = findRouteConfig('GET /product-features')
      expect(listConfig!.pattern.test('product-features')).toBe(true)
      expect(listConfig!.pattern.test('product-features/id')).toBe(
        false
      )
    })

    it('should extract correct matches from URL paths', () => {
      // Test Product Features get pattern extraction
      const getConfig = findRouteConfig('GET /product-features/:id')
      const getMatches = getConfig!.pattern.exec(
        'product-features/test-id'
      )
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test Product Features update pattern extraction
      const updateConfig = findRouteConfig(
        'PUT /product-features/:id'
      )
      const updateMatches = updateConfig!.pattern.exec(
        'product-features/test-id'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test Product Features delete pattern extraction
      const deleteConfig = findRouteConfig(
        'DELETE /product-features/:id'
      )
      const deleteMatches = deleteConfig!.pattern.exec(
        'product-features/test-id'
      )
      expect(typeof deleteMatches).toBe('object')
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test Product Features list pattern (no captures)
      const listConfig = findRouteConfig('GET /product-features')
      const listMatches = listConfig!.pattern.exec('product-features')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test Product Features create pattern (no captures)
      const createConfig = findRouteConfig('POST /product-features')
      const createMatches = createConfig!.pattern.exec(
        'product-features'
      )
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for Product Features get requests', () => {
      const routeConfig = findRouteConfig('GET /product-features/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['product-feature-123'])

      expect(result).toEqual({
        id: 'product-feature-123',
      })
    })

    it('should correctly map URL parameters and body for Product Features edit requests', () => {
      const routeConfig = findRouteConfig('PUT /product-features/:id')
      const testBody = {
        productFeature: {
          name: 'Updated Product Feature Name',
          productId: 'product-456',
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(
        ['product-feature-456'],
        testBody
      )

      expect(result).toEqual({
        productFeature: {
          name: 'Updated Product Feature Name',
          productId: 'product-456',
        },
        id: 'product-feature-456',
      })
    })

    it('should correctly map URL parameters for Product Features delete requests', () => {
      const routeConfig = findRouteConfig(
        'DELETE /product-features/:id'
      )

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['product-feature-789'])

      expect(result).toEqual({
        id: 'product-feature-789',
      })
    })

    it('should return body for Product Features create requests', () => {
      const routeConfig = findRouteConfig('POST /product-features')
      const testBody = {
        productFeature: {
          name: 'New Product Feature',
          productId: 'product-123',
        },
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for Product Features list requests', () => {
      const routeConfig = findRouteConfig('GET /product-features')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /product-features/:id')

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams([
        'feature%40company.com',
      ])
      expect(result1).toEqual({
        id: 'feature%40company.com',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams(['feature_123-abc'])
      expect(result2).toEqual({ id: 'feature_123-abc' })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /product-features') // create
      expect(routeKeys).toContain('PUT /product-features/:id') // update
      expect(routeKeys).toContain('GET /product-features/:id') // get
      expect(routeKeys).toContain('GET /product-features') // list
      expect(routeKeys).toContain('DELETE /product-features/:id') // delete

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(5) // Standard CRUD operations
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /product-features/:id',
        'GET /product-features/:id',
        'DELETE /product-features/:id',
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
      productFeaturesRouteConfigs.forEach((routeConfigObj) => {
        Object.entries(routeConfigObj).forEach(
          ([routeKey, config]) => {
            // Each config should have required properties
            validateRouteConfigStructure(config, 'productFeatures')
          }
        )
      })
    })

    it('should map to correct TRPC procedures', () => {
      validateStandardCrudMappings(
        findRouteConfig,
        'product-features',
        'productFeatures'
      )
    })
  })
})
