import { describe, it, expect } from 'vitest'
import { middlewareLogic } from './middleware'

describe('middlewareLogic', () => {
  describe('no session cookie scenarios', () => {
    describe('protected route', () => {
      it('should redirect to billing portal sign-in when path starts with /billing-portal/', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: true,
          pathName: '/billing-portal/org_123/dashboard',
          customerBillingPortalOrganizationId: null,
          req: {
            nextUrl:
              'https://example.com/billing-portal/org_123/dashboard',
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

      it('should redirect to general sign-in when path does not start with /billing-portal/', () => {
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

      it('should redirect to general sign-in for API routes when no session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: true,
          pathName: '/api/trpc/users.list',
          customerBillingPortalOrganizationId: null,
          req: { nextUrl: 'https://example.com/api/trpc/users.list' },
        })

        expect(result.proceed).toBe(false)
        if (!result.proceed) {
          expect(result.redirect.url).toBe('/sign-in')
          expect(result.redirect.status).toBe(307)
        }
      })
    })

    describe('public route', () => {
      it('should proceed without redirect when accessing public route without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/sign-in',
          customerBillingPortalOrganizationId: null,
          req: { nextUrl: 'https://example.com/sign-in' },
        })

        expect(result.proceed).toBe(true)
      })

      it('should proceed for public API routes without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/api/trpc/public.getData',
          customerBillingPortalOrganizationId: null,
          req: {
            nextUrl: 'https://example.com/api/trpc/public.getData',
          },
        })

        expect(result.proceed).toBe(true)
      })
    })
  })

  describe('session cookie exists scenarios', () => {
    describe('with customerBillingPortalOrganizationId set', () => {
      it('should proceed when path matches billing portal organization', () => {
        const result = middlewareLogic({
          sessionCookie: 'valid_session_cookie',
          isProtectedRoute: true,
          pathName: '/billing-portal/org_456/settings',
          customerBillingPortalOrganizationId: 'org_456',
          req: {
            nextUrl:
              'https://example.com/billing-portal/org_456/settings',
          },
        })

        expect(result.proceed).toBe(true)
      })

      it('should proceed for customerBillingPortal API routes regardless of org mismatch', () => {
        const result = middlewareLogic({
          sessionCookie: 'valid_session_cookie',
          isProtectedRoute: true,
          pathName: '/api/trpc/customerBillingPortal.getData',
          customerBillingPortalOrganizationId: 'org_456',
          req: {
            nextUrl:
              'https://example.com/api/trpc/customerBillingPortal.getData',
          },
        })

        expect(result.proceed).toBe(true)
      })

      it('should redirect to billing portal when path does not match organization', () => {
        const result = middlewareLogic({
          sessionCookie: 'valid_session_cookie',
          isProtectedRoute: true,
          pathName: '/dashboard',
          customerBillingPortalOrganizationId: 'org_456',
          req: { nextUrl: 'https://example.com/dashboard' },
        })

        expect(result.proceed).toBe(false)
        if (!result.proceed) {
          expect(result.redirect.url).toBe('/billing-portal/org_456')
          expect(result.redirect.status).toBe(307)
        }
      })

      it('should redirect when accessing different billing portal organization', () => {
        const result = middlewareLogic({
          sessionCookie: 'valid_session_cookie',
          isProtectedRoute: true,
          pathName: '/billing-portal/org_789/dashboard',
          customerBillingPortalOrganizationId: 'org_456',
          req: {
            nextUrl:
              'https://example.com/billing-portal/org_789/dashboard',
          },
        })

        expect(result.proceed).toBe(false)
        if (!result.proceed) {
          expect(result.redirect.url).toBe('/billing-portal/org_456')
          expect(result.redirect.status).toBe(307)
        }
      })

      it('should redirect for regular API routes when customerBillingPortalOrganizationId is set', () => {
        const result = middlewareLogic({
          sessionCookie: 'valid_session_cookie',
          isProtectedRoute: true,
          pathName: '/api/trpc/users.list',
          customerBillingPortalOrganizationId: 'org_456',
          req: { nextUrl: 'https://example.com/api/trpc/users.list' },
        })

        expect(result.proceed).toBe(false)
        if (!result.proceed) {
          expect(result.redirect.url).toBe('/billing-portal/org_456')
          expect(result.redirect.status).toBe(307)
        }
      })

      it('should proceed for public routes even with customerBillingPortalOrganizationId', () => {
        const result = middlewareLogic({
          sessionCookie: 'valid_session_cookie',
          isProtectedRoute: false,
          pathName: '/api/webhook-stripe/events',
          customerBillingPortalOrganizationId: 'org_456',
          req: {
            nextUrl: 'https://example.com/api/webhook-stripe/events',
          },
        })

        expect(result.proceed).toBe(true)
      })
    })

    describe('without customerBillingPortalOrganizationId', () => {
      it('should proceed for protected routes when session exists', () => {
        const result = middlewareLogic({
          sessionCookie: 'valid_session_cookie',
          isProtectedRoute: true,
          pathName: '/dashboard',
          customerBillingPortalOrganizationId: null,
          req: { nextUrl: 'https://example.com/dashboard' },
        })

        expect(result.proceed).toBe(true)
      })

      it('should proceed for API routes when session exists', () => {
        const result = middlewareLogic({
          sessionCookie: 'valid_session_cookie',
          isProtectedRoute: true,
          pathName: '/api/trpc/users.list',
          customerBillingPortalOrganizationId: null,
          req: { nextUrl: 'https://example.com/api/trpc/users.list' },
        })

        expect(result.proceed).toBe(true)
      })

      it('should proceed for public routes when session exists', () => {
        const result = middlewareLogic({
          sessionCookie: 'valid_session_cookie',
          isProtectedRoute: false,
          pathName: '/sign-in',
          customerBillingPortalOrganizationId: null,
          req: { nextUrl: 'https://example.com/sign-in' },
        })

        expect(result.proceed).toBe(true)
      })
    })
  })

  describe('edge cases', () => {
    it('should handle empty sessionCookie string as no session', () => {
      const result = middlewareLogic({
        sessionCookie: '',
        isProtectedRoute: true,
        pathName: '/dashboard',
        customerBillingPortalOrganizationId: null,
        req: { nextUrl: 'https://example.com/dashboard' },
      })

      // Empty string should be treated as no session
      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        expect(result.redirect.url).toBe('/sign-in')
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should handle undefined sessionCookie as no session', () => {
      const result = middlewareLogic({
        sessionCookie: undefined,
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

    it('should extract organization ID correctly from nested billing portal paths', () => {
      const result = middlewareLogic({
        sessionCookie: null,
        isProtectedRoute: true,
        pathName: '/billing-portal/org_complex_123/nested/path/here',
        customerBillingPortalOrganizationId: null,
        req: {
          nextUrl:
            'https://example.com/billing-portal/org_complex_123/nested/path/here',
        },
      })

      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        expect(result.redirect.url).toBe(
          '/billing-portal/org_complex_123/sign-in'
        )
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should handle billing portal path exactly at root', () => {
      const result = middlewareLogic({
        sessionCookie: 'valid_session_cookie',
        isProtectedRoute: true,
        pathName: '/billing-portal/org_456',
        customerBillingPortalOrganizationId: 'org_456',
        req: {
          nextUrl: 'https://example.com/billing-portal/org_456',
        },
      })

      expect(result.proceed).toBe(true)
    })

    it('should handle empty customerBillingPortalOrganizationId string as null', () => {
      const result = middlewareLogic({
        sessionCookie: 'valid_session_cookie',
        isProtectedRoute: true,
        pathName: '/dashboard',
        customerBillingPortalOrganizationId: '',
        req: { nextUrl: 'https://example.com/dashboard' },
      })

      // Empty string should be treated as falsy value, so proceed
      expect(result.proceed).toBe(true)
    })

    it('should handle paths with query parameters correctly', () => {
      const result = middlewareLogic({
        sessionCookie: null,
        isProtectedRoute: true,
        pathName: '/billing-portal/org_123/page',
        customerBillingPortalOrganizationId: null,
        req: {
          nextUrl:
            'https://example.com/billing-portal/org_123/page?param=value',
        },
      })

      // Query params should not affect path matching
      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        expect(result.redirect.url).toBe(
          '/billing-portal/org_123/sign-in'
        )
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should handle paths with URL fragments correctly', () => {
      const result = middlewareLogic({
        sessionCookie: null,
        isProtectedRoute: true,
        pathName: '/billing-portal/org_123/page',
        customerBillingPortalOrganizationId: null,
        req: {
          nextUrl:
            'https://example.com/billing-portal/org_123/page#section',
        },
      })

      // URL fragments should not affect path matching
      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        expect(result.redirect.url).toBe(
          '/billing-portal/org_123/sign-in'
        )
        expect(result.redirect.status).toBe(307)
      }
    })
  })
})
