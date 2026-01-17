import { describe, expect, it } from 'bun:test'
import { productsRouteConfigs } from './productsRouter'
import {
  findRouteConfigInObject,
  getAllRouteKeysFromObject,
  validateRouteConfigStructure,
} from './routeConfigs.test-utils'

describe('productsRouteConfigs', () => {
  // Helper function to find route config in the object
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInObject(productsRouteConfigs, routeKey)
  }

  // Helper function to get all route keys from the object
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromObject(productsRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /products to products.create procedure', () => {
      const routeConfig = findRouteConfig('POST /products')

      expect(routeConfig).toMatchObject({
        procedure: 'products.create',
      })
      expect(routeConfig!.procedure).toBe('products.create')
      expect(routeConfig!.pattern.test('products')).toBe(true)

      // Test mapParams with body
      const testBody = {
        product: {
          name: 'Test Product',
          description: 'A test product',
        },
        price: {
          unitAmount: 1000,
          currency: 'usd',
        },
      }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /products/:id to products.update procedure', () => {
      const routeConfig = findRouteConfig('PUT /products/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'products.update',
      })
      expect(routeConfig!.procedure).toBe('products.update')
      expect(routeConfig!.pattern.test('products/test-id')).toBe(true)

      // Test mapParams with matches and body (simulate route handler slicing)
      const testBody = {
        product: {
          name: 'Updated Product',
          description: 'An updated product',
        },
      }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /products/:id to products.get procedure', () => {
      const routeConfig = findRouteConfig('GET /products/:id')

      expect(routeConfig).toMatchObject({ procedure: 'products.get' })
      expect(routeConfig!.procedure).toBe('products.get')
      expect(routeConfig!.pattern.test('products/test-id')).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /products to products.list procedure', () => {
      const routeConfig = findRouteConfig('GET /products')

      expect(routeConfig).toMatchObject({
        procedure: 'products.list',
      })
      expect(routeConfig!.procedure).toBe('products.list')
      expect(routeConfig!.pattern.test('products')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should NOT have DELETE /products/:id route (missing from router)', () => {
      expect(() => findRouteConfig('DELETE /products/:id')).toThrow()
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Products creation pattern should match 'products'
      const createConfig = findRouteConfig('POST /products')
      expect(createConfig!.pattern.test('products')).toBe(true)
      expect(createConfig!.pattern.test('products/id')).toBe(false)

      // Products get pattern should match 'products/abc123'
      const getConfig = findRouteConfig('GET /products/:id')
      expect(getConfig!.pattern.test('products/abc123')).toBe(true)
      expect(getConfig!.pattern.test('products')).toBe(false)
      expect(getConfig!.pattern.test('products/abc123/extra')).toBe(
        false
      )

      // Products edit pattern should match 'products/abc123'
      const updateConfig = findRouteConfig('PUT /products/:id')
      expect(updateConfig!.pattern.test('products/abc123')).toBe(true)
      expect(updateConfig!.pattern.test('products')).toBe(false)

      // Products list pattern should match 'products' only
      const listConfig = findRouteConfig('GET /products')
      expect(listConfig!.pattern.test('products')).toBe(true)
      expect(listConfig!.pattern.test('products/id')).toBe(false)
    })

    it('should extract correct matches from URL paths', () => {
      // Test Products get pattern extraction
      const getConfig = findRouteConfig('GET /products/:id')
      const getMatches = getConfig!.pattern.exec('products/test-id')
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test Products update pattern extraction
      const updateConfig = findRouteConfig('PUT /products/:id')
      const updateMatches = updateConfig!.pattern.exec(
        'products/test-id'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test Products list pattern (no captures)
      const listConfig = findRouteConfig('GET /products')
      const listMatches = listConfig!.pattern.exec('products')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test Products create pattern (no captures)
      const createConfig = findRouteConfig('POST /products')
      const createMatches = createConfig!.pattern.exec('products')
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for products get requests', () => {
      const routeConfig = findRouteConfig('GET /products/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['product-123'])

      expect(result).toEqual({
        id: 'product-123',
      })
    })

    it('should correctly map URL parameters and body for products edit requests', () => {
      const routeConfig = findRouteConfig('PUT /products/:id')
      const testBody = {
        product: {
          name: 'Updated Product',
          description: 'An updated test product',
          active: true,
        },
        price: {
          unitAmount: 2000,
          currency: 'usd',
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['product-456'], testBody)

      expect(result).toEqual({
        product: {
          name: 'Updated Product',
          description: 'An updated test product',
          active: true,
        },
        price: {
          unitAmount: 2000,
          currency: 'usd',
        },
        id: 'product-456',
      })
    })

    it('should return body for products create requests', () => {
      const routeConfig = findRouteConfig('POST /products')
      const testBody = {
        product: {
          name: 'New Product',
          description: 'A brand new product',
          active: true,
        },
        price: {
          unitAmount: 1500,
          currency: 'usd',
          intervalUnit: 'month',
        },
        featureIds: ['feature-1', 'feature-2'],
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for products list requests', () => {
      const routeConfig = findRouteConfig('GET /products')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /products/:id')

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams([
        'product%40company.com',
      ])
      expect(result1).toEqual({
        id: 'product%40company.com',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams(['product_123-abc'])
      expect(result2).toEqual({ id: 'product_123-abc' })
    })
  })

  describe('Route config completeness', () => {
    it('should have expected route configs (missing delete)', () => {
      const routeKeys = getAllRouteKeys()

      // Check that expected routes exist
      expect(routeKeys).toContain('POST /products') // create
      expect(routeKeys).toContain('PUT /products/:id') // update
      expect(routeKeys).toContain('GET /products/:id') // get
      expect(routeKeys).toContain('GET /products') // list

      // Check that delete route is missing (this is the noted issue)
      expect(routeKeys).not.toContain('DELETE /products/:id')

      // Check that we have exactly 4 routes (missing delete)
      expect(routeKeys).toHaveLength(4) // Only 4 routes, missing delete
    })

    it('should have consistent id parameter usage for existing id routes', () => {
      const idRoutes = ['PUT /products/:id', 'GET /products/:id']

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
      // Test all route configs from the object
      Object.entries(productsRouteConfigs).forEach(
        ([routeKey, config]) => {
          // Each config should have required properties
          validateRouteConfigStructure(config, 'products')
        }
      )
    })

    it('should map to correct TRPC procedures (for existing routes)', () => {
      const expectedMappings = {
        'POST /products': 'products.create',
        'PUT /products/:id': 'products.update',
        'GET /products/:id': 'products.get',
        'GET /products': 'products.list',
      }

      Object.entries(expectedMappings).forEach(
        ([routeKey, expectedProcedure]) => {
          const config = findRouteConfig(routeKey)
          expect(config!.procedure).toBe(expectedProcedure)
        }
      )
    })

    it('should use object spread syntax from trpcToRest utility', () => {
      // This test verifies that the router uses the trpcToRest utility function
      // and spreads the results into an object (as noted in the requirements)

      // All routes should be present as separate keys in the object
      const routeKeys = getAllRouteKeys()

      // Verify that we have the expected object structure
      expect(typeof productsRouteConfigs).toBe('object')
      expect(Array.isArray(productsRouteConfigs)).toBe(false)

      // Verify the routes are created using the trpcToRest pattern
      routeKeys.forEach((routeKey) => {
        const config = findRouteConfig(routeKey)
        expect(typeof config).toBe('object')
        expect(config).toHaveProperty('procedure')
        expect(config).toHaveProperty('pattern')
        expect(config).toHaveProperty('mapParams')
      })
    })
  })
})
