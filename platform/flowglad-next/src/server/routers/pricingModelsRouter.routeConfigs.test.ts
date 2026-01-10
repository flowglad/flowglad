import { describe, expect, it } from 'vitest'
import {
  getDefaultPricingModelRouteConfig,
  pricingModelsRouteConfigs,
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

      expect(routeConfig).toMatchObject({
        procedure: 'pricingModels.create',
      })
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

      expect(routeConfig).toMatchObject({
        procedure: 'pricingModels.update',
      })
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

      expect(routeConfig).toMatchObject({
        procedure: 'pricingModels.get',
      })
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

      expect(routeConfig).toMatchObject({
        procedure: 'pricingModels.list',
      })
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

      expect(routeConfig).toMatchObject({
        procedure: 'pricingModels.delete',
      })
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

      expect(routeConfig).toMatchObject({
        procedure: 'pricingModels.getDefault',
      })
      expect(routeConfig!.procedure).toBe('pricingModels.getDefault')
      expect(
        routeConfig!.pattern.test('pricing-models/default')
      ).toBe(true)

      // BUG: This test exposes a bug in the mapParams implementation.
      // The route pattern /^pricing-models\/default$/ has no capture groups,
      // but mapParams tries to access matches[0].
      //
      // Current buggy behavior:
      const result = routeConfig!.mapParams([])
      expect(result).toEqual({ externalId: undefined })

      // With actual matches array, it incorrectly uses the full match
      const resultWithMatches = routeConfig!.mapParams([
        'pricing-models/default',
      ])
      expect(resultWithMatches).toEqual({
        externalId: 'pricing-models/default',
      })

      // EXPECTED BEHAVIOR: Since this is a static route with no parameters,
      // and the pricingModels.getDefault procedure expects no arguments,
      // mapParams should return undefined:
      // expect(routeConfig!.mapParams([])).toBeUndefined()
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
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test Pricing Models update pattern extraction
      const updateConfig = findRouteConfig('PUT /pricing-models/:id')
      const updateMatches = updateConfig!.pattern.exec(
        'pricing-models/test-id'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test Pricing Models delete pattern extraction
      const deleteConfig = findRouteConfig(
        'DELETE /pricing-models/:id'
      )
      const deleteMatches = deleteConfig!.pattern.exec(
        'pricing-models/test-id'
      )
      expect(typeof deleteMatches).toBe('object')
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test Pricing Models list pattern (no captures)
      const listConfig = findRouteConfig('GET /pricing-models')
      const listMatches = listConfig!.pattern.exec('pricing-models')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test Pricing Models create pattern (no captures)
      const createConfig = findRouteConfig('POST /pricing-models')
      const createMatches =
        createConfig!.pattern.exec('pricing-models')
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test default pricing models pattern (no captures - this reveals the bug)
      const defaultConfig =
        getDefaultPricingModelRouteConfig[
          'GET /pricing-models/default'
        ]
      const defaultMatches = defaultConfig!.pattern.exec(
        'pricing-models/default'
      )
      expect(defaultMatches).toMatchObject({ length: 1 })
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

    it('should handle mapParams for default pricing model route (documents bug)', () => {
      const routeConfig =
        getDefaultPricingModelRouteConfig[
          'GET /pricing-models/default'
        ]

      // BUG DOCUMENTATION:
      // The implementation in pricingModelsRouter.ts has a bug where mapParams
      // attempts to read matches[0] for a static route with no capture groups.
      // The regex pattern /^pricing-models\/default$/ has no parentheses for captures.
      //
      // CURRENT BUGGY BEHAVIOR:
      // - With empty matches: returns { externalId: undefined }
      // - With matches array: incorrectly uses full match as externalId
      const result1 = routeConfig!.mapParams([])
      expect(result1).toEqual({ externalId: undefined })

      const result2 = routeConfig!.mapParams([
        'pricing-models/default',
      ])
      expect(result2).toEqual({
        externalId: 'pricing-models/default',
      })

      // CORRECT BEHAVIOR:
      // Since pricingModels.getDefault expects no arguments and this is a static route,
      // mapParams should return undefined:
      //
      // const correctImplementation = () => undefined
      // expect(correctImplementation()).toBeUndefined()
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
      validateStandardCrudMappings(
        findRouteConfig,
        'pricing-models',
        'pricingModels'
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
