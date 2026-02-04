import { describe, expect, it } from 'bun:test'
import { middlewareLogic } from './middlewareLogic'

describe('middlewareLogic - public routes coverage', () => {
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
          nextUrl: 'https://example.com/api/testimonial-sets/abc123',
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
      const paths = ['/api/ai', '/api/ai/chat', '/api/ai/completion']
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
        req: { nextUrl: 'https://example.com/purchase/post-payment' },
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
          nextUrl: 'https://example.com/purchase/verify/token_abc123',
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
          nextUrl: 'https://example.com/purchase/access/resource_123',
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
        pathName: '/api/trpc/customerBillingPortal.requestMagicLink',
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
    it('should allow access to batched procedures on checkout sessions without session', () => {
      const paths = [
        '/api/trpc/checkoutSessions.public.attemptDiscountCode,checkoutSessions.public.clearDiscountCode,checkoutSessions.public.confirm',
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
