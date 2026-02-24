import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import { getPurchases } from './purchaseHandlers'
import {
  assert200Success,
  assert405MethodNotAllowed,
  assertHandlerResponse,
} from './test-utils'

const mockPurchases = [
  {
    id: 'pur_123',
    livemode: true,
    status: 'succeeded',
    amount: 4900,
    currency: 'usd',
    createdAt: '2024-01-10T10:00:00Z',
    product: {
      id: 'prod_123',
      slug: 'premium-template',
      name: 'Premium Template',
    },
  },
  {
    id: 'pur_456',
    livemode: true,
    status: 'succeeded',
    amount: 9900,
    currency: 'usd',
    createdAt: '2024-02-20T10:00:00Z',
    product: {
      id: 'prod_456',
      slug: 'advanced-course',
      name: 'Advanced Course',
    },
  },
  {
    id: 'pur_789',
    livemode: true,
    status: 'succeeded',
    amount: 14900,
    currency: 'usd',
    createdAt: '2024-03-05T10:00:00Z',
    product: {
      id: 'prod_789',
      slug: 'pro-toolkit',
      name: 'Pro Toolkit',
    },
  },
]

const createMockFlowgladServer = () => {
  const mockGetPurchases = vi.fn()

  const server = {
    getPurchases: mockGetPurchases,
  } as unknown as FlowgladServer

  return {
    server,
    mocks: {
      getPurchases: mockGetPurchases,
    },
  }
}

describe('getPurchases handler', () => {
  it('returns 405 for GET request', async () => {
    const { server } = createMockFlowgladServer()

    const result = await getPurchases(
      {
        method: HTTPMethod.GET,
        data: {},
      } as unknown as Parameters<typeof getPurchases>[0],
      server
    )

    assert405MethodNotAllowed(result)
  })

  it('returns purchases via FlowgladServer', async () => {
    const { server, mocks } = createMockFlowgladServer()
    mocks.getPurchases.mockResolvedValue({
      purchases: mockPurchases,
    })

    const result = await getPurchases(
      {
        method: HTTPMethod.POST,
        data: {},
      },
      server
    )

    expect(mocks.getPurchases).toHaveBeenCalledWith({})
    assert200Success(result, {
      purchases: mockPurchases,
    })
  })

  it('respects limit param', async () => {
    const { server, mocks } = createMockFlowgladServer()
    const limitedPurchases = mockPurchases.slice(0, 2)
    mocks.getPurchases.mockResolvedValue({
      purchases: limitedPurchases,
    })

    const result = await getPurchases(
      {
        method: HTTPMethod.POST,
        data: { limit: 2 },
      },
      server
    )

    expect(mocks.getPurchases).toHaveBeenCalledWith({ limit: 2 })
    assert200Success(result, {
      purchases: limitedPurchases,
    })
  })

  it('returns empty array when no purchases', async () => {
    const { server, mocks } = createMockFlowgladServer()
    mocks.getPurchases.mockResolvedValue({
      purchases: [],
    })

    const result = await getPurchases(
      {
        method: HTTPMethod.POST,
        data: {},
      },
      server
    )

    assert200Success(result, { purchases: [] })
  })

  it('returns 500 with parsed error on failure', async () => {
    const { server, mocks } = createMockFlowgladServer()
    mocks.getPurchases.mockRejectedValue(
      new Error('404 {"message": "Customer not found"}')
    )

    const result = await getPurchases(
      {
        method: HTTPMethod.POST,
        data: {},
      },
      server
    )

    assertHandlerResponse(result, {
      status: 500,
      error: {
        code: '404',
        json: { message: 'Customer not found' },
      },
      data: {},
    })
  })
})
