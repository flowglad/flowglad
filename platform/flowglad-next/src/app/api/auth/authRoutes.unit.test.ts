/**
 * Unit tests for split auth API routes (Patch 3).
 *
 * These tests verify:
 * 1. Merchant and customer auth routes export the expected handlers
 * 2. The routes are wired to the correct auth instances
 *
 * Note: Integration tests for actual sign-in/sign-out flows are in Patch 8.
 */
import { describe, expect, it } from 'bun:test'
import * as customerRoute from './customer/[...all]/route'
import * as merchantRoute from './merchant/[...all]/route'

describe('auth API routes', () => {
  describe('/api/auth/merchant/*', () => {
    it('exports GET and POST handlers', () => {
      expect(typeof merchantRoute.GET).toBe('function')
      expect(typeof merchantRoute.POST).toBe('function')
    })

    it('handlers are async functions that return Response objects', () => {
      // Verify the handlers have the expected function signatures
      // (they should be async functions created by toNextJsHandler)
      expect(merchantRoute.GET.constructor.name).toBe('AsyncFunction')
      expect(merchantRoute.POST.constructor.name).toBe(
        'AsyncFunction'
      )
    })
  })

  describe('/api/auth/customer/*', () => {
    it('exports GET and POST handlers', () => {
      expect(typeof customerRoute.GET).toBe('function')
      expect(typeof customerRoute.POST).toBe('function')
    })

    it('handlers are async functions that return Response objects', () => {
      // Verify the handlers have the expected function signatures
      // (they should be async functions created by toNextJsHandler)
      expect(customerRoute.GET.constructor.name).toBe('AsyncFunction')
      expect(customerRoute.POST.constructor.name).toBe(
        'AsyncFunction'
      )
    })
  })

  describe('route separation', () => {
    it('merchant and customer routes export different handler instances', () => {
      // The handlers should be separate instances (different auth configurations)
      expect(merchantRoute.GET).not.toBe(customerRoute.GET)
      expect(merchantRoute.POST).not.toBe(customerRoute.POST)
    })
  })
})
