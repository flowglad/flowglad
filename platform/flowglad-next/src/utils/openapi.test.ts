import { describe, expect, it } from 'vitest'
import { trpcToRest } from './openapi'

describe('trpcToRest', () => {
  describe('CRUD operations', () => {
    it('should generate correct config for list operation', () => {
      const result = trpcToRest('products.list')

      expect(result).toEqual({
        'GET /products': {
          procedure: 'products.list',
          pattern: expect.any(RegExp),
          mapParams: expect.any(Function),
        },
      })

      expect(result['GET /products'].pattern.test('products')).toBe(
        true
      )
      expect(
        result['GET /products'].pattern.test('products/123')
      ).toBe(false)
      expect(result['GET /products'].mapParams([])).toBeUndefined()
    })

    it('should generate correct config for create operation', () => {
      const result = trpcToRest('products.create')

      expect(result).toEqual({
        'POST /products': {
          procedure: 'products.create',
          pattern: expect.any(RegExp),
          mapParams: expect.any(Function),
        },
      })

      expect(result['POST /products'].pattern.test('products')).toBe(
        true
      )
      expect(
        result['POST /products'].pattern.test('products/123')
      ).toBe(false)

      const testBody = { name: 'Test Product' }
      expect(result['POST /products'].mapParams([], testBody)).toBe(
        testBody
      )
    })

    it('should generate correct config for get operation with default id param', () => {
      const result = trpcToRest('products.get')

      expect(result).toEqual({
        'GET /products/:id': {
          procedure: 'products.get',
          pattern: expect.any(RegExp),
          mapParams: expect.any(Function),
        },
      })

      const pattern = result['GET /products/:id'].pattern
      expect(pattern.test('products/123')).toBe(true)
      expect(pattern.test('products')).toBe(false)
      expect(pattern.test('products/123/extra')).toBe(false)

      // Test parameter extraction - route handler slices off full match, so we simulate that
      const matches = pattern.exec('products/123')!.slice(1)
      expect(result['GET /products/:id'].mapParams(matches)).toEqual({
        id: '123',
      })
    })

    it('should generate correct config for get operation with custom param', () => {
      const result = trpcToRest('customers.get', {
        routeParams: ['externalId'],
      })

      expect(result).toEqual({
        'GET /customers/:externalId': {
          procedure: 'customers.get',
          pattern: expect.any(RegExp),
          mapParams: expect.any(Function),
        },
      })

      const pattern = result['GET /customers/:externalId'].pattern
      const matches = pattern.exec('customers/cust_123')!.slice(1)
      expect(
        result['GET /customers/:externalId'].mapParams(matches)
      ).toEqual({
        externalId: 'cust_123',
      })
    })

    it('should generate correct config for update operation', () => {
      const result = trpcToRest('products.update')

      expect(result).toEqual({
        'PUT /products/:id': {
          procedure: 'products.update',
          pattern: expect.any(RegExp),
          mapParams: expect.any(Function),
        },
      })

      const pattern = result['PUT /products/:id'].pattern
      const matches = pattern.exec('products/123')!.slice(1)
      const testBody = { name: 'Updated Product' }

      // Test that path param takes precedence over body
      const bodyWithId = { ...testBody, id: 'body_id' }
      const result1 = result['PUT /products/:id'].mapParams(
        matches,
        bodyWithId
      )
      expect(result1).toEqual({
        name: 'Updated Product',
        id: '123', // Path param should override body param
      })

      // Test normal case
      const result2 = result['PUT /products/:id'].mapParams(
        matches,
        testBody
      )
      expect(result2).toEqual({
        name: 'Updated Product',
        id: '123',
      })
    })

    it('should generate correct config for edit operation', () => {
      const result = trpcToRest('customers.edit', {
        routeParams: ['externalId'],
      })

      expect(result).toEqual({
        'PUT /customers/:externalId': {
          procedure: 'customers.edit',
          pattern: expect.any(RegExp),
          mapParams: expect.any(Function),
        },
      })

      const pattern = result['PUT /customers/:externalId'].pattern
      const matches = pattern.exec('customers/cust_123')!.slice(1)
      const testBody = { customer: { name: 'Updated Customer' } }

      // Test that path param takes precedence over body
      const bodyWithExternalId = {
        ...testBody,
        externalId: 'body_id',
      }
      const result1 = result['PUT /customers/:externalId'].mapParams(
        matches,
        bodyWithExternalId
      )
      expect(result1).toEqual({
        customer: { name: 'Updated Customer' },
        externalId: 'cust_123', // Path param should override body param
      })
    })

    it('should generate correct config for delete operation', () => {
      const result = trpcToRest('products.delete')

      expect(result).toEqual({
        'DELETE /products/:id': {
          procedure: 'products.delete',
          pattern: expect.any(RegExp),
          mapParams: expect.any(Function),
        },
      })

      const pattern = result['DELETE /products/:id'].pattern
      const matches = pattern.exec('products/123')!.slice(1)
      expect(
        result['DELETE /products/:id'].mapParams(matches)
      ).toEqual({
        id: '123',
      })
    })
  })

  describe('Special cases', () => {
    it('should handle utils endpoints', () => {
      const result = trpcToRest('utils.ping')

      expect(result).toEqual({
        'GET /utils/ping': {
          procedure: 'utils.ping',
          pattern: expect.any(RegExp),
          mapParams: expect.any(Function),
        },
      })

      expect(
        result['GET /utils/ping'].pattern.test('utils/ping')
      ).toBe(true)
      expect(result['GET /utils/ping'].mapParams([])).toBeUndefined()
    })

    it('should handle custom actions with nested resource pattern', () => {
      const result = trpcToRest('subscriptions.adjust', {
        routeParams: ['id'],
      })

      // This should create a POST endpoint for custom actions
      expect(result).toEqual({
        'POST /subscriptions/:id/adjust': {
          procedure: 'subscriptions.adjust',
          pattern: expect.any(RegExp),
          mapParams: expect.any(Function),
        },
      })

      const pattern = result['POST /subscriptions/:id/adjust'].pattern
      expect(pattern.test('subscriptions/123/adjust')).toBe(true)
      expect(pattern.test('subscriptions/123')).toBe(false)

      const matches = pattern
        .exec('subscriptions/123/adjust')!
        .slice(1)
      const testBody = { amount: 100 }
      expect(
        result['POST /subscriptions/:id/adjust'].mapParams(
          matches,
          testBody
        )
      ).toEqual({
        id: '123',
        amount: 100,
      })
    })
  })

  describe('Parameter extraction edge cases', () => {
    it('should extract parameters correctly with special characters', () => {
      const result = trpcToRest('customers.get', {
        routeParams: ['externalId'],
      })

      const pattern = result['GET /customers/:externalId'].pattern

      // Test with encoded characters
      const matches1 = pattern
        .exec('customers/user%40company.com')!
        .slice(1)
      expect(
        result['GET /customers/:externalId'].mapParams(matches1)
      ).toEqual({
        externalId: 'user%40company.com',
      })

      // Test with hyphens and underscores
      const matches2 = pattern
        .exec('customers/user_123-abc')!
        .slice(1)
      expect(
        result['GET /customers/:externalId'].mapParams(matches2)
      ).toEqual({
        externalId: 'user_123-abc',
      })
    })

    it('should handle kebab-case entity names correctly', () => {
      const result = trpcToRest('paymentMethods.get')

      expect(result).toHaveProperty('GET /payment-methods/:id')

      const pattern = result['GET /payment-methods/:id'].pattern
      const matches = pattern.exec('payment-methods/pm_123')!.slice(1)
      expect(
        result['GET /payment-methods/:id'].mapParams(matches)
      ).toEqual({
        id: 'pm_123',
      })
    })
  })

  describe('Error cases', () => {
    it('should throw error for invalid procedure name format', () => {
      expect(() => trpcToRest('invalid')).toThrow(
        'Invalid procedure name: invalid. Expected format: entity.action'
      )

      expect(() => trpcToRest('')).toThrow(
        'Invalid procedure name: . Expected format: entity.action'
      )
    })
  })

  describe('Regex match indices validation', () => {
    it('should use correct match indices for all CRUD operations', () => {
      const operations = ['get', 'update', 'edit', 'delete'] as const

      operations.forEach((operation) => {
        const result = trpcToRest(`products.${operation}`)
        const routeKey = Object.keys(result)[0]
        const config = result[routeKey]

        // Test that the pattern correctly extracts the ID part
        const testPath = 'products/test-id-123'
        const matches = config.pattern.exec(testPath)

        expect(typeof matches).toBe('object')
        expect(matches![0]).toBe('products/test-id-123') // Full match
        expect(matches![1]).toBe('test-id-123') // Capture group - this is what should be used

        // Test that mapParams uses the correct index (simulate route handler slicing)
        if (operation === 'delete' || operation === 'get') {
          const params = config.mapParams(matches!.slice(1))
          expect(params.id).toBe('test-id-123')
        } else {
          // update and edit operations
          const params = config.mapParams(matches!.slice(1), {})
          expect(params.id).toBe('test-id-123')
        }
      })
    })
  })
})
