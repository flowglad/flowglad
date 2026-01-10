import { describe, expect, it } from 'vitest'
import {
  findRouteConfigInArray,
  findRouteConfigInObject,
  getAllRouteKeysFromArray,
  getAllRouteKeysFromObject,
  validateRouteConfigStructure,
  validateStandardCrudMappings,
} from './routeConfigs.test-utils'
import { webhooksRouteConfigs } from './webhooksRouter'

describe('webhooksRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(webhooksRouteConfigs, routeKey)
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(webhooksRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /webhooks to webhooks.create procedure', () => {
      const routeConfig = findRouteConfig('POST /webhooks')

      expect(routeConfig).toMatchObject({
        procedure: 'webhooks.create',
      })
      expect(routeConfig!.procedure).toBe('webhooks.create')
      expect(routeConfig!.pattern.test('webhooks')).toBe(true)

      // Test mapParams with body
      const testBody = {
        webhook: {
          url: 'https://example.com/webhook',
          events: ['payment.succeeded'],
        },
      }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /webhooks/:id to webhooks.update procedure', () => {
      const routeConfig = findRouteConfig('PUT /webhooks/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'webhooks.update',
      })
      expect(routeConfig!.procedure).toBe('webhooks.update')
      expect(routeConfig!.pattern.test('webhooks/test-id')).toBe(true)

      // Test mapParams with matches and body (simulate route handler slicing)
      const testBody = {
        webhook: {
          url: 'https://updated.com/webhook',
          active: false,
        },
      }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /webhooks/:id to webhooks.get procedure', () => {
      const routeConfig = findRouteConfig('GET /webhooks/:id')

      expect(routeConfig).toMatchObject({ procedure: 'webhooks.get' })
      expect(routeConfig!.procedure).toBe('webhooks.get')
      expect(routeConfig!.pattern.test('webhooks/test-id')).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /webhooks to webhooks.list procedure', () => {
      const routeConfig = findRouteConfig('GET /webhooks')

      expect(routeConfig).toMatchObject({
        procedure: 'webhooks.list',
      })
      expect(routeConfig!.procedure).toBe('webhooks.list')
      expect(routeConfig!.pattern.test('webhooks')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should map DELETE /webhooks/:id to webhooks.delete procedure', () => {
      const routeConfig = findRouteConfig('DELETE /webhooks/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'webhooks.delete',
      })
      expect(routeConfig!.procedure).toBe('webhooks.delete')
      expect(routeConfig!.pattern.test('webhooks/test-id')).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Webhooks creation pattern should match 'webhooks'
      const createConfig = findRouteConfig('POST /webhooks')
      expect(createConfig!.pattern.test('webhooks')).toBe(true)
      expect(createConfig!.pattern.test('webhooks/id')).toBe(false)

      // Webhooks get pattern should match 'webhooks/abc123'
      const getConfig = findRouteConfig('GET /webhooks/:id')
      expect(getConfig!.pattern.test('webhooks/abc123')).toBe(true)
      expect(getConfig!.pattern.test('webhooks')).toBe(false)
      expect(getConfig!.pattern.test('webhooks/abc123/extra')).toBe(
        false
      )

      // Webhooks edit pattern should match 'webhooks/abc123'
      const updateConfig = findRouteConfig('PUT /webhooks/:id')
      expect(updateConfig!.pattern.test('webhooks/abc123')).toBe(true)
      expect(updateConfig!.pattern.test('webhooks')).toBe(false)

      // Webhooks delete pattern should match 'webhooks/abc123'
      const deleteConfig = findRouteConfig('DELETE /webhooks/:id')
      expect(deleteConfig!.pattern.test('webhooks/abc123')).toBe(true)
      expect(deleteConfig!.pattern.test('webhooks')).toBe(false)

      // Webhooks list pattern should match 'webhooks' only
      const listConfig = findRouteConfig('GET /webhooks')
      expect(listConfig!.pattern.test('webhooks')).toBe(true)
      expect(listConfig!.pattern.test('webhooks/id')).toBe(false)
    })

    it('should extract correct matches from URL paths', () => {
      // Test Webhooks get pattern extraction
      const getConfig = findRouteConfig('GET /webhooks/:id')
      const getMatches = getConfig!.pattern.exec('webhooks/test-id')
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test Webhooks update pattern extraction
      const updateConfig = findRouteConfig('PUT /webhooks/:id')
      const updateMatches = updateConfig!.pattern.exec(
        'webhooks/test-id'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test Webhooks delete pattern extraction
      const deleteConfig = findRouteConfig('DELETE /webhooks/:id')
      const deleteMatches = deleteConfig!.pattern.exec(
        'webhooks/test-id'
      )
      expect(typeof deleteMatches).toBe('object')
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test Webhooks list pattern (no captures)
      const listConfig = findRouteConfig('GET /webhooks')
      const listMatches = listConfig!.pattern.exec('webhooks')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test Webhooks create pattern (no captures)
      const createConfig = findRouteConfig('POST /webhooks')
      const createMatches = createConfig!.pattern.exec('webhooks')
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for Webhooks get requests', () => {
      const routeConfig = findRouteConfig('GET /webhooks/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['webhook-123'])

      expect(result).toEqual({
        id: 'webhook-123',
      })
    })

    it('should correctly map URL parameters and body for Webhooks edit requests', () => {
      const routeConfig = findRouteConfig('PUT /webhooks/:id')
      const testBody = {
        webhook: {
          url: 'https://updated-webhook.com/endpoint',
          events: ['subscription.created', 'subscription.updated'],
          active: true,
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['webhook-456'], testBody)

      expect(result).toEqual({
        webhook: {
          url: 'https://updated-webhook.com/endpoint',
          events: ['subscription.created', 'subscription.updated'],
          active: true,
        },
        id: 'webhook-456',
      })
    })

    it('should correctly map URL parameters for Webhooks delete requests', () => {
      const routeConfig = findRouteConfig('DELETE /webhooks/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['webhook-789'])

      expect(result).toEqual({
        id: 'webhook-789',
      })
    })

    it('should return body for Webhooks create requests', () => {
      const routeConfig = findRouteConfig('POST /webhooks')
      const testBody = {
        webhook: {
          url: 'https://new-webhook.com/endpoint',
          events: ['payment.succeeded', 'payment.failed'],
          active: true,
        },
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for Webhooks list requests', () => {
      const routeConfig = findRouteConfig('GET /webhooks')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /webhooks/:id')

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams([
        'webhook%40company.com',
      ])
      expect(result1).toEqual({
        id: 'webhook%40company.com',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams(['webhook_123-abc'])
      expect(result2).toEqual({ id: 'webhook_123-abc' })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /webhooks') // create
      expect(routeKeys).toContain('PUT /webhooks/:id') // update
      expect(routeKeys).toContain('GET /webhooks/:id') // get
      expect(routeKeys).toContain('GET /webhooks') // list
      expect(routeKeys).toContain('DELETE /webhooks/:id') // delete

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(5) // Standard CRUD operations
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /webhooks/:id',
        'GET /webhooks/:id',
        'DELETE /webhooks/:id',
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
      webhooksRouteConfigs.forEach((routeConfigObj) => {
        Object.entries(routeConfigObj).forEach(
          ([routeKey, config]) => {
            // Each config should have required properties
            validateRouteConfigStructure(config, 'webhooks')
          }
        )
      })
    })

    it('should map to correct TRPC procedures', () => {
      validateStandardCrudMappings(
        findRouteConfig,
        'webhooks',
        'webhooks'
      )
    })
  })
})
