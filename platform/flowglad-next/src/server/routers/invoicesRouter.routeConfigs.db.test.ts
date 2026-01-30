import { describe, expect, it } from 'bun:test'
import { invoicesRouteConfigs } from './invoicesRouter'
import {
  findRouteConfigInArray,
  findRouteConfigInObject,
  getAllRouteKeysFromArray,
  getAllRouteKeysFromObject,
  validateRouteConfigStructure,
  validateStandardCrudMappings,
} from './routeConfigs.test-utils'

describe('invoicesRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(invoicesRouteConfigs, routeKey)
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(invoicesRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /invoices to invoices.create procedure', () => {
      const routeConfig = findRouteConfig('POST /invoices')

      expect(routeConfig).toMatchObject({
        procedure: 'invoices.create',
      })
      expect(routeConfig!.procedure).toBe('invoices.create')
      expect(routeConfig!.pattern.test('invoices')).toBe(true)

      // Test mapParams with body
      const testBody = {
        invoice: { amount: 10000, dueDate: '2024-12-31' },
      }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /invoices/:id to invoices.update procedure', () => {
      const routeConfig = findRouteConfig('PUT /invoices/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'invoices.update',
      })
      expect(routeConfig!.procedure).toBe('invoices.update')
      expect(routeConfig!.pattern.test('invoices/test-id')).toBe(true)

      // Test mapParams with matches and body
      const testBody = { invoice: { amount: 20000 } }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /invoices/:id to invoices.get procedure', () => {
      const routeConfig = findRouteConfig('GET /invoices/:id')

      expect(routeConfig).toMatchObject({ procedure: 'invoices.get' })
      expect(routeConfig!.procedure).toBe('invoices.get')
      expect(routeConfig!.pattern.test('invoices/test-id')).toBe(true)

      // Test mapParams with matches only
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /invoices to invoices.list procedure', () => {
      const routeConfig = findRouteConfig('GET /invoices')

      expect(routeConfig).toMatchObject({
        procedure: 'invoices.list',
      })
      expect(routeConfig!.procedure).toBe('invoices.list')
      expect(routeConfig!.pattern.test('invoices')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should map DELETE /invoices/:id to invoices.delete procedure', () => {
      const routeConfig = findRouteConfig('DELETE /invoices/:id')

      expect(routeConfig).toMatchObject({
        procedure: 'invoices.delete',
      })
      expect(routeConfig!.procedure).toBe('invoices.delete')
      expect(routeConfig!.pattern.test('invoices/test-id')).toBe(true)

      // Test mapParams with matches only
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Invoice creation pattern should match 'invoices'
      const createConfig = findRouteConfig('POST /invoices')
      expect(createConfig!.pattern.test('invoices')).toBe(true)
      expect(createConfig!.pattern.test('invoices/id')).toBe(false)

      // Invoice get pattern should match 'invoices/abc123'
      const getConfig = findRouteConfig('GET /invoices/:id')
      expect(getConfig!.pattern.test('invoices/abc123')).toBe(true)
      expect(getConfig!.pattern.test('invoices')).toBe(false)
      expect(getConfig!.pattern.test('invoices/abc123/extra')).toBe(
        false
      )

      // Invoice update pattern should match 'invoices/abc123'
      const updateConfig = findRouteConfig('PUT /invoices/:id')
      expect(updateConfig!.pattern.test('invoices/abc123')).toBe(true)
      expect(updateConfig!.pattern.test('invoices')).toBe(false)

      // Invoice delete pattern should match 'invoices/abc123'
      const deleteConfig = findRouteConfig('DELETE /invoices/:id')
      expect(deleteConfig!.pattern.test('invoices/abc123')).toBe(true)
      expect(deleteConfig!.pattern.test('invoices')).toBe(false)

      // Invoice list pattern should match 'invoices' only
      const listConfig = findRouteConfig('GET /invoices')
      expect(listConfig!.pattern.test('invoices')).toBe(true)
      expect(listConfig!.pattern.test('invoices/id')).toBe(false)
    })

    it('should extract correct matches from URL paths', () => {
      // Test invoice get pattern extraction
      const getConfig = findRouteConfig('GET /invoices/:id')
      const getMatches = getConfig!.pattern.exec('invoices/test-id')
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test invoice update pattern extraction
      const updateConfig = findRouteConfig('PUT /invoices/:id')
      const updateMatches = updateConfig!.pattern.exec(
        'invoices/test-id'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test invoice delete pattern extraction
      const deleteConfig = findRouteConfig('DELETE /invoices/:id')
      const deleteMatches = deleteConfig!.pattern.exec(
        'invoices/test-id'
      )
      expect(typeof deleteMatches).toBe('object')
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test invoice list pattern (no captures)
      const listConfig = findRouteConfig('GET /invoices')
      const listMatches = listConfig!.pattern.exec('invoices')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test invoice create pattern (no captures)
      const createConfig = findRouteConfig('POST /invoices')
      const createMatches = createConfig!.pattern.exec('invoices')
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for invoice get requests', () => {
      const routeConfig = findRouteConfig('GET /invoices/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['inv_123'])

      expect(result).toEqual({
        id: 'inv_123',
      })
    })

    it('should correctly map URL parameters and body for invoice update requests', () => {
      const routeConfig = findRouteConfig('PUT /invoices/:id')
      const testBody = {
        amount: 30000,
        status: 'paid',
        paidAt: '2024-01-15',
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['inv_456'], testBody)

      expect(result).toEqual({
        amount: 30000,
        status: 'paid',
        paidAt: '2024-01-15',
        id: 'inv_456',
      })
    })

    it('should correctly map URL parameters for invoice delete requests', () => {
      const routeConfig = findRouteConfig('DELETE /invoices/:id')

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['inv_789'])

      expect(result).toEqual({
        id: 'inv_789',
      })
    })

    it('should return body for invoice create requests', () => {
      const routeConfig = findRouteConfig('POST /invoices')
      const testBody = {
        customerId: 'cus_123',
        amount: 50000,
        dueDate: '2024-12-31',
        items: [
          { description: 'Service A', amount: 30000 },
          { description: 'Service B', amount: 20000 },
        ],
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for invoice list requests', () => {
      const routeConfig = findRouteConfig('GET /invoices')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /invoices/:id')

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams(['inv%40123'])
      expect(result1).toEqual({
        id: 'inv%40123',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams(['inv_123-abc'])
      expect(result2).toEqual({ id: 'inv_123-abc' })

      // Test with alphanumeric IDs
      const result3 = routeConfig!.mapParams(['INV2024001'])
      expect(result3).toEqual({ id: 'INV2024001' })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /invoices') // create
      expect(routeKeys).toContain('PUT /invoices/:id') // update
      expect(routeKeys).toContain('GET /invoices/:id') // get
      expect(routeKeys).toContain('GET /invoices') // list
      expect(routeKeys).toContain('DELETE /invoices/:id') // delete

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(5) // Standard CRUD operations
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /invoices/:id',
        'GET /invoices/:id',
        'DELETE /invoices/:id',
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
      invoicesRouteConfigs.forEach((routeConfigObj) => {
        Object.entries(routeConfigObj).forEach(
          ([routeKey, config]) => {
            // Each config should have required properties
            validateRouteConfigStructure(config, 'invoices')
          }
        )
      })
    })

    it('should map to correct TRPC procedures', () => {
      validateStandardCrudMappings(
        findRouteConfig,
        'invoices',
        'invoices'
      )
    })
  })
})
