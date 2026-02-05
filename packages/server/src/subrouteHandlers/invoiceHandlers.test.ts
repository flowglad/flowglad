import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import { getInvoices } from './invoiceHandlers'
import {
  assert200Success,
  assert405MethodNotAllowed,
  assertHandlerResponse,
} from './test-utils'

const mockInvoices = [
  {
    id: 'inv_123',
    livemode: true,
    status: 'paid',
    amountDue: 9900,
    currency: 'usd',
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'inv_456',
    livemode: true,
    status: 'paid',
    amountDue: 19900,
    currency: 'usd',
    createdAt: '2024-02-15T10:00:00Z',
  },
  {
    id: 'inv_789',
    livemode: true,
    status: 'open',
    amountDue: 29900,
    currency: 'usd',
    createdAt: '2024-03-15T10:00:00Z',
  },
]

const createMockFlowgladServer = () => {
  const mockGetInvoices = vi.fn()

  const server = {
    getInvoices: mockGetInvoices,
  } as unknown as FlowgladServer

  return {
    server,
    mocks: {
      getInvoices: mockGetInvoices,
    },
  }
}

describe('getInvoices handler', () => {
  it('returns 405 for GET request', async () => {
    const { server } = createMockFlowgladServer()

    const result = await getInvoices(
      {
        method: HTTPMethod.GET,
        data: {},
      } as unknown as Parameters<typeof getInvoices>[0],
      server
    )

    assert405MethodNotAllowed(result)
  })

  it('returns invoices via FlowgladServer', async () => {
    const { server, mocks } = createMockFlowgladServer()
    mocks.getInvoices.mockResolvedValue({
      invoices: mockInvoices,
    })

    const result = await getInvoices(
      {
        method: HTTPMethod.POST,
        data: {},
      },
      server
    )

    expect(mocks.getInvoices).toHaveBeenCalledWith({})
    assert200Success(result, {
      invoices: mockInvoices,
    })
  })

  it('respects limit param', async () => {
    const { server, mocks } = createMockFlowgladServer()
    const limitedInvoices = mockInvoices.slice(0, 2)
    mocks.getInvoices.mockResolvedValue({
      invoices: limitedInvoices,
    })

    const result = await getInvoices(
      {
        method: HTTPMethod.POST,
        data: { limit: 2 },
      },
      server
    )

    expect(mocks.getInvoices).toHaveBeenCalledWith({ limit: 2 })
    assert200Success(result, {
      invoices: limitedInvoices,
    })
  })

  it('returns empty array when no invoices', async () => {
    const { server, mocks } = createMockFlowgladServer()
    mocks.getInvoices.mockResolvedValue({
      invoices: [],
    })

    const result = await getInvoices(
      {
        method: HTTPMethod.POST,
        data: {},
      },
      server
    )

    assert200Success(result, { invoices: [] })
  })

  it('returns 500 with parsed error on failure', async () => {
    const { server, mocks } = createMockFlowgladServer()
    mocks.getInvoices.mockRejectedValue(
      new Error('404 {"message": "Customer not found"}')
    )

    const result = await getInvoices(
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
