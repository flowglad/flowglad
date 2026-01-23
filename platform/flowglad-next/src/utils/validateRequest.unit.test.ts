import { describe, expect, it } from 'bun:test'
import {
  isEmptyBodyAllowedForRoute,
  isRequestBodyEmpty,
  shouldAllowEmptyBody,
} from './validateRequest'

describe('Empty Body Validation', () => {
  describe('Route Whitelist Pattern Matching', () => {
    it('should allow empty body for subscriptions uncancel route', () => {
      expect(
        isEmptyBodyAllowedForRoute('subscriptions/sub_123/uncancel')
      ).toBe(true)
      expect(
        isEmptyBodyAllowedForRoute(
          'subscriptions/sub_abc456def/uncancel'
        )
      ).toBe(true)
    })

    it('should allow empty body for product-features expire route', () => {
      expect(
        isEmptyBodyAllowedForRoute('product-features/feat_123/expire')
      ).toBe(true)
      expect(
        isEmptyBodyAllowedForRoute(
          'product-features/feat_abc456def/expire'
        )
      ).toBe(true)
    })

    it('should reject empty body for non-whitelisted subscription routes', () => {
      expect(
        isEmptyBodyAllowedForRoute('subscriptions/sub_123/cancel')
      ).toBe(false)
      expect(
        isEmptyBodyAllowedForRoute('subscriptions/sub_123/adjust')
      ).toBe(false)
      expect(
        isEmptyBodyAllowedForRoute('subscriptions/sub_123')
      ).toBe(false)
      expect(isEmptyBodyAllowedForRoute('subscriptions')).toBe(false)
    })

    it('should reject empty body for non-whitelisted product-feature routes', () => {
      expect(
        isEmptyBodyAllowedForRoute('product-features/feat_123/update')
      ).toBe(false)
      expect(
        isEmptyBodyAllowedForRoute('product-features/feat_123')
      ).toBe(false)
      expect(isEmptyBodyAllowedForRoute('product-features')).toBe(
        false
      )
    })

    it('should reject empty body for other API routes', () => {
      expect(isEmptyBodyAllowedForRoute('customers/cust_123')).toBe(
        false
      )
      expect(isEmptyBodyAllowedForRoute('invoices/inv_123')).toBe(
        false
      )
      expect(
        isEmptyBodyAllowedForRoute('payment-methods/pm_123')
      ).toBe(false)
      expect(isEmptyBodyAllowedForRoute('prices/price_123')).toBe(
        false
      )
    })

    it('should not match partial paths', () => {
      expect(
        isEmptyBodyAllowedForRoute(
          'subscriptions/sub_123/uncancel/extra'
        )
      ).toBe(false)
      expect(
        isEmptyBodyAllowedForRoute(
          'prefix/subscriptions/sub_123/uncancel'
        )
      ).toBe(false)
    })

    it('should handle edge cases', () => {
      expect(
        isEmptyBodyAllowedForRoute('subscriptions//uncancel')
      ).toBe(false)
      expect(
        isEmptyBodyAllowedForRoute('subscriptions/uncancel')
      ).toBe(false)
      expect(isEmptyBodyAllowedForRoute('')).toBe(false)
    })
  })

  describe('Content-Length Header Validation', () => {
    it('should consider body empty when content-length is 0', () => {
      expect(isRequestBodyEmpty('0')).toBe(true)
    })

    it('should consider body empty when content-length is null', () => {
      expect(isRequestBodyEmpty(null)).toBe(true)
    })

    it('should consider body empty when content-length is undefined', () => {
      // @ts-expect-error - Testing undefined input for runtime robustness
      expect(isRequestBodyEmpty(undefined)).toBe(true)
    })

    it('should not consider body empty when content-length is greater than 0', () => {
      expect(isRequestBodyEmpty('1')).toBe(false)
      expect(isRequestBodyEmpty('100')).toBe(false)
      expect(isRequestBodyEmpty('1024')).toBe(false)
    })
  })

  describe('Combined Validation Logic', () => {
    it('should allow empty body for whitelisted route with empty body', () => {
      expect(
        shouldAllowEmptyBody('subscriptions/sub_123/uncancel', '0')
      ).toBe(true)
      expect(
        shouldAllowEmptyBody('subscriptions/sub_123/uncancel', null)
      ).toBe(true)
      expect(
        shouldAllowEmptyBody('product-features/feat_123/expire', '0')
      ).toBe(true)
      expect(
        shouldAllowEmptyBody('product-features/feat_123/expire', null)
      ).toBe(true)
    })

    it('should reject non-empty body even for whitelisted routes', () => {
      expect(
        shouldAllowEmptyBody('subscriptions/sub_123/uncancel', '100')
      ).toBe(false)
      expect(
        shouldAllowEmptyBody('product-features/feat_123/expire', '50')
      ).toBe(false)
    })

    it('should reject empty body for non-whitelisted routes', () => {
      expect(
        shouldAllowEmptyBody('subscriptions/sub_123/cancel', '0')
      ).toBe(false)
      expect(shouldAllowEmptyBody('customers/cust_123', null)).toBe(
        false
      )
      expect(shouldAllowEmptyBody('invoices/inv_123', '0')).toBe(
        false
      )
    })

    it('should reject non-empty body for non-whitelisted routes', () => {
      expect(
        shouldAllowEmptyBody('subscriptions/sub_123/cancel', '100')
      ).toBe(false)
      expect(shouldAllowEmptyBody('customers/cust_123', '200')).toBe(
        false
      )
    })
  })

  describe('Security Scenarios', () => {
    it('should prevent malformed JSON attacks on whitelisted routes with content', () => {
      // If someone sends malformed JSON with content-length > 0 to a whitelisted route,
      // it should be rejected (will throw "Invalid JSON in request body")
      expect(
        shouldAllowEmptyBody('subscriptions/sub_123/uncancel', '50')
      ).toBe(false)
    })

    it('should prevent empty body attacks on non-whitelisted routes', () => {
      // If someone sends empty body to a route that requires body,
      // it should be rejected
      expect(
        shouldAllowEmptyBody('subscriptions/sub_123/cancel', '0')
      ).toBe(false)
      expect(shouldAllowEmptyBody('customers', '0')).toBe(false)
    })

    it('should only allow truly empty bodies on specific whitelisted routes', () => {
      // The ONLY valid combination
      const validScenarios = [
        {
          path: 'subscriptions/sub_123/uncancel',
          contentLength: '0',
        },
        {
          path: 'subscriptions/sub_123/uncancel',
          contentLength: null,
        },
        {
          path: 'product-features/feat_123/expire',
          contentLength: '0',
        },
        {
          path: 'product-features/feat_123/expire',
          contentLength: null,
        },
      ]

      for (const scenario of validScenarios) {
        expect(
          shouldAllowEmptyBody(scenario.path, scenario.contentLength)
        ).toBe(true)
      }

      // All other combinations should be rejected
      const invalidScenarios = [
        // Non-whitelisted routes with empty body
        { path: 'subscriptions/sub_123/cancel', contentLength: '0' },
        { path: 'customers', contentLength: null },
        // Whitelisted routes with non-empty body
        {
          path: 'subscriptions/sub_123/uncancel',
          contentLength: '100',
        },
        {
          path: 'product-features/feat_123/expire',
          contentLength: '50',
        },
        // Non-whitelisted routes with non-empty body
        {
          path: 'subscriptions/sub_123/cancel',
          contentLength: '100',
        },
      ]

      for (const scenario of invalidScenarios) {
        expect(
          shouldAllowEmptyBody(scenario.path, scenario.contentLength)
        ).toBe(false)
      }
    })
  })
})
