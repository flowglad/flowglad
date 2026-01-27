import { describe, expect, it } from 'bun:test'
import { apiKeysRouteConfigs } from './apiKeysRouter'
import {
  findRouteConfigInArray,
  getAllRouteKeysFromArray,
  validateRouteConfigStructure,
  validateStandardCrudMappings,
} from './routeConfigs.test-utils'

describe('apiKeysRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(apiKeysRouteConfigs, routeKey)
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(apiKeysRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /api-keys to apiKeys.create procedure', () => {
      const routeConfig = findRouteConfig('POST /api-keys')

      expect(routeConfig).toMatchObject({
        procedure: 'apiKeys.create',
      })
      expect(routeConfig!.procedure).toBe('apiKeys.create')
      expect(routeConfig!.pattern.test('api-keys')).toBe(true)

      // Test mapParams with body
      const testBody = { apiKey: { name: 'Test API Key' } }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /api-keys/:id to apiKeys.update procedure', () => {
      const routeConfig = findRouteConfig('PUT /api-keys/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'apiKeys.update',
      })
      expect(routeConfig!.procedure).toBe('apiKeys.update')
      expect(routeConfig!.pattern.test('api-keys/test-id')).toBe(true)

      // Test mapParams with matches and body (simulate route handler slicing)
      const testBody = { apiKey: { name: 'Updated API Key' } }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /api-keys/:id to apiKeys.get procedure', () => {
      const routeConfig = findRouteConfig('GET /api-keys/:id')

      expect(routeConfig).toMatchObject({ procedure: 'apiKeys.get' })
      expect(routeConfig!.procedure).toBe('apiKeys.get')
      expect(routeConfig!.pattern.test('api-keys/test-id')).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /api-keys to apiKeys.list procedure', () => {
      const routeConfig = findRouteConfig('GET /api-keys')

      expect(routeConfig).toMatchObject({ procedure: 'apiKeys.list' })
      expect(routeConfig!.procedure).toBe('apiKeys.list')
      expect(routeConfig!.pattern.test('api-keys')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should map DELETE /api-keys/:id to apiKeys.delete procedure', () => {
      const routeConfig = findRouteConfig('DELETE /api-keys/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'apiKeys.delete',
      })
      expect(routeConfig!.procedure).toBe('apiKeys.delete')
      expect(routeConfig!.pattern.test('api-keys/test-id')).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // API Keys creation pattern should match 'api-keys'
      const createConfig = findRouteConfig('POST /api-keys')
      expect(createConfig!.pattern.test('api-keys')).toBe(true)
      expect(createConfig!.pattern.test('api-keys/id')).toBe(false)

      // API Keys get pattern should match 'api-keys/abc123'
      const getConfig = findRouteConfig('GET /api-keys/:id')
      expect(getConfig!.pattern.test('api-keys/abc123')).toBe(true)
      expect(getConfig!.pattern.test('api-keys')).toBe(false)
      expect(getConfig!.pattern.test('api-keys/abc123/extra')).toBe(
        false
      )

      // API Keys edit pattern should match 'api-keys/abc123'
      const updateConfig = findRouteConfig('PUT /api-keys/:id')
      expect(updateConfig!.pattern.test('api-keys/abc123')).toBe(true)
      expect(updateConfig!.pattern.test('api-keys')).toBe(false)

      // API Keys delete pattern should match 'api-keys/abc123'
      const deleteConfig = findRouteConfig('DELETE /api-keys/:id')
      expect(deleteConfig!.pattern.test('api-keys/abc123')).toBe(true)
      expect(deleteConfig!.pattern.test('api-keys')).toBe(false)

      // API Keys list pattern should match 'api-keys' only
      const listConfig = findRouteConfig('GET /api-keys')
      expect(listConfig!.pattern.test('api-keys')).toBe(true)
      expect(listConfig!.pattern.test('api-keys/id')).toBe(false)
    })

    it('should extract correct matches from URL paths', () => {
      // Test API Keys get pattern extraction
      const getConfig = findRouteConfig('GET /api-keys/:id')
      const getMatches = getConfig!.pattern.exec('api-keys/test-id')
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test API Keys update pattern extraction
      const updateConfig = findRouteConfig('PUT /api-keys/:id')
      const updateMatches = updateConfig!.pattern.exec(
        'api-keys/test-id'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test API Keys delete pattern extraction
      const deleteConfig = findRouteConfig('DELETE /api-keys/:id')
      const deleteMatches = deleteConfig!.pattern.exec(
        'api-keys/test-id'
      )
      expect(typeof deleteMatches).toBe('object')
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test API Keys list pattern (no captures)
      const listConfig = findRouteConfig('GET /api-keys')
      const listMatches = listConfig!.pattern.exec('api-keys')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test API Keys create pattern (no captures)
      const createConfig = findRouteConfig('POST /api-keys')
      const createMatches = createConfig!.pattern.exec('api-keys')
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for API Keys get requests', () => {
      const routeConfig = findRouteConfig('GET /api-keys/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['api-key-123'])

      expect(result).toEqual({
        id: 'api-key-123',
      })
    })

    it('should correctly map URL parameters and body for API Keys edit requests', () => {
      const routeConfig = findRouteConfig('PUT /api-keys/:id')
      const testBody = {
        apiKey: {
          name: 'Updated API Key Name',
          type: 'SECRET',
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['api-key-456'], testBody)

      expect(result).toEqual({
        apiKey: {
          name: 'Updated API Key Name',
          type: 'SECRET',
        },
        id: 'api-key-456',
      })
    })

    it('should correctly map URL parameters for API Keys delete requests', () => {
      const routeConfig = findRouteConfig('DELETE /api-keys/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['api-key-789'])

      expect(result).toEqual({
        id: 'api-key-789',
      })
    })

    it('should return body for API Keys create requests', () => {
      const routeConfig = findRouteConfig('POST /api-keys')
      const testBody = {
        apiKey: {
          name: 'New API Key',
          type: 'SECRET',
        },
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for API Keys list requests', () => {
      const routeConfig = findRouteConfig('GET /api-keys')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /api-keys/:id')

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams(['key%40company.com'])
      expect(result1).toEqual({
        id: 'key%40company.com',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams(['api-key_123-abc'])
      expect(result2).toEqual({ id: 'api-key_123-abc' })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /api-keys') // create
      expect(routeKeys).toContain('PUT /api-keys/:id') // update
      expect(routeKeys).toContain('GET /api-keys/:id') // get
      expect(routeKeys).toContain('GET /api-keys') // list
      expect(routeKeys).toContain('DELETE /api-keys/:id') // delete

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(5) // Standard CRUD operations
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /api-keys/:id',
        'GET /api-keys/:id',
        'DELETE /api-keys/:id',
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
      apiKeysRouteConfigs.forEach((routeConfigObj) => {
        Object.entries(routeConfigObj).forEach(
          ([routeKey, config]) => {
            validateRouteConfigStructure(config, 'apiKeys')
          }
        )
      })
    })

    it('should map to correct TRPC procedures', () => {
      validateStandardCrudMappings(
        findRouteConfig,
        'api-keys',
        'apiKeys'
      )
    })
  })
})
