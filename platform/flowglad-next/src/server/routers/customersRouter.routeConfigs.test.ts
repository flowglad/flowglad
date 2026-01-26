import { describe, expect, it } from 'bun:test'
import {
  customerBillingRouteConfig,
  customersRouteConfigs,
  customerUsageBalancesRouteConfig,
} from './customersRouter'
import {
  findRouteConfigInArray,
  getAllRouteKeysFromArray,
  validateRouteConfigStructure,
} from './routeConfigs.test-utils'

describe('customersRouteConfigs', () => {
  // Helper function to find route config in the array
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(customersRouteConfigs, routeKey)
  }

  // Helper function to get all route keys from the array
  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(customersRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('should map POST /customers to customers.create procedure', () => {
      const routeConfig = findRouteConfig('POST /customers')

      expect(routeConfig).toMatchObject({
        procedure: 'customers.create',
      })
      expect(routeConfig!.procedure).toBe('customers.create')
      expect(routeConfig!.pattern.test('customers')).toBe(true)

      // Test mapParams with body
      const testBody = { customer: { name: 'Test Customer' } }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('should map PUT /customers/:externalId to customers.update procedure', () => {
      const routeConfig = findRouteConfig(
        'PUT /customers/:externalId'
      )

      expect(routeConfig).toMatchObject({
        procedure: 'customers.update',
      })
      expect(routeConfig!.procedure).toBe('customers.update')
      expect(routeConfig!.pattern.test('customers/test-id')).toBe(
        true
      )

      // Test mapParams with matches and body (simulate route handler slicing)
      const testBody = { customer: { name: 'Updated Customer' } }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        externalId: 'test-id',
      })
    })

    it('should map GET /customers/:externalId to customers.get procedure', () => {
      const routeConfig = findRouteConfig(
        'GET /customers/:externalId'
      )

      expect(routeConfig).toMatchObject({
        procedure: 'customers.get',
      })
      expect(routeConfig!.procedure).toBe('customers.get')
      expect(routeConfig!.pattern.test('customers/test-id')).toBe(
        true
      )

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ externalId: 'test-id' })
    })

    it('should map GET /customers/:externalId/billing to customers.getBilling procedure', () => {
      const routeConfig =
        customerBillingRouteConfig[
          'GET /customers/:externalId/billing'
        ]

      expect(routeConfig).toMatchObject({
        procedure: 'customers.getBilling',
      })
      expect(routeConfig!.procedure).toBe('customers.getBilling')
      expect(
        routeConfig!.pattern.test('customers/test-id/billing')
      ).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ externalId: 'test-id' })
    })

    it('should map GET /customers/:externalId/usage-balances to customers.getUsageBalances procedure', () => {
      const routeConfig =
        customerUsageBalancesRouteConfig[
          'GET /customers/:externalId/usage-balances'
        ]

      expect(routeConfig).toMatchObject({
        procedure: 'customers.getUsageBalances',
      })
      expect(routeConfig!.procedure).toBe(
        'customers.getUsageBalances'
      )
      expect(
        routeConfig!.pattern.test('customers/test-id/usage-balances')
      ).toBe(true)

      // Test mapParams with matches only (simulate route handler slicing)
      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ externalId: 'test-id' })

      // Test mapParams with body (subscriptionId filter)
      const resultWithBody = routeConfig!.mapParams(['test-id'], {
        subscriptionId: 'sub_123',
      })
      expect(resultWithBody).toEqual({
        externalId: 'test-id',
        subscriptionId: 'sub_123',
      })
    })

    it('should map GET /customers to customers.list procedure', () => {
      const routeConfig = findRouteConfig('GET /customers')

      expect(routeConfig).toMatchObject({
        procedure: 'customers.list',
      })
      expect(routeConfig!.procedure).toBe('customers.list')
      expect(routeConfig!.pattern.test('customers')).toBe(true)

      // Test mapParams returns undefined for list endpoints
      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('should have valid RegExp patterns that match expected paths', () => {
      const billingConfigs = customerBillingRouteConfig

      // Customer creation pattern should match 'customers'
      const createConfig = findRouteConfig('POST /customers')
      expect(createConfig!.pattern.test('customers')).toBe(true)
      expect(createConfig!.pattern.test('customers/id')).toBe(false)

      // Customer get pattern should match 'customers/abc123'
      const getConfig = findRouteConfig('GET /customers/:externalId')
      expect(getConfig!.pattern.test('customers/abc123')).toBe(true)
      expect(getConfig!.pattern.test('customers')).toBe(false)
      expect(getConfig!.pattern.test('customers/abc123/extra')).toBe(
        false
      )

      // Customer edit pattern should match 'customers/abc123'
      const updateConfig = findRouteConfig(
        'PUT /customers/:externalId'
      )
      expect(updateConfig!.pattern.test('customers/abc123')).toBe(
        true
      )
      expect(updateConfig!.pattern.test('customers')).toBe(false)

      // Customer billing pattern should match 'customers/abc123/billing'
      expect(
        billingConfigs[
          'GET /customers/:externalId/billing'
        ].pattern.test('customers/abc123/billing')
      ).toBe(true)
      expect(
        billingConfigs[
          'GET /customers/:externalId/billing'
        ].pattern.test('customers/abc123')
      ).toBe(false)
      expect(
        billingConfigs[
          'GET /customers/:externalId/billing'
        ].pattern.test('customers/billing')
      ).toBe(false)

      // Customer list pattern should match 'customers' only
      const listConfig = findRouteConfig('GET /customers')
      expect(listConfig!.pattern.test('customers')).toBe(true)
      expect(listConfig!.pattern.test('customers/id')).toBe(false)
    })

    it('should extract correct matches from URL paths', () => {
      const billingConfigs = customerBillingRouteConfig

      // Test customer get pattern extraction
      const getConfig = findRouteConfig('GET /customers/:externalId')
      const getMatches = getConfig!.pattern.exec('customers/test-id')
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id') // First capture group

      // Test customer billing pattern extraction
      const billingMatches = billingConfigs[
        'GET /customers/:externalId/billing'
      ].pattern.exec('customers/test-id/billing')
      expect(typeof billingMatches).toBe('object')
      expect(billingMatches![1]).toBe('test-id') // First capture group

      // Test customer list pattern (no captures)
      const listConfig = findRouteConfig('GET /customers')
      const listMatches = listConfig!.pattern.exec('customers')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1) // Only the full match, no capture groups

      // Test customer create pattern (no captures)
      const createConfig = findRouteConfig('POST /customers')
      const createMatches = createConfig!.pattern.exec('customers')
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1) // Only the full match, no capture groups
    })
  })

  describe('mapParams function behavior', () => {
    it('should correctly map URL parameters for customer get requests', () => {
      const routeConfig = findRouteConfig(
        'GET /customers/:externalId'
      )

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(['customer-123'])

      expect(result).toEqual({
        externalId: 'customer-123',
      })
    })

    it('should correctly map URL parameters and body for customer edit requests', () => {
      const routeConfig = findRouteConfig(
        'PUT /customers/:externalId'
      )
      const testBody = {
        customer: {
          name: 'Updated Customer Name',
          email: 'updated@example.com',
        },
      }

      // Simulate what route handler does - slices off the full match
      const result = routeConfig!.mapParams(
        ['customer-456'],
        testBody
      )

      expect(result).toEqual({
        customer: {
          name: 'Updated Customer Name',
          email: 'updated@example.com',
        },
        externalId: 'customer-456',
      })
    })

    it('should correctly map URL parameters for customer billing requests', () => {
      const routeConfig =
        customerBillingRouteConfig[
          'GET /customers/:externalId/billing'
        ]

      // Simulate what route handler does - slices off the full match
      const result = routeConfig.mapParams(['customer-789'])

      expect(result).toEqual({
        externalId: 'customer-789',
      })
    })

    it('should return body for customer create requests', () => {
      const routeConfig = findRouteConfig('POST /customers')
      const testBody = {
        customer: {
          externalId: 'new-customer',
          name: 'New Customer',
          email: 'new@example.com',
        },
      }

      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('should return undefined for customer list requests', () => {
      const routeConfig = findRouteConfig('GET /customers')

      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('should handle special characters and encoded values in externalId', () => {
      const routeConfig = findRouteConfig(
        'GET /customers/:externalId'
      )

      // Test with URL-encoded characters (simulate route handler slicing)
      const result1 = routeConfig!.mapParams([
        'customer%40company.com',
      ])
      expect(result1).toEqual({
        externalId: 'customer%40company.com',
      })

      // Test with hyphens and underscores (simulate route handler slicing)
      const result2 = routeConfig!.mapParams(['customer_123-abc'])
      expect(result2).toEqual({ externalId: 'customer_123-abc' })
    })
  })

  describe('Route config completeness', () => {
    it('should have all expected CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()
      const billingKeys = Object.keys(customerBillingRouteConfig)
      const usageBalancesKeys = Object.keys(
        customerUsageBalancesRouteConfig
      )

      // Check that all expected routes exist
      expect(routeKeys).toContain('POST /customers') // create
      expect(routeKeys).toContain('PUT /customers/:externalId') // update
      expect(routeKeys).toContain('GET /customers/:externalId') // get
      expect(routeKeys).toContain('GET /customers') // list
      expect(routeKeys).toContain('DELETE /customers/:externalId') // delete
      expect(billingKeys).toContain(
        'GET /customers/:externalId/billing'
      ) // custom billing route
      expect(usageBalancesKeys).toContain(
        'GET /customers/:externalId/usage-balances'
      ) // custom usage balances route

      // Check that we have exactly the expected number of routes
      expect(routeKeys).toHaveLength(5) // Standard CRUD + DELETE
      expect(billingKeys).toHaveLength(1) // Just billing route
      expect(usageBalancesKeys).toHaveLength(1) // Just usage balances route
    })

    it('should have consistent externalId parameter usage', () => {
      const idRoutes = [
        'PUT /customers/:externalId',
        'GET /customers/:externalId',
      ]

      idRoutes.forEach((routeKey) => {
        const config = findRouteConfig(routeKey)

        // Test that mapParams consistently uses 'externalId' (simulate route handler slicing)
        const result = config!.mapParams(['test-id'], {
          someData: 'value',
        })
        expect(result).toHaveProperty('externalId', 'test-id')
      })

      // Test billing route separately (simulate route handler slicing)
      const billingConfig =
        customerBillingRouteConfig[
          'GET /customers/:externalId/billing'
        ]
      const billingResult = billingConfig!.mapParams(['test-id'])
      expect(billingResult).toHaveProperty('externalId', 'test-id')
    })

    it('should have valid route config structure for all routes', () => {
      // Test all route configs from the array
      customersRouteConfigs.forEach((routeConfigObj) => {
        Object.entries(routeConfigObj).forEach(
          ([routeKey, config]) => {
            validateRouteConfigStructure(config, 'customers')
          }
        )
      })

      // Test billing route configs
      Object.entries(customerBillingRouteConfig).forEach(
        ([routeKey, config]) => {
          validateRouteConfigStructure(config, 'customers')
        }
      )

      // Test usage balances route configs
      Object.entries(customerUsageBalancesRouteConfig).forEach(
        ([routeKey, config]) => {
          validateRouteConfigStructure(config, 'customers')
        }
      )
    })

    it('should map to correct TRPC procedures', () => {
      const expectedMappings = {
        'POST /customers': 'customers.create',
        'PUT /customers/:externalId': 'customers.update',
        'GET /customers/:externalId': 'customers.get',
        'GET /customers': 'customers.list',
        'DELETE /customers/:externalId': 'customers.delete',
      }

      Object.entries(expectedMappings).forEach(
        ([routeKey, expectedProcedure]) => {
          const config = findRouteConfig(routeKey)
          expect(config!.procedure).toBe(expectedProcedure)
        }
      )

      // Test billing route separately
      const billingConfig =
        customerBillingRouteConfig[
          'GET /customers/:externalId/billing'
        ]
      expect(billingConfig!.procedure).toBe('customers.getBilling')

      // Test usage balances route separately
      const usageBalancesConfig =
        customerUsageBalancesRouteConfig[
          'GET /customers/:externalId/usage-balances'
        ]
      expect(usageBalancesConfig!.procedure).toBe(
        'customers.getUsageBalances'
      )
    })
  })
})
