import { describe, expect, it } from 'bun:test'
import { middlewareLogic } from './middlewareLogic'

describe('middlewareLogic', () => {
  describe('no session cookie scenarios', () => {
    describe('protected route', () => {
      it('should redirect to org-level sign-in when path has org only (no customer segment)', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: true,
          pathName: '/billing-portal/org_123',
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

      it('should redirect to general sign-in when path does not start with /billing-portal/', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: true,
          pathName: '/dashboard',
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
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: true,
          pathName: '/api/trpc/users.list',
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
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/sign-in',
          req: { nextUrl: 'https://example.com/sign-in' },
        })

        expect(result.proceed).toBe(true)
      })

      it('should proceed for public API routes without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/api/trpc/public.getData',
          req: {
            nextUrl: 'https://example.com/api/trpc/public.getData',
          },
        })

        expect(result.proceed).toBe(true)
      })

      it('should proceed for checkoutSessions.public routes without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName:
            '/api/trpc/checkoutSessions.public.setCustomerEmail',
          req: {
            nextUrl:
              'https://example.com/api/trpc/checkoutSessions.public.setCustomerEmail',
          },
        })

        expect(result.proceed).toBe(true)
      })
    })
  })

  describe('dual-session scenarios', () => {
    describe('merchant routes with merchant session', () => {
      it('should proceed for protected routes when merchant session exists', () => {
        const result = middlewareLogic({
          merchantSessionCookie: 'valid_merchant_session',
          customerSessionCookie: null,
          isProtectedRoute: true,
          pathName: '/dashboard',
          req: { nextUrl: 'https://example.com/dashboard' },
        })

        expect(result.proceed).toBe(true)
      })

      it('should proceed for merchant API routes when merchant session exists', () => {
        const result = middlewareLogic({
          merchantSessionCookie: 'valid_merchant_session',
          customerSessionCookie: null,
          isProtectedRoute: true,
          pathName: '/api/trpc/users.list',
          req: { nextUrl: 'https://example.com/api/trpc/users.list' },
        })

        expect(result.proceed).toBe(true)
      })
    })

    describe('billing portal routes with customer session', () => {
      it('should proceed for billing portal when customer session exists', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: 'valid_customer_session',
          isProtectedRoute: true,
          pathName: '/billing-portal/org_456/settings',
          req: {
            nextUrl:
              'https://example.com/billing-portal/org_456/settings',
          },
        })

        expect(result.proceed).toBe(true)
      })

      it('should proceed for customerBillingPortal API routes with customer session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: 'valid_customer_session',
          isProtectedRoute: true,
          pathName: '/api/trpc/customerBillingPortal.getData',
          req: {
            nextUrl:
              'https://example.com/api/trpc/customerBillingPortal.getData',
          },
        })

        expect(result.proceed).toBe(true)
      })
    })

    describe('both sessions active - no redirect conflicts', () => {
      it('should allow merchant with customer session to access merchant routes', () => {
        const result = middlewareLogic({
          merchantSessionCookie: 'valid_merchant_session',
          customerSessionCookie: 'valid_customer_session',
          isProtectedRoute: true,
          pathName: '/dashboard',
          req: { nextUrl: 'https://example.com/dashboard' },
        })

        expect(result.proceed).toBe(true)
      })

      it('should allow customer with merchant session to access billing portal routes', () => {
        const result = middlewareLogic({
          merchantSessionCookie: 'valid_merchant_session',
          customerSessionCookie: 'valid_customer_session',
          isProtectedRoute: true,
          pathName: '/billing-portal/org_789/dashboard',
          req: {
            nextUrl:
              'https://example.com/billing-portal/org_789/dashboard',
          },
        })

        expect(result.proceed).toBe(true)
      })

      it('should allow both to proceed for public routes', () => {
        const result = middlewareLogic({
          merchantSessionCookie: 'valid_merchant_session',
          customerSessionCookie: 'valid_customer_session',
          isProtectedRoute: false,
          pathName: '/sign-in',
          req: { nextUrl: 'https://example.com/sign-in' },
        })

        expect(result.proceed).toBe(true)
      })
    })

    describe('wrong session for route type', () => {
      it('should redirect to merchant sign-in when accessing merchant route with only customer session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: 'valid_customer_session',
          isProtectedRoute: true,
          pathName: '/dashboard',
          req: { nextUrl: 'https://example.com/dashboard' },
        })

        expect(result.proceed).toBe(false)
        if (!result.proceed) {
          expect(result.redirect.url).toBe('/sign-in')
          expect(result.redirect.status).toBe(307)
        }
      })

      it('should redirect to billing portal sign-in when accessing billing portal with only merchant session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: 'valid_merchant_session',
          customerSessionCookie: null,
          isProtectedRoute: true,
          pathName: '/billing-portal/org_456/settings',
          req: {
            nextUrl:
              'https://example.com/billing-portal/org_456/settings',
          },
        })

        expect(result.proceed).toBe(false)
        if (!result.proceed) {
          expect(result.redirect.url).toBe(
            '/billing-portal/org_456/sign-in'
          )
          expect(result.redirect.status).toBe(307)
        }
      })
    })
  })

  describe('public routes coverage', () => {
    describe('authentication routes', () => {
      it('should allow access to /mcp without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/mcp',
          req: { nextUrl: 'https://example.com/mcp' },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to /billing-portal/org/sign-in without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/billing-portal/org_123/sign-in',
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
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
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
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
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
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })
    })

    describe('API and webhook routes', () => {
      it('should allow access to /api/ping without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/api/ping',
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
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
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
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to /api/testimonial-sets without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/api/testimonial-sets/abc123',
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
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
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
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
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
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to /api/openapi without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/api/openapi',
          req: { nextUrl: 'https://example.com/api/openapi' },
        })
        expect(result.proceed).toBe(true)
      })
    })

    describe('purchase and checkout routes', () => {
      it('should allow access to product purchase pages without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/product/premium-plan/purchase',
          req: {
            nextUrl:
              'https://example.com/product/premium-plan/purchase',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to purchase payment pages without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/purchase/pay/session_123',
          req: {
            nextUrl: 'https://example.com/purchase/pay/session_123',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to /purchase/post-payment without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/purchase/post-payment',
          req: {
            nextUrl: 'https://example.com/purchase/post-payment',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to purchase verify pages without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/purchase/verify/token_abc123',
          req: {
            nextUrl:
              'https://example.com/purchase/verify/token_abc123',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to purchase access pages without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/purchase/access/resource_123',
          req: {
            nextUrl:
              'https://example.com/purchase/access/resource_123',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to product post-purchase pages without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/product/premium/post-purchase/success',
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
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to add-payment-method pages without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/add-payment-method/session_123',
          req: {
            nextUrl:
              'https://example.com/add-payment-method/session_123',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to price purchase pages without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/price/price_123/purchase',
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
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to customerBillingPortal.requestMagicLink without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName:
            '/api/trpc/customerBillingPortal.requestMagicLink',
          req: {
            nextUrl:
              'https://example.com/api/trpc/customerBillingPortal.requestMagicLink',
          },
        })
        expect(result.proceed).toBe(true)
      })

      it('should allow access to checkoutSessions.public procedures without session', () => {
        const paths = [
          '/api/trpc/checkoutSessions.public.create',
          '/api/trpc/checkoutSessions.public.setCustomerEmail',
          '/api/trpc/checkoutSessions.public.setPaymentMethodType',
        ]
        paths.forEach((path) => {
          const result = middlewareLogic({
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to purchases.requestAccess without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/api/trpc/purchases.requestAccess',
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
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
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
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to /invite-discord without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/invite-discord',
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
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
            req: { nextUrl: `https://example.com${path}` },
          })
          expect(result.proceed).toBe(true)
        })
      })

      it('should allow access to invoice view pages without session', () => {
        const result = middlewareLogic({
          merchantSessionCookie: null,
          customerSessionCookie: null,
          isProtectedRoute: false,
          pathName: '/invoice/view/inv_123456',
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
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
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
            merchantSessionCookie: null,
            customerSessionCookie: null,
            isProtectedRoute: false,
            pathName: path,
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
        merchantSessionCookie: '',
        customerSessionCookie: '',
        isProtectedRoute: true,
        pathName: '/dashboard',
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
        merchantSessionCookie: undefined,
        customerSessionCookie: undefined,
        isProtectedRoute: true,
        pathName: '/dashboard',
        req: { nextUrl: 'https://example.com/dashboard' },
      })

      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        expect(result.redirect.url).toBe('/sign-in')
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should redirect to customer-specific sign-in when path includes customerId', () => {
      const result = middlewareLogic({
        merchantSessionCookie: null,
        customerSessionCookie: null,
        isProtectedRoute: true,
        pathName: '/billing-portal/org_123/cust_456/dashboard',
        req: {
          nextUrl:
            'https://example.com/billing-portal/org_123/cust_456/dashboard',
        },
      })

      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        // Should redirect to customer-specific sign-in, not org-level
        expect(result.redirect.url).toBe(
          '/billing-portal/org_123/cust_456/sign-in'
        )
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should not redirect again when already on customer-specific sign-in page', () => {
      const result = middlewareLogic({
        merchantSessionCookie: null,
        customerSessionCookie: null,
        isProtectedRoute: false, // sign-in pages are public
        pathName: '/billing-portal/org_123/cust_456/sign-in',
        req: {
          nextUrl:
            'https://example.com/billing-portal/org_123/cust_456/sign-in',
        },
      })

      expect(result.proceed).toBe(true)
    })

    it('should redirect to customer-specific sign-in when path segment after organizationId is treated as customerId', () => {
      const result = middlewareLogic({
        merchantSessionCookie: null,
        customerSessionCookie: null,
        isProtectedRoute: true,
        pathName: '/billing-portal/org_complex_123/nested/path/here',
        req: {
          nextUrl:
            'https://example.com/billing-portal/org_complex_123/nested/path/here',
        },
      })

      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        // 'nested' is treated as customerId, so redirects to customer-specific sign-in
        expect(result.redirect.url).toBe(
          '/billing-portal/org_complex_123/nested/sign-in'
        )
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should redirect to general sign-in when billing-portal path has no organizationId', () => {
      const result = middlewareLogic({
        merchantSessionCookie: null,
        customerSessionCookie: null,
        isProtectedRoute: true,
        pathName: '/billing-portal/',
        req: {
          nextUrl: 'https://example.com/billing-portal/',
        },
      })

      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        expect(result.redirect.url).toBe('/sign-in')
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should handle billing portal path exactly at root', () => {
      const result = middlewareLogic({
        merchantSessionCookie: 'valid_merchant_session',
        customerSessionCookie: 'valid_customer_session',
        isProtectedRoute: true,
        pathName: '/billing-portal/org_456',
        req: {
          nextUrl: 'https://example.com/billing-portal/org_456',
        },
      })

      expect(result.proceed).toBe(true)
    })

    it('should proceed for merchant routes when both sessions are active', () => {
      const result = middlewareLogic({
        merchantSessionCookie: 'valid_merchant_session',
        customerSessionCookie: 'valid_customer_session',
        isProtectedRoute: true,
        pathName: '/dashboard',
        req: { nextUrl: 'https://example.com/dashboard' },
      })

      // Both sessions present, merchant route uses merchant session
      expect(result.proceed).toBe(true)
    })

    it('should handle paths with query parameters correctly', () => {
      const result = middlewareLogic({
        merchantSessionCookie: null,
        customerSessionCookie: null,
        isProtectedRoute: true,
        pathName: '/billing-portal/org_123/cust_456',
        req: {
          nextUrl:
            'https://example.com/billing-portal/org_123/cust_456?param=value',
        },
      })

      // Query params should not affect path matching
      // With customer ID segment, redirects to customer-specific sign-in
      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        expect(result.redirect.url).toBe(
          '/billing-portal/org_123/cust_456/sign-in'
        )
        expect(result.redirect.status).toBe(307)
      }
    })

    it('should handle paths with URL fragments correctly', () => {
      const result = middlewareLogic({
        merchantSessionCookie: null,
        customerSessionCookie: null,
        isProtectedRoute: true,
        pathName: '/billing-portal/org_123/cust_789',
        req: {
          nextUrl:
            'https://example.com/billing-portal/org_123/cust_789#section',
        },
      })

      // URL fragments should not affect path matching
      // With customer ID segment, redirects to customer-specific sign-in
      expect(result.proceed).toBe(false)
      if (!result.proceed) {
        expect(result.redirect.url).toBe(
          '/billing-portal/org_123/cust_789/sign-in'
        )
        expect(result.redirect.status).toBe(307)
      }
    })
  })
})
