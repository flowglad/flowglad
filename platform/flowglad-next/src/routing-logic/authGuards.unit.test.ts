import { describe, expect, it } from 'bun:test'
import { middlewareLogic } from './middlewareLogic'

/**
 * Tests for route group auth guards.
 *
 * These tests verify the expected behavior of the layout-based auth guards
 * introduced in src/app/(merchant)/layout.tsx and src/app/billing-portal/(protected)/layout.tsx.
 *
 * The auth guards provide a second layer of protection in addition to the middleware.
 * Both layers use the same session checking logic (via getSession()), so we test
 * the underlying middleware logic here.
 *
 * Layout guards:
 * - (merchant)/layout.tsx: Redirects to /sign-in if no session
 * - billing-portal/(protected)/layout.tsx: Redirects to /billing-portal/{orgId}/{custId}/sign-in if no session
 *
 * @see src/app/(merchant)/layout.tsx
 * @see src/app/billing-portal/(protected)/layout.tsx
 */
describe('auth guards', () => {
  describe('merchant route auth guards', () => {
    it('should redirect unauthenticated users from /dashboard to /sign-in', () => {
      const result = middlewareLogic({
        sessionCookie: null,
        isProtectedRoute: true,
        pathName: '/dashboard',
        customerBillingPortalOrganizationId: null,
        req: { nextUrl: 'https://example.com/dashboard' },
      })

      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        expect(result.redirect.url).toBe('/sign-in')
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should redirect unauthenticated users from /customers to /sign-in', () => {
      const result = middlewareLogic({
        sessionCookie: null,
        isProtectedRoute: true,
        pathName: '/customers',
        customerBillingPortalOrganizationId: null,
        req: { nextUrl: 'https://example.com/customers' },
      })

      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        expect(result.redirect.url).toBe('/sign-in')
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should redirect unauthenticated users from /products to /sign-in', () => {
      const result = middlewareLogic({
        sessionCookie: null,
        isProtectedRoute: true,
        pathName: '/products',
        customerBillingPortalOrganizationId: null,
        req: { nextUrl: 'https://example.com/products' },
      })

      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        expect(result.redirect.url).toBe('/sign-in')
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should redirect unauthenticated users from /settings to /sign-in', () => {
      const result = middlewareLogic({
        sessionCookie: null,
        isProtectedRoute: true,
        pathName: '/settings',
        customerBillingPortalOrganizationId: null,
        req: { nextUrl: 'https://example.com/settings' },
      })

      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        expect(result.redirect.url).toBe('/sign-in')
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should redirect unauthenticated users from /finance/subscriptions to /sign-in', () => {
      const result = middlewareLogic({
        sessionCookie: null,
        isProtectedRoute: true,
        pathName: '/finance/subscriptions',
        customerBillingPortalOrganizationId: null,
        req: { nextUrl: 'https://example.com/finance/subscriptions' },
      })

      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        expect(result.redirect.url).toBe('/sign-in')
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should allow authenticated users to access merchant routes', () => {
      const result = middlewareLogic({
        sessionCookie: 'valid_session_cookie',
        isProtectedRoute: true,
        pathName: '/dashboard',
        customerBillingPortalOrganizationId: null,
        req: { nextUrl: 'https://example.com/dashboard' },
      })

      expect(result.proceed).toBe(true)
    })
  })

  describe('billing portal protected route auth guards', () => {
    it('should redirect unauthenticated users from billing portal customer page to customer-specific sign-in', () => {
      const result = middlewareLogic({
        sessionCookie: null,
        isProtectedRoute: true,
        pathName: '/billing-portal/org_123/cust_456',
        customerBillingPortalOrganizationId: null,
        req: {
          nextUrl:
            'https://example.com/billing-portal/org_123/cust_456',
        },
      })

      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        expect(result.redirect.url).toBe(
          '/billing-portal/org_123/cust_456/sign-in'
        )
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should redirect unauthenticated users from billing portal select-customer to org-level sign-in', () => {
      const result = middlewareLogic({
        sessionCookie: null,
        isProtectedRoute: true,
        pathName: '/billing-portal/org_123/select-customer',
        customerBillingPortalOrganizationId: null,
        req: {
          nextUrl:
            'https://example.com/billing-portal/org_123/select-customer',
        },
      })

      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        // select-customer is parsed as customerId, so redirects to select-customer/sign-in
        expect(result.redirect.url).toBe(
          '/billing-portal/org_123/select-customer/sign-in'
        )
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should redirect unauthenticated users from org-level billing portal page to org-level sign-in', () => {
      const result = middlewareLogic({
        sessionCookie: null,
        isProtectedRoute: true,
        pathName: '/billing-portal/org_123',
        customerBillingPortalOrganizationId: null,
        req: {
          nextUrl: 'https://example.com/billing-portal/org_123',
        },
      })

      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        expect(result.redirect.url).toBe(
          '/billing-portal/org_123/sign-in'
        )
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should allow authenticated users to access protected billing portal routes', () => {
      const result = middlewareLogic({
        sessionCookie: 'valid_session_cookie',
        isProtectedRoute: true,
        pathName: '/billing-portal/org_123/cust_456',
        customerBillingPortalOrganizationId: null,
        req: {
          nextUrl:
            'https://example.com/billing-portal/org_123/cust_456',
        },
      })

      expect(result.proceed).toBe(true)
    })
  })

  describe('billing portal sign-in routes remain public', () => {
    it('should allow unauthenticated access to org-level sign-in page', () => {
      const result = middlewareLogic({
        sessionCookie: null,
        isProtectedRoute: false, // sign-in routes are marked as public
        pathName: '/billing-portal/org_123/sign-in',
        customerBillingPortalOrganizationId: null,
        req: {
          nextUrl:
            'https://example.com/billing-portal/org_123/sign-in',
        },
      })

      expect(result.proceed).toBe(true)
    })

    it('should allow unauthenticated access to customer-specific sign-in page', () => {
      const result = middlewareLogic({
        sessionCookie: null,
        isProtectedRoute: false, // sign-in routes are marked as public
        pathName: '/billing-portal/org_123/cust_456/sign-in',
        customerBillingPortalOrganizationId: null,
        req: {
          nextUrl:
            'https://example.com/billing-portal/org_123/cust_456/sign-in',
        },
      })

      expect(result.proceed).toBe(true)
    })

    it('should allow authenticated access to sign-in pages (for redirect after login)', () => {
      const result = middlewareLogic({
        sessionCookie: 'valid_session_cookie',
        isProtectedRoute: false,
        pathName: '/billing-portal/org_123/sign-in',
        customerBillingPortalOrganizationId: null,
        req: {
          nextUrl:
            'https://example.com/billing-portal/org_123/sign-in',
        },
      })

      expect(result.proceed).toBe(true)
    })
  })

  describe('general sign-in and sign-up routes remain public', () => {
    it('should allow unauthenticated access to /sign-in', () => {
      const result = middlewareLogic({
        sessionCookie: null,
        isProtectedRoute: false,
        pathName: '/sign-in',
        customerBillingPortalOrganizationId: null,
        req: { nextUrl: 'https://example.com/sign-in' },
      })

      expect(result.proceed).toBe(true)
    })

    it('should allow unauthenticated access to /sign-up', () => {
      const result = middlewareLogic({
        sessionCookie: null,
        isProtectedRoute: false,
        pathName: '/sign-up',
        customerBillingPortalOrganizationId: null,
        req: { nextUrl: 'https://example.com/sign-up' },
      })

      expect(result.proceed).toBe(true)
    })
  })
})
