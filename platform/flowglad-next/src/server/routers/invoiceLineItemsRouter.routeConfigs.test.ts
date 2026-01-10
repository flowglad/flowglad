import { describe, expect, it } from 'vitest'
import { invoiceLineItemsRouteConfigs } from './invoiceLineItemsRouter'
import {
  findRouteConfigInArray,
  getAllRouteKeysFromArray,
  validateRouteConfigStructure,
  validateStandardCrudMappings,
} from './routeConfigs.test-utils'

describe('invoiceLineItemsRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(
      invoiceLineItemsRouteConfigs,
      routeKey
    )
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(invoiceLineItemsRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /invoice-line-items to invoiceLineItems.create procedure', () => {
      const routeConfig = findRouteConfig('POST /invoice-line-items')

      expect(routeConfig).toMatchObject({
        procedure: 'invoiceLineItems.create',
      })
      expect(routeConfig!.procedure).toBe('invoiceLineItems.create')
      expect(routeConfig!.pattern.test('invoice-line-items')).toBe(
        true
      )

      // Test mapParams with body
      const testBody = {
        lineItem: { amount: 1000, description: 'Test Item' },
      }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /invoice-line-items/:id to invoiceLineItems.update procedure', () => {
      const routeConfig = findRouteConfig(
        'PUT /invoice-line-items/:id'
      )

      expect(routeConfig).toMatchObject({
        procedure: 'invoiceLineItems.update',
      })
      expect(routeConfig!.procedure).toBe('invoiceLineItems.update')
      expect(
        routeConfig!.pattern.test('invoice-line-items/test-id')
      ).toBe(true)

      // Test mapParams with matches and body
      const testBody = { lineItem: { amount: 2000 } }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /invoice-line-items/:id to invoiceLineItems.get procedure', () => {
      const routeConfig = findRouteConfig(
        'GET /invoice-line-items/:id'
      )

      expect(routeConfig).toMatchObject({
        procedure: 'invoiceLineItems.get',
      })
      expect(routeConfig!.procedure).toBe('invoiceLineItems.get')
      expect(
        routeConfig!.pattern.test('invoice-line-items/test-id')
      ).toBe(true)

      // Test mapParams with matches only
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /invoice-line-items to invoiceLineItems.list procedure', () => {
      const routeConfig = findRouteConfig('GET /invoice-line-items')

      expect(routeConfig).toMatchObject({
        procedure: 'invoiceLineItems.list',
      })
      expect(routeConfig!.procedure).toBe('invoiceLineItems.list')
      expect(routeConfig!.pattern.test('invoice-line-items')).toBe(
        true
      )

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should map DELETE /invoice-line-items/:id to invoiceLineItems.delete procedure', () => {
      const routeConfig = findRouteConfig(
        'DELETE /invoice-line-items/:id'
      )

      expect(routeConfig).toMatchObject({
        procedure: 'invoiceLineItems.delete',
      })
      expect(routeConfig!.procedure).toBe('invoiceLineItems.delete')
      expect(
        routeConfig!.pattern.test('invoice-line-items/test-id')
      ).toBe(true)

      // Test mapParams with matches only
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Invoice line item creation pattern should match 'invoice-line-items'
      const createConfig = findRouteConfig('POST /invoice-line-items')
      expect(createConfig!.pattern.test('invoice-line-items')).toBe(
        true
      )
      expect(
        createConfig!.pattern.test('invoice-line-items/id')
      ).toBe(false)

      // Invoice line item get pattern should match 'invoice-line-items/abc123'
      const getConfig = findRouteConfig('GET /invoice-line-items/:id')
      expect(
        getConfig!.pattern.test('invoice-line-items/abc123')
      ).toBe(true)
      expect(getConfig!.pattern.test('invoice-line-items')).toBe(
        false
      )
      expect(
        getConfig!.pattern.test('invoice-line-items/abc123/extra')
      ).toBe(false)

      // Invoice line item update pattern should match 'invoice-line-items/abc123'
      const updateConfig = findRouteConfig(
        'PUT /invoice-line-items/:id'
      )
      expect(
        updateConfig!.pattern.test('invoice-line-items/abc123')
      ).toBe(true)
      expect(updateConfig!.pattern.test('invoice-line-items')).toBe(
        false
      )

      // Invoice line item delete pattern should match 'invoice-line-items/abc123'
      const deleteConfig = findRouteConfig(
        'DELETE /invoice-line-items/:id'
      )
      expect(
        deleteConfig!.pattern.test('invoice-line-items/abc123')
      ).toBe(true)
      expect(deleteConfig!.pattern.test('invoice-line-items')).toBe(
        false
      )

      // Invoice line item list pattern should match 'invoice-line-items' only
      const listConfig = findRouteConfig('GET /invoice-line-items')
      expect(listConfig!.pattern.test('invoice-line-items')).toBe(
        true
      )
      expect(listConfig!.pattern.test('invoice-line-items/id')).toBe(
        false
      )
    })

    it('should extract correct matches from URL paths', () => {
      // Test invoice line item get pattern extraction
      const getConfig = findRouteConfig('GET /invoice-line-items/:id')
      const getMatches = getConfig!.pattern.exec(
        'invoice-line-items/test-id'
      )
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test invoice line item update pattern extraction
      const updateConfig = findRouteConfig(
        'PUT /invoice-line-items/:id'
      )
      const updateMatches = updateConfig!.pattern.exec(
        'invoice-line-items/test-id'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test invoice line item delete pattern extraction
      const deleteConfig = findRouteConfig(
        'DELETE /invoice-line-items/:id'
      )
      const deleteMatches = deleteConfig!.pattern.exec(
        'invoice-line-items/test-id'
      )
      expect(typeof deleteMatches).toBe('object')
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test invoice line item list pattern (no captures)
      const listConfig = findRouteConfig('GET /invoice-line-items')
      const listMatches = listConfig!.pattern.exec(
        'invoice-line-items'
      )
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test invoice line item create pattern (no captures)
      const createConfig = findRouteConfig('POST /invoice-line-items')
      const createMatches = createConfig!.pattern.exec(
        'invoice-line-items'
      )
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for invoice line item get requests', () => {
      const routeConfig = findRouteConfig(
        'GET /invoice-line-items/:id'
      )

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['ili_123'])

      expect(result).toEqual({
        id: 'ili_123',
      })
    })

    it('should correctly map URL parameters and body for invoice line item update requests', () => {
      const routeConfig = findRouteConfig(
        'PUT /invoice-line-items/:id'
      )
      const testBody = {
        amount: 3000,
        description: 'Updated Line Item',
        quantity: 2,
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['ili_456'], testBody)

      expect(result).toEqual({
        amount: 3000,
        description: 'Updated Line Item',
        quantity: 2,
        id: 'ili_456',
      })
    })

    it('should correctly map URL parameters for invoice line item delete requests', () => {
      const routeConfig = findRouteConfig(
        'DELETE /invoice-line-items/:id'
      )

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['ili_789'])

      expect(result).toEqual({
        id: 'ili_789',
      })
    })

    it('should return body for invoice line item create requests', () => {
      const routeConfig = findRouteConfig('POST /invoice-line-items')
      const testBody = {
        invoiceId: 'inv_123',
        amount: 5000,
        description: 'New Line Item',
        quantity: 1,
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for invoice line item list requests', () => {
      const routeConfig = findRouteConfig('GET /invoice-line-items')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig(
        'GET /invoice-line-items/:id'
      )

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams(['ili%40123'])
      expect(result1).toEqual({
        id: 'ili%40123',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams(['ili_123-abc'])
      expect(result2).toEqual({ id: 'ili_123-abc' })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /invoice-line-items') // create
      expect(routeKeys).toContain('PUT /invoice-line-items/:id') // update
      expect(routeKeys).toContain('GET /invoice-line-items/:id') // get
      expect(routeKeys).toContain('GET /invoice-line-items') // list
      expect(routeKeys).toContain('DELETE /invoice-line-items/:id') // delete

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(5) // Standard CRUD operations
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /invoice-line-items/:id',
        'GET /invoice-line-items/:id',
        'DELETE /invoice-line-items/:id',
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
      invoiceLineItemsRouteConfigs.forEach((routeConfigObj) => {
        Object.entries(routeConfigObj).forEach(
          ([routeKey, config]) => {
            validateRouteConfigStructure(config, 'invoiceLineItems')
          }
        )
      })
    })

    it('should map to correct TRPC procedures', () => {
      validateStandardCrudMappings(
        findRouteConfig,
        'invoice-line-items',
        'invoiceLineItems'
      )
    })
  })
})
