import { beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { TRPCError } from '@trpc/server'
import {
  errorHandlers,
  extractErrorDetails,
  handleTRPCError,
} from './trpcErrorHandler'

describe('trpcErrorHandler', () => {
  beforeEach(() => {
    spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('extractErrorDetails', () => {
    it('should extract details from TRPCError', () => {
      const error = new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Test error message',
      })

      const result = extractErrorDetails(error)

      expect(result).toEqual({
        code: 'BAD_REQUEST',
        userMessage: 'Test error message',
        developerMessage: 'Test error message',
        context: undefined,
      })
    })

    it('should extract PostgreSQL error details from cause', () => {
      const pgError = {
        code: '23505',
        constraint_name: 'products_pricing_model_id_slug_unique_idx',
        detail:
          'Key (pricing_model_id, slug)=(123, test-slug) already exists.',
        table_name: 'products',
      }
      const error = new Error('Database error', { cause: pgError })

      const result = extractErrorDetails(error)

      expect(result.code).toBe('CONFLICT')
      expect(result.userMessage).toBe(
        'This product slug already exists in this pricing model. Please choose a different slug.'
      )
      expect(result.developerMessage).toBe('Database error')
      expect(result.context).toHaveProperty(
        'constraint',
        'products_pricing_model_id_slug_unique_idx'
      )
    })

    it('should handle RLS errors with opaque user message', () => {
      const rlsError = {
        code: '42501', // PostgreSQL permission denied error code
        message:
          'new row violates row-level security policy "customers_isolation" for table "customers"',
      }
      const error = new Error('RLS violation', { cause: rlsError })

      const result = extractErrorDetails(error)

      expect(result.code).toBe('FORBIDDEN')
      expect(result.userMessage).toBe(
        'This customer record either does not exist or you do not have access to it.'
      )
      expect(result.developerMessage).toBe('RLS violation')
      expect(result.context?.code).toBe('42501')
    })

    it('should handle regular Error objects', () => {
      const error = new Error('Something went wrong')

      const result = extractErrorDetails(error)

      expect(result).toEqual({
        code: 'INTERNAL_SERVER_ERROR',
        userMessage:
          'An unexpected error occurred. Please try again.',
        developerMessage: 'Something went wrong',
        context: {},
      })
    })

    it('should handle string errors', () => {
      const error = 'String error message'

      const result = extractErrorDetails(error)

      expect(result).toEqual({
        code: 'INTERNAL_SERVER_ERROR',
        userMessage:
          'An unexpected error occurred. Please try again.',
        developerMessage: 'Unknown error',
        context: {},
      })
    })

    it('should handle unknown error types', () => {
      const error = { weird: 'object' }

      const result = extractErrorDetails(error)

      expect(result).toEqual({
        code: 'INTERNAL_SERVER_ERROR',
        userMessage:
          'An unexpected error occurred. Please try again.',
        developerMessage: 'Unknown error',
        context: {},
      })
    })

    it('should handle null and undefined', () => {
      expect(extractErrorDetails(null)).toEqual({
        code: 'INTERNAL_SERVER_ERROR',
        userMessage:
          'An unexpected error occurred. Please try again.',
        developerMessage: 'Unknown error',
        context: {},
      })

      expect(extractErrorDetails(undefined)).toEqual({
        code: 'INTERNAL_SERVER_ERROR',
        userMessage:
          'An unexpected error occurred. Please try again.',
        developerMessage: 'Unknown error',
        context: {},
      })
    })
  })

  describe('handleTRPCError', () => {
    it('should throw TRPCError with extracted details', () => {
      const pgError = {
        code: '23505',
        constraint_name: 'customers_organization_id_email_unique_idx',
        table_name: 'customers',
      }
      const error = new Error('Database error', { cause: pgError })

      expect(() => {
        handleTRPCError(error, {
          resource: 'customer',
          operation: 'create',
        })
      }).toThrow(TRPCError)

      try {
        handleTRPCError(error, {
          resource: 'customer',
          operation: 'create',
        })
      } catch (e) {
        expect(e).toBeInstanceOf(TRPCError)
        const trpcError = e as TRPCError
        expect(trpcError.code).toBe('CONFLICT')
        expect(trpcError.message).toContain('already exists')
      }
    })

    it('should include operation context in error', () => {
      const error = new Error('Test error')

      try {
        handleTRPCError(error, {
          resource: 'product',
          operation: 'update',
          id: 'prod_123',
          details: { name: 'Test Product' },
        })
      } catch (e) {
        const trpcError = e as TRPCError
        expect(trpcError.cause).toHaveProperty('resource', 'product')
        expect(trpcError.cause).toHaveProperty('operation', 'update')
        expect(trpcError.cause).toHaveProperty('id', 'prod_123')
        expect(trpcError.cause).toHaveProperty('details')
      }
    })

    it('should log errors with context', () => {
      const consoleSpy = spyOn(console, 'error')
      const error = new Error('Test error')

      try {
        handleTRPCError(error, {
          resource: 'subscription',
          operation: 'cancel',
          id: 'sub_123',
        })
      } catch (e) {
        // Expected to throw
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        '[TRPC Error Handler]',
        expect.objectContaining({
          context: expect.objectContaining({
            resource: 'subscription',
            operation: 'cancel',
            id: 'sub_123',
          }),
        })
      )
    })
  })

  describe('errorHandlers', () => {
    describe('product error handler', () => {
      it('should handle product errors with context', () => {
        const error = new Error('Product error')

        expect(() => {
          errorHandlers.product.handle(error, {
            operation: 'create',
            details: { slug: 'test-product' },
          })
        }).toThrow(TRPCError)

        try {
          errorHandlers.product.handle(error, {
            operation: 'update',
            id: 'prod_123',
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.cause).toHaveProperty(
            'resource',
            'product'
          )
          expect(trpcError.cause).toHaveProperty(
            'operation',
            'update'
          )
          expect(trpcError.cause).toHaveProperty('id', 'prod_123')
        }
      })

      it('should handle duplicate slug error specially', () => {
        const pgError = {
          code: '23505',
          constraint_name:
            'products_pricing_model_id_slug_unique_idx',
          table_name: 'products',
        }
        const error = new Error('Database error', { cause: pgError })

        try {
          errorHandlers.product.handle(error, {
            operation: 'create',
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.message).toContain(
            'product slug already exists'
          )
          expect(trpcError.code).toBe('CONFLICT')
        }
      })
    })

    describe('customer error handler', () => {
      it('should handle customer errors with context', () => {
        const error = new Error('Customer error')

        expect(() => {
          errorHandlers.customer.handle(error, {
            operation: 'create',
            details: { email: 'test@example.com' },
          })
        }).toThrow(TRPCError)

        try {
          errorHandlers.customer.handle(error, {
            operation: 'get',
            id: 'cust_123',
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.cause).toHaveProperty(
            'resource',
            'customer'
          )
          expect(trpcError.cause).toHaveProperty('operation', 'get')
        }
      })

      it('should handle duplicate email error', () => {
        const pgError = {
          code: '23505',
          constraint_name:
            'customers_organization_id_email_unique_idx',
          table_name: 'customers',
        }
        const error = new Error('Database error', { cause: pgError })

        try {
          errorHandlers.customer.handle(error, {
            operation: 'create',
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.message).toContain(
            'organization id email unique already exists'
          )
          expect(trpcError.code).toBe('CONFLICT')
        }
      })
    })

    describe('subscription error handler', () => {
      it('should handle subscription errors', () => {
        const error = new Error('Subscription error')

        try {
          errorHandlers.subscription.handle(error, {
            operation: 'create',
            details: { customerId: 'cust_123' },
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.cause).toHaveProperty(
            'resource',
            'subscription'
          )
          expect(trpcError.cause).toHaveProperty('details')
        }
      })

      it('should handle foreign key violation for customer', () => {
        const pgError = {
          code: '23503',
          constraint_name: 'subscriptions_customer_id_fkey',
          table_name: 'subscriptions',
        }
        const error = new Error('Database error', { cause: pgError })

        try {
          errorHandlers.subscription.handle(error, {
            operation: 'create',
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.message).toContain(
            'The specified customer does not exist'
          )
          expect(trpcError.code).toBe('BAD_REQUEST')
        }
      })

      it('should handle invalid status transition', () => {
        const pgError = {
          code: '23514',
          constraint_name: 'subscriptions_status_check',
          table_name: 'subscriptions',
        }
        const error = new Error('Database error', { cause: pgError })

        try {
          errorHandlers.subscription.handle(error, {
            operation: 'update',
            id: 'sub_123',
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.message).toContain(
            'status value does not meet the required criteria'
          )
          expect(trpcError.code).toBe('BAD_REQUEST')
        }
      })
    })

    describe('invoice error handler', () => {
      it('should handle invoice errors', () => {
        const error = new Error('Invoice error')

        try {
          errorHandlers.invoice.handle(error, {
            operation: 'create',
            details: { amount: 1000 },
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.cause).toHaveProperty(
            'resource',
            'invoice'
          )
        }
      })

      it('should handle negative amount check constraint', () => {
        const pgError = {
          code: '23514',
          constraint_name: 'invoices_amount_positive_check',
          table_name: 'invoices',
        }
        const error = new Error('Database error', { cause: pgError })

        try {
          errorHandlers.invoice.handle(error, {
            operation: 'create',
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.message).toContain(
            'positive value does not meet the required criteria'
          )
          expect(trpcError.code).toBe('BAD_REQUEST')
        }
      })
    })

    describe('organization error handler', () => {
      it('should handle organization errors', () => {
        const error = new Error('Organization error')

        try {
          errorHandlers.organization.handle(error, {
            operation: 'update',
            id: 'org_123',
            details: { name: 'Test Org' },
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.cause).toHaveProperty(
            'resource',
            'organization'
          )
        }
      })

      it('should handle duplicate slug error', () => {
        const pgError = {
          code: '23505',
          constraint_name: 'organizations_slug_unique_idx',
          table_name: 'organizations',
        }
        const error = new Error('Database error', { cause: pgError })

        try {
          errorHandlers.organization.handle(error, {
            operation: 'create',
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.message).toContain(
            'organization with this slug already exists'
          )
          expect(trpcError.code).toBe('CONFLICT')
        }
      })
    })

    describe('pricingModel error handler', () => {
      it('should handle pricing model errors', () => {
        const error = new Error('Pricing model error')

        try {
          errorHandlers.pricingModel.handle(error, {
            operation: 'create',
            details: { name: 'Test Model' },
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.cause).toHaveProperty(
            'resource',
            'pricing model'
          )
        }
      })
    })

    describe('price error handler', () => {
      it('should handle price errors', () => {
        const error = new Error('Price error')

        try {
          errorHandlers.price.handle(error, {
            operation: 'create',
            details: { amount: 999 },
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.cause).toHaveProperty('resource', 'price')
        }
      })

      it('should handle foreign key to product', () => {
        const pgError = {
          code: '23503',
          constraint_name: 'prices_product_id_fkey',
          table_name: 'prices',
        }
        const error = new Error('Database error', { cause: pgError })

        try {
          errorHandlers.price.handle(error, {
            operation: 'create',
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.message).toBe(
            'The specified product does not exist or is not available.'
          )
          expect(trpcError.code).toBe('BAD_REQUEST')
        }
      })
    })

    describe('generic error handler', () => {
      it('should handle generic errors', () => {
        const error = new Error('Generic error')

        try {
          errorHandlers.generic.handle(error, {
            operation: 'unknown',
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.cause).toHaveProperty(
            'resource',
            'unknown'
          )
          expect(trpcError.code).toBe('INTERNAL_SERVER_ERROR')
        }
      })

      it('should handle errors without specific handler', () => {
        const error = new Error('Some error')

        try {
          errorHandlers.generic.handle(error, {
            operation: 'process',
            details: { someData: 'value' },
          })
        } catch (e) {
          const trpcError = e as TRPCError
          expect(trpcError.message).toBe(
            'An unexpected error occurred. Please try again.'
          )
        }
      })
    })
  })
})
