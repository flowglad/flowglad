import type {
  FlowgladServer,
  FlowgladServerAdmin,
} from '@flowglad/server'
import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import { nextRouteHandler } from './nextRouteHandler'
import * as serverModule from './server'

// Mock NextRequest and NextResponse
class MockNextRequest {
  method: string
  nextUrl: {
    searchParams: URLSearchParams
    pathname: string
  }
  private bodyData: Record<string, unknown>

  constructor(
    url: string,
    init?: { method?: string; body?: string }
  ) {
    this.method = init?.method ?? 'GET'
    const urlObj = new URL(url)
    this.nextUrl = {
      searchParams: urlObj.searchParams,
      pathname: urlObj.pathname,
    }
    this.bodyData = init?.body ? JSON.parse(init.body) : {}
  }

  async json() {
    return this.bodyData
  }

  headers = {
    get: (_key: string) => null,
  }
}

// Mock NextResponse
const mockNextResponseJson = vi.fn(
  (body: unknown, init?: { status?: number }) => ({
    json: async () => body,
    status: init?.status ?? 200,
  })
)

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) =>
      mockNextResponseJson(body, init),
  },
}))

const createMockFlowglad = () =>
  ({
    getBilling: async () => ({
      subscription: null,
      customer: { id: 'cust_1' },
    }),
  }) as unknown as FlowgladServer

describe('nextRouteHandler with flowgladAdmin option', () => {
  it('returns status 200 with pricingModel.id when GET /pricing-models/default called without auth', async () => {
    const mockAdmin = {
      getDefaultPricingModel: async () => ({
        pricingModel: { id: 'pm_123', name: 'Basic' },
      }),
    } as unknown as FlowgladServerAdmin

    const handler = nextRouteHandler({
      getCustomerExternalId: async () => {
        throw new Error('Should not be called')
      },
      flowglad: () => createMockFlowglad(),
      flowgladAdmin: () => mockAdmin,
    })

    const request = new MockNextRequest(
      'http://localhost/api/flowglad/pricing-models/default',
      { method: 'GET' }
    )

    const response = await handler.GET(request as any, {
      params: { path: ['pricing-models', 'default'] },
    })

    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data.pricingModel.id).toBe('pm_123')
  })

  it('returns status 501 when pricing endpoint called but flowgladAdmin not provided', async () => {
    const handler = nextRouteHandler({
      getCustomerExternalId: async () => 'user_1',
      flowglad: () => createMockFlowglad(),
    })

    const request = new MockNextRequest(
      'http://localhost/api/flowglad/pricing-models/default',
      { method: 'GET' }
    )

    const response = await handler.GET(request as any, {
      params: { path: ['pricing-models', 'default'] },
    })

    expect(response.status).toBe(501)
  })

  it('returns status 500 when flowgladAdmin.getDefaultPricingModel throws', async () => {
    const mockAdmin = {
      getDefaultPricingModel: async () => {
        throw new Error('Upstream API unavailable')
      },
    } as unknown as FlowgladServerAdmin

    const handler = nextRouteHandler({
      getCustomerExternalId: async () => 'user_1',
      flowglad: () => createMockFlowglad(),
      flowgladAdmin: () => mockAdmin,
    })

    const request = new MockNextRequest(
      'http://localhost/api/flowglad/pricing-models/default',
      { method: 'GET' }
    )

    const response = await handler.GET(request as any, {
      params: { path: ['pricing-models', 'default'] },
    })

    const body = await response.json()
    expect(response.status).toBe(500)
    expect(body.error.message).toBe('Upstream API unavailable')
  })

  it('calls getCustomerExternalId for authenticated route even when flowgladAdmin is provided', async () => {
    const getCustomerExternalId = vi
      .fn()
      .mockResolvedValue('user_123')
    const mockFlowglad = {
      getBilling: async () => ({
        subscription: null,
        customer: { id: 'cust_1' },
      }),
    } as unknown as FlowgladServer

    const handler = nextRouteHandler({
      getCustomerExternalId,
      flowglad: () => mockFlowglad,
      flowgladAdmin: () =>
        ({
          getDefaultPricingModel: async () => ({}),
        }) as unknown as FlowgladServerAdmin,
    })

    const request = new MockNextRequest(
      'http://localhost/api/flowglad/customers/billing',
      { method: 'POST' }
    )

    await handler.POST(request as any, {
      params: { path: ['customers', 'billing'] },
    })

    expect(getCustomerExternalId).toHaveBeenCalledTimes(1)
  })
})

describe('FlowgladServerAdmin re-export', () => {
  it('exports FlowgladServerAdmin from @flowglad/nextjs/server', () => {
    expect(typeof serverModule.FlowgladServerAdmin).toBe('function')
  })
})
