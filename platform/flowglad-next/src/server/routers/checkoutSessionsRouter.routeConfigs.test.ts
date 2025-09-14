import { describe, it, expect } from 'vitest'
import { checkoutSessionsRouteConfigs } from './checkoutSessionsRouter'
import {
  findRouteConfigInArray,
  getAllRouteKeysFromArray,
  validateRouteConfigStructure,
  validateStandardCrudMappings,
} from './routeConfigs.test-utils'

describe('checkoutSessionsRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(
      checkoutSessionsRouteConfigs,
      routeKey
    )
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(checkoutSessionsRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /checkout-sessions to checkoutSessions.create procedure', () => {
      const routeConfig = findRouteConfig('POST /checkout-sessions')

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('checkoutSessions.create')
      expect(routeConfig!.pattern.test('checkout-sessions')).toBe(
        true
      )

      // Test mapParams with body
      const testBody = {
        checkoutSession: {
          type: 'product',
          customerEmail: 'test@example.com',
        },
      }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /checkout-sessions/:id to checkoutSessions.update procedure', () => {
      const routeConfig = findRouteConfig(
        'PUT /checkout-sessions/:id'
      )

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('checkoutSessions.update')
      expect(
        routeConfig!.pattern.test('checkout-sessions/test-id')
      ).toBe(true)

      // Test mapParams with matches and body (simulate route handler slicing)
      const testBody = {
        checkoutSession: {
          customerEmail: 'updated@example.com',
        },
      }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('should map GET /checkout-sessions/:id to checkoutSessions.get procedure', () => {
      const routeConfig = findRouteConfig(
        'GET /checkout-sessions/:id'
      )

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('checkoutSessions.get')
      expect(
        routeConfig!.pattern.test('checkout-sessions/test-id')
      ).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('should map GET /checkout-sessions to checkoutSessions.list procedure', () => {
      const routeConfig = findRouteConfig('GET /checkout-sessions')

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('checkoutSessions.list')
      expect(routeConfig!.pattern.test('checkout-sessions')).toBe(
        true
      )

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('should map DELETE /checkout-sessions/:id to checkoutSessions.delete procedure', () => {
      const routeConfig = findRouteConfig(
        'DELETE /checkout-sessions/:id'
      )

      expect(routeConfig).toBeDefined()
      expect(routeConfig!.procedure).toBe('checkoutSessions.delete')
      expect(
        routeConfig!.pattern.test('checkout-sessions/test-id')
      ).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      // Checkout Sessions creation pattern should match 'checkout-sessions'
      const createConfig = findRouteConfig('POST /checkout-sessions')
      expect(createConfig!.pattern.test('checkout-sessions')).toBe(
        true
      )
      expect(createConfig!.pattern.test('checkout-sessions/id')).toBe(
        false
      )

      // Checkout Sessions get pattern should match 'checkout-sessions/abc123'
      const getConfig = findRouteConfig('GET /checkout-sessions/:id')
      expect(
        getConfig!.pattern.test('checkout-sessions/abc123')
      ).toBe(true)
      expect(getConfig!.pattern.test('checkout-sessions')).toBe(false)
      expect(
        getConfig!.pattern.test('checkout-sessions/abc123/extra')
      ).toBe(false)

      // Checkout Sessions edit pattern should match 'checkout-sessions/abc123'
      const updateConfig = findRouteConfig(
        'PUT /checkout-sessions/:id'
      )
      expect(
        updateConfig!.pattern.test('checkout-sessions/abc123')
      ).toBe(true)
      expect(updateConfig!.pattern.test('checkout-sessions')).toBe(
        false
      )

      // Checkout Sessions delete pattern should match 'checkout-sessions/abc123'
      const deleteConfig = findRouteConfig(
        'DELETE /checkout-sessions/:id'
      )
      expect(
        deleteConfig!.pattern.test('checkout-sessions/abc123')
      ).toBe(true)
      expect(deleteConfig!.pattern.test('checkout-sessions')).toBe(
        false
      )

      // Checkout Sessions list pattern should match 'checkout-sessions' only
      const listConfig = findRouteConfig('GET /checkout-sessions')
      expect(listConfig!.pattern.test('checkout-sessions')).toBe(true)
      expect(listConfig!.pattern.test('checkout-sessions/id')).toBe(
        false
      )
    })

    it('should extract correct matches from URL paths', () => {
      // Test Checkout Sessions get pattern extraction
      const getConfig = findRouteConfig('GET /checkout-sessions/:id')
      const getMatches = getConfig!.pattern.exec(
        'checkout-sessions/test-id'
      )
      expect(getMatches).not.toBeNull()
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test Checkout Sessions update pattern extraction
      const updateConfig = findRouteConfig(
        'PUT /checkout-sessions/:id'
      )
      const updateMatches = updateConfig!.pattern.exec(
        'checkout-sessions/test-id'
      )
      expect(updateMatches).not.toBeNull()
      expect(updateMatches![1]).toBe('test-id') // First capture group

      // Test Checkout Sessions delete pattern extraction
      const deleteConfig = findRouteConfig(
        'DELETE /checkout-sessions/:id'
      )
      const deleteMatches = deleteConfig!.pattern.exec(
        'checkout-sessions/test-id'
      )
      expect(deleteMatches).not.toBeNull()
      expect(deleteMatches![1]).toBe('test-id') // First capture group

      // Test Checkout Sessions list pattern (no captures)
      const listConfig = findRouteConfig('GET /checkout-sessions')
      const listMatches = listConfig!.pattern.exec(
        'checkout-sessions'
      )
      expect(listMatches).not.toBeNull()
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test Checkout Sessions create pattern (no captures)
      const createConfig = findRouteConfig('POST /checkout-sessions')
      const createMatches = createConfig!.pattern.exec(
        'checkout-sessions'
      )
      expect(createMatches).not.toBeNull()
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for checkout sessions get requests', () => {
      const routeConfig = findRouteConfig(
        'GET /checkout-sessions/:id'
      )

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['checkout-session-123'])

      expect(result).toEqual({
        id: 'checkout-session-123',
      })
    })

    it('should correctly map URL parameters and body for checkout sessions edit requests', () => {
      const routeConfig = findRouteConfig(
        'PUT /checkout-sessions/:id'
      )
      const testBody = {
        checkoutSession: {
          customerEmail: 'updated@example.com',
          automaticallyUpdateSubscriptions: true,
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(
        ['checkout-session-456'],
        testBody
      )

      expect(result).toEqual({
        checkoutSession: {
          customerEmail: 'updated@example.com',
          automaticallyUpdateSubscriptions: true,
        },
        id: 'checkout-session-456',
      })
    })

    it('should correctly map URL parameters for checkout sessions delete requests', () => {
      const routeConfig = findRouteConfig(
        'DELETE /checkout-sessions/:id'
      )

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['checkout-session-789'])

      expect(result).toEqual({
        id: 'checkout-session-789',
      })
    })

    it('should return body for checkout sessions create requests', () => {
      const routeConfig = findRouteConfig('POST /checkout-sessions')
      const testBody = {
        checkoutSession: {
          type: 'product',
          customerEmail: 'new@example.com',
          automaticallyUpdateSubscriptions: false,
        },
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for checkout sessions list requests', () => {
      const routeConfig = findRouteConfig('GET /checkout-sessions')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig(
        'GET /checkout-sessions/:id'
      )

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams([
        'session%40company.com',
      ])
      expect(result1).toEqual({
        id: 'session%40company.com',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams([
        'checkout-session_123-abc',
      ])
      expect(result2).toEqual({ id: 'checkout-session_123-abc' })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /checkout-sessions') // create
      expect(routeKeys).toContain('PUT /checkout-sessions/:id') // update
      expect(routeKeys).toContain('GET /checkout-sessions/:id') // get
      expect(routeKeys).toContain('GET /checkout-sessions') // list
      expect(routeKeys).toContain('DELETE /checkout-sessions/:id') // delete

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(5) // Standard CRUD operations
    })

    it('should have consistent id parameter usage', () => {
      const idRoutes = [
        'PUT /checkout-sessions/:id',
        'GET /checkout-sessions/:id',
        'DELETE /checkout-sessions/:id',
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
      checkoutSessionsRouteConfigs.forEach((routeConfigObj) => {
        Object.entries(routeConfigObj).forEach(
          ([routeKey, config]) => {
            validateRouteConfigStructure(config, 'checkoutSessions')
          }
        )
      })
    })

    it('should map to correct TRPC procedures', () => {
      validateStandardCrudMappings(
        findRouteConfig,
        'checkout-sessions',
        'checkoutSessions'
      )
    })
  })
})
