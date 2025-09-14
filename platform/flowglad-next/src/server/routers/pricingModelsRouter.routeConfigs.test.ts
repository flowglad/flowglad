import { describe, it, expect } from 'vitest'
import {
  pricingModelsRouteConfigs,
  getDefaultPricingModelRouteConfig,
} from './pricingModelsRouter'
import {
  findRouteConfigInArray,
  getAllRouteKeysFromArray,
  validateRouteConfigStructure,
  validateStandardCrudMappings,
} from './routeConfigs.test-utils'

describe('pricingModelsRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(pricingModelsRouteConfigs, routeKey)
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(pricingModelsRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /pricing-models to pricingModels.create procedure', () => {
      const routeConfig = findRouteConfig('POST /pricing-models')

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('pricingModels.create')
      expect(routeConfig!.pattern.test('pricing-models')).toBe(true)

      // Test mapParams with body
      const testBody = {
        pricingModel: {
          name: 'Test Pricing Model',
          description: 'A test pricing model',
        },
      }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /pricing-models/:id to pricingModels.update procedure', () => {
      const routeConfig = findRouteConfig('PUT /pricing-models/:id')

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('pricingModels.update')
      expect(
        routeConfig!.pattern.test('pricing-models/test-id')
      ).toBe(true)

      // Test mapParams with matches and body (simulate route handler slicing)
      const testBody = {
        pricingModel: {
          name: 'Updated Pricing Model',
          description: 'An updated pricing model',
        },
      }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /pricing-models/:id to pricingModels.get procedure', () => {
      const routeConfig = findRouteConfig('GET /pricing-models/:id')

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('pricingModels.get')
      expect(
        routeConfig!.pattern.test('pricing-models/test-id')
      ).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /pricing-models to pricingModels.list procedure', () => {
      const routeConfig = findRouteConfig('GET /pricing-models')

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('pricingModels.list')
      expect(routeConfig!.pattern.test('pricing-models')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should map DELETE /pricing-models/:id to pricingModels.delete procedure', () => {
      const routeConfig = findRouteConfig(
        'DELETE /pricing-models/:id'
      )

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('pricingModels.delete')
      expect(
        routeConfig!.pattern.test('pricing-models/test-id')
      ).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Custom routes', () => {
    it('should map GET /pricing-models/default to pricingModels.getDefault procedure', () => {
      const routeConfig =
        getDefaultPricingModelRouteConfig[
          'GET /pricing-models/default'
        ]

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('pricingModels.getDefault')
      expect(
        routeConfig!.pattern.test('pricing-models/default')
      ).toBe(true)

      // NOTE: This test exposes a potential bug in the mapParams function
      // The pattern doesn't have capture groups but mapParams tries to access matches[0]
      // This should probably return undefined or an empty object instead
      const result = routeConfig!.mapParams([])
      expect(result).toEqual({ externalId: undefined })

      // Test with actual matches array (what would happen in real usage)
      const resultWithMatches = routeConfig!.mapParams([
        'pricing-models/default',
      ])
      expect(resultWithMatches).toEqual({
        externalId: 'pricing-models/default',
      })
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Pricing Models creation pattern should match 'pricing-models'
      const createConfig = findRouteConfig('POST /pricing-models')
      expect(createConfig!.pattern.test('pricing-models')).toBe(true)
      expect(createConfig!.pattern.test('pricing-models/id')).toBe(
        false
      )

      // Pricing Models get pattern should match 'pricing-models/abc123'
      const getConfig = findRouteConfig('GET /pricing-models/:id')
      expect(getConfig!.pattern.test('pricing-models/abc123')).toBe(
        true
      )
      expect(getConfig!.pattern.test('pricing-models')).toBe(false)
      expect(
        getConfig!.pattern.test('pricing-models/abc123/extra')
      ).toBe(false)

      // Pricing Models edit pattern should match 'pricing-models/abc123'
      const updateConfig = findRouteConfig('PUT /pricing-models/:id')
      expect(
        updateConfig!.pattern.test('pricing-models/abc123')
      ).toBe(true)
      expect(updateConfig!.pattern.test('pricing-models')).toBe(false)

      // Pricing Models delete pattern should match 'pricing-models/abc123'
      const deleteConfig = findRouteConfig(
        'DELETE /pricing-models/:id'
      )
      expect(
        deleteConfig!.pattern.test('pricing-models/abc123')
      ).toBe(true)
      expect(deleteConfig!.pattern.test('pricing-models')).toBe(false)

      // Pricing Models list pattern should match 'pricing-models' only
      const listConfig = findRouteConfig('GET /pricing-models')
      expect(listConfig!.pattern.test('pricing-models')).toBe(true)
      expect(listConfig!.pattern.test('pricing-models/id')).toBe(
        false
      )

      // Default pricing models pattern should match 'pricing-models/default' only
      const defaultConfig =
        getDefaultPricingModelRouteConfig[
          'GET /pricing-models/default'
        ]
      expect(
        defaultConfig!.pattern.test('pricing-models/default')
      ).toBe(true)
      expect(defaultConfig!.pattern.test('pricing-models')).toBe(
        false
      )
      expect(
        defaultConfig!.pattern.test('pricing-models/default/extra')
      ).toBe(false)
    })

    it('should extract correct matches from URL paths', () => {
      // Test Pricing Models get pattern extraction
      const getConfig = findRouteConfig('GET /pricing-models/:id')
      const getMatches = getConfig!.pattern.exec(
        'pricing-models/test-id'
      )
      expect(getMatches).not.toBeNull()
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test Pricing Models update pattern extraction
      const updateConfig = findRouteConfig('PUT /pricing-models/:id')
      const updateMatches = updateConfig!.pattern.exec(
        'pricing-models/test-id'
      )
      expect(updateMatches).not.toBeNull()
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test Pricing Models delete pattern extraction
      const deleteConfig = findRouteConfig(
        'DELETE /pricing-models/:id'
      )
      const deleteMatches = deleteConfig!.pattern.exec(
        'pricing-models/test-id'
      )
      expect(deleteMatches).not.toBeNull()
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test Pricing Models list pattern (no captures)
      const listConfig = findRouteConfig('GET /pricing-models')
      const listMatches = listConfig!.pattern.exec('pricing-models')
      expect(listMatches).not.toBeNull()
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test Pricing Models create pattern (no captures)
      const createConfig = findRouteConfig('POST /pricing-models')
      const createMatches =
        createConfig!.pattern.exec('pricing-models')
      expect(createMatches).not.toBeNull()
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test default pricing models pattern (no captures - this reveals the bug)
      const defaultConfig =
        getDefaultPricingModelRouteConfig[
          'GET /pricing-models/default'
        ]
      const defaultMatches = defaultConfig!.pattern.exec(
        'pricing-models/default'
      )
      expect(defaultMatches).not.toBeNull()
      expect(defaultMatches!.length).toBe(1) // Only the full match, no capture groups - this is the bug!
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for pricing models get requests', () => {
      const routeConfig = findRouteConfig('GET /pricing-models/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['pricing-model-123'])

      expect(result).toEqual({
        id: 'pricing-model-123',
      })
    })

    it('should correctly map URL parameters and body for pricing models edit requests', () => {
      const routeConfig = findRouteConfig('PUT /pricing-models/:id')
      const testBody = {
        pricingModel: {
          name: 'Updated Pricing Model',
          description: 'An updated test pricing model',
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(
        ['pricing-model-456'],
        testBody
      )

      expect(result).toEqual({
        pricingModel: {
          name: 'Updated Pricing Model',
          description: 'An updated test pricing model',
        },
        id: 'pricing-model-456',
      })
    })

    it('should correctly map URL parameters for pricing models delete requests', () => {
      const routeConfig = findRouteConfig(
        'DELETE /pricing-models/:id'
      )

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['pricing-model-789'])

      expect(result).toEqual({
        id: 'pricing-model-789',
      })
    })

    it('should return body for pricing models create requests', () => {
      const routeConfig = findRouteConfig('POST /pricing-models')
      const testBody = {
        pricingModel: {
          name: 'New Pricing Model',
          description: 'A brand new pricing model',
        },
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for pricing models list requests', () => {
      const routeConfig = findRouteConfig('GET /pricing-models')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /pricing-models/:id')

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams([
        'pricing-model%40company.com',
      ])
      expect(result1).toEqual({
        id: 'pricing-model%40company.com',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams([
        'pricing-model_123-abc',
      ])
      expect(result2).toEqual({ id: 'pricing-model_123-abc' })
    })

    it('should handle mapParams for default pricing model route (exposes bug)', () => {
      const routeConfig =
        getDefaultPricingModelRouteConfig[
          'GET /pricing-models/default'
        ]

      // This test exposes the bug: no capture groups but tries to access matches[0]
      // With an empty matches array, this returns undefined for externalId
      const result1 = routeConfig!.mapParams([])
      expect(result1).toEqual({ externalId: undefined })

      // With a matches array, it incorrectly uses the full match as externalId
      // This is probably not the intended behavior
      const result2 = routeConfig!.mapParams([
        'pricing-models/default',
      ])
      expect(result2).toEqual({
        externalId: 'pricing-models/default',
      })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /pricing-models') // create
      expect(routeKeys).toContain('PUT /pricing-models/:id') // update
      expect(routeKeys).toContain('GET /pricing-models/:id') // get
      expect(routeKeys).toContain('GET /pricing-models') // list
      expect(routeKeys).toContain('DELETE /pricing-models/:id') // delete

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(5) // Standard CRUD operations
    })

    it('should have the custom default route config', () => {
      const defaultRouteKeys = Object.keys(
        getDefaultPricingModelRouteConfig
      )

      expect(defaultRouteKeys).toContain(
        'GET /pricing-models/default'
      )
      expect(defaultRouteKeys).toHaveLength(1) // Only one custom route
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /pricing-models/:id',
        'GET /pricing-models/:id',
        'DELETE /pricing-models/:id',
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
      pricingModelsRouteConfigs.forEach((routeConfigObj) => {
        Object.entries(routeConfigObj).forEach(
          ([routeKey, config]) => {
            // Each config should have required properties
            validateRouteConfigStructure(config, 'pricingModels')
          }
        )
      })

      // Test the custom default route config
      Object.entries(getDefaultPricingModelRouteConfig).forEach(
        ([routeKey, config]) => {
          // Each config should have required properties
          validateRouteConfigStructure(config, 'pricingModels')
        }
      )
    })

    it('should map to correct TRPC procedures', () => {
      const expectedMappings = {
        'POST /pricing-models': 'pricingModels.create',
        'PUT /pricing-models/:id': 'pricingModels.update',
        'GET /pricing-models/:id': 'pricingModels.get',
        'GET /pricing-models': 'pricingModels.list',
        'DELETE /pricing-models/:id': 'pricingModels.delete',
      }

      Object.entries(expectedMappings).forEach(
        ([routeKey, expectedProcedure]) => {
          const config = findRouteConfig(routeKey)
          expect(config!.procedure).toBe(expectedProcedure)
        }
      )

      // Test custom route mapping
      const defaultConfig =
        getDefaultPricingModelRouteConfig[
          'GET /pricing-models/default'
        ]
      expect(defaultConfig!.procedure).toBe(
        'pricingModels.getDefault'
      )
    })
  })
})
