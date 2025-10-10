import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from './route'

// Dynamic fixtures for mocks
let mockSelectCheckoutSessionsResult: any[] = []

vi.mock('@/db/adminTransaction', () => ({
  adminTransaction: vi.fn(async (cb: any) => cb({ transaction: {} })),
  comprehensiveAdminTransaction: vi.fn(async (cb: any) => {
    const mockResult = await cb({ transaction: {} })
    return mockResult.result
  }),
}))

vi.mock('@/db/tableMethods/checkoutSessionMethods', () => ({
  selectCheckoutSessions: vi.fn(
    async () => mockSelectCheckoutSessionsResult
  ),
}))

vi.mock(
  '@/utils/bookkeeping/processNonPaymentCheckoutSession',
  () => ({
    processNonPaymentCheckoutSession: vi.fn(async () => ({
      purchase: { id: 'pur_1', priceId: 'price_1', livemode: true },
      invoice: { id: 'inv_1' },
      eventsToInsert: [],
    })),
  })
)

vi.mock('@/db/tableMethods/priceMethods', () => ({
  selectPriceProductAndOrganizationByPriceWhere: vi.fn(async () => [
    { product: { id: 'prod_1', livemode: true } },
  ]),
}))

vi.mock('@/utils/purchaseAccessSessionState', () => ({
  createPurchaseAccessSession: vi.fn(async () => {}),
}))

vi.mock('@/utils/checkoutSessionState', () => ({
  deleteCheckoutSessionCookie: vi.fn(async () => {}),
}))

vi.mock('@/trigger/generate-invoice-pdf', () => ({
  generateInvoicePdfIdempotently: vi.fn(async () => {}),
  generateInvoicePdfTask: vi.fn(),
}))

vi.mock('@/trigger/generate-receipt-pdf', () => ({
  generatePaymentReceiptPdfIdempotently: vi.fn(async () => {}),
}))

function makeRequest(url: string): any {
  return {
    nextUrl: new URL(url),
    url,
  } as any
}

describe('post-payment route GET', () => {
  beforeEach(() => {
    mockSelectCheckoutSessionsResult = []
    vi.clearAllMocks()
  })

  it('returns 400 when no query params provided', async () => {
    const res = await GET(
      makeRequest('https://example.com/purchase/post-payment')
    )
    expect(res.status).toBe(400)
    const text = await res.text()
    expect(text).toMatch(
      /Either payment_intent, setup_intent, or checkout_session is required/
    )
  })

  it('redirects to fallback success URL when checkout_session has no successUrl', async () => {
    const checkoutSessionId = 'cs_123'
    mockSelectCheckoutSessionsResult = [
      {
        id: checkoutSessionId,
        organizationId: 'org_1',
        successUrl: null,
        livemode: true,
        priceId: 'price_1',
      },
    ]

    const res = await GET(
      makeRequest(
        `https://example.com/purchase/post-payment?checkout_session=${checkoutSessionId}`
      )
    )

    expect(res.status).toBe(303)
    const location = res.headers.get('location')
    expect(
      location?.endsWith(`/checkout/${checkoutSessionId}/success`)
    ).toBe(true)
  })

  it('redirects to provided successUrl when present on checkout_session', async () => {
    const checkoutSessionId = 'cs_456'
    const successUrl = 'https://redirect.example/success'
    mockSelectCheckoutSessionsResult = [
      {
        id: checkoutSessionId,
        organizationId: 'org_2',
        successUrl,
        livemode: true,
        priceId: 'price_2',
      },
    ]

    const res = await GET(
      makeRequest(
        `https://example.com/purchase/post-payment?checkout_session=${checkoutSessionId}`
      )
    )

    expect(res.status).toBe(303)
    const location = res.headers.get('location')
    expect(location).toBe(successUrl)
  })
})
