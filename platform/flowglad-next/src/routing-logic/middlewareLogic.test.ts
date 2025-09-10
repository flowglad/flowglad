import { describe, it, expect } from 'vitest'
import { middlewareLogic } from './middlewareLogic'

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

      it('should proceed for checkoutSessions.public routes without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName:
            '/api/trpc/checkoutSessions.public.setCustomerEmail',
          customerBillingPortalOrganizationId: null,
          req: {
            nextUrl:
              'https://example.com/api/trpc/checkoutSessions.public.setCustomerEmail',
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

      it('should proceed for checkoutSessions.public routes when public even with customerBillingPortalOrganizationId', () => {
        const result = middlewareLogic({
          sessionCookie: 'valid_session_cookie',
          isProtectedRoute: false,
          pathName:
            '/api/trpc/checkoutSessions.public.setPaymentMethodType',
          customerBillingPortalOrganizationId: 'org_456',
          req: {
            nextUrl:
              'https://example.com/api/trpc/checkoutSessions.public.setPaymentMethodType',
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

  describe('public routes coverage', () => {
    describe('authentication routes', () => {
      it('should allow access to /mcp without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/mcp',
          customerBillingPortalOrganizationId: null,
          req: { nextUrl: 'https://example.com/mcp' },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to /billing-portal/org/sign-in without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
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

      it('should allow access to /sign-in and its sub-paths without session', () => {
        const paths = [
          '/sign-in',
          '/sign-in/callback',
          '/sign-in/verify',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to /sign-up and its sub-paths without session', () => {
        const paths = [
          '/sign-up',
          '/sign-up/verify',
          '/sign-up/complete',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to Better Auth URLs without session', () => {
        const paths = [
          '/api/auth/signin',
          '/api/auth/signout',
          '/api/auth/callback/google',
          '/api/auth/session',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })
    })

    describe('API and webhook routes', () => {
      it('should allow access to /api/ping without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/api/ping',
          customerBillingPortalOrganizationId: null,
          req: { nextUrl: 'https://example.com/api/ping' },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to webhook-stripe endpoints without session', () => {
        const paths = [
          '/api/webhook-stripe/events',
          '/api/webhook-stripe/checkout',
          '/api/webhook-stripe/subscription',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to generic webhook endpoints without session', () => {
        const paths = [
          '/api/webhook-github',
          '/api/webhook-slack',
          '/api/webhook-custom',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to /api/testimonial-sets without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/api/testimonial-sets/abc123',
          customerBillingPortalOrganizationId: null,
          req: {
            nextUrl:
              'https://example.com/api/testimonial-sets/abc123',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to v1 API endpoints without session', () => {
        const paths = [
          '/api/v1/users',
          '/api/v1/products',
          '/api/v1/orders/123',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to MCP API endpoints without session', () => {
        const paths = [
          '/api/mcp',
          '/api/mcp/status',
          '/api/mcp/health/check',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to AI API endpoints without session', () => {
        const paths = [
          '/api/ai',
          '/api/ai/chat',
          '/api/ai/completion',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to /api/openapi without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/api/openapi',
          customerBillingPortalOrganizationId: null,
          req: { nextUrl: 'https://example.com/api/openapi' },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to hosted billing API without session', () => {
        const paths = [
          '/api/hosted-billing/checkout',
          '/api/hosted-billing/subscriptions',
          '/api/hosted-billing/invoices/123',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })
    })

    describe('purchase and checkout routes', () => {
      it('should allow access to product purchase pages without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/product/premium-plan/purchase',
          customerBillingPortalOrganizationId: null,
          req: {
            nextUrl:
              'https://example.com/product/premium-plan/purchase',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to purchase payment pages without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/purchase/pay/session_123',
          customerBillingPortalOrganizationId: null,
          req: {
            nextUrl: 'https://example.com/purchase/pay/session_123',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to /purchase/post-payment without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/purchase/post-payment',
          customerBillingPortalOrganizationId: null,
          req: {
            nextUrl: 'https://example.com/purchase/post-payment',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to purchase verify pages without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/purchase/verify/token_abc123',
          customerBillingPortalOrganizationId: null,
          req: {
            nextUrl:
              'https://example.com/purchase/verify/token_abc123',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to purchase access pages without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/purchase/access/resource_123',
          customerBillingPortalOrganizationId: null,
          req: {
            nextUrl:
              'https://example.com/purchase/access/resource_123',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to product post-purchase pages without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/product/premium/post-purchase/success',
          customerBillingPortalOrganizationId: null,
          req: {
            nextUrl:
              'https://example.com/product/premium/post-purchase/success',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to checkout pages without session', () => {
        const paths = [
          '/checkout/new',
          '/checkout/session_123',
          '/checkout/complete',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to add-payment-method pages without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/add-payment-method/session_123',
          customerBillingPortalOrganizationId: null,
          req: {
            nextUrl:
              'https://example.com/add-payment-method/session_123',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to price purchase pages without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/price/price_123/purchase',
          customerBillingPortalOrganizationId: null,
          req: {
            nextUrl: 'https://example.com/price/price_123/purchase',
          },
        })
        expect(result.proceed).toBe(true)
      })
    })

    describe('TRPC public routes', () => {
      it('should allow access to public TRPC procedures without session', () => {
        const paths = [
          '/api/trpc/public.getProducts',
          '/api/trpc/public.getPricing',
          '/api/trpc/public.getTestimonials',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to customerBillingPortal.requestMagicLink without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName:
            '/api/trpc/customerBillingPortal.requestMagicLink',
          customerBillingPortalOrganizationId: null,
          req: {
            nextUrl:
              'https://example.com/api/trpc/customerBillingPortal.requestMagicLink',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to purchase session procedures without session', () => {
        const paths = [
          '/api/trpc/purchases.createSession',
          '/api/trpc/purchases.getSession',
          '/api/trpc/purchases.updateSession',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to checkoutSessions.public procedures without session', () => {
        const paths = [
          '/api/trpc/checkoutSessions.public.create',
          '/api/trpc/checkoutSessions.public.setCustomerEmail',
          '/api/trpc/checkoutSessions.public.setPaymentMethodType',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to purchases.requestAccess without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/api/trpc/purchases.requestAccess',
          customerBillingPortalOrganizationId: null,
          req: {
            nextUrl:
              'https://example.com/api/trpc/purchases.requestAccess',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to discount procedures without session', () => {
        const paths = [
          '/api/trpc/discounts.attempt',
          '/api/trpc/discounts.clear',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })
    })

    describe('miscellaneous public routes', () => {
      it('should allow access to /handler paths without session', () => {
        const paths = [
          '/handler/callback',
          '/handler/webhook',
          '/handler/oauth/return',
          '/api/trpc/utils.logout',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to /invite-discord without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/invite-discord',
          customerBillingPortalOrganizationId: null,
          req: { nextUrl: 'https://example.com/invite-discord' },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to apple-touch-icon files without session', () => {
        const paths = [
          '/apple-touch-icon.png',
          '/apple-touch-icon-precomposed.png',
          '/apple-touch-icon-120x120.png',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to invoice view pages without session', () => {
        const result = middlewareLogic({
          sessionCookie: null,
          isProtectedRoute: false,
          pathName: '/invoice/view/inv_123456',
          customerBillingPortalOrganizationId: null,
          req: {
            nextUrl: 'https://example.com/invoice/view/inv_123456',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to UI pages without session', () => {
        const paths = [
          '/ui/components',
          '/ui/docs',
          '/ui/examples/button',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to preview-ui routes without session', () => {
        const paths = [
          '/preview-ui',
          '/preview-ui/components',
          '/preview-ui/examples/form',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            sessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            customerBillingPortalOrganizationId: null,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
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
