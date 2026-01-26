import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import { getUsageMeterBalances } from './usageMeterHandlers'

/**
 * Mock data for testing usage meter handlers
 */
const mockUsageMeterBalance = {
  id: 'umb_123',
  livemode: false,
  name: 'API Calls',
  slug: 'api-calls',
  availableBalance: 1000,
  subscriptionId: 'sub_test_123',
}

/**
 * Creates a mock FlowgladServer for testing handlers
 */
const createMockFlowgladServer = () => {
  const mockGetUsageMeterBalances = vi.fn()

  const server = {
    getUsageMeterBalances: mockGetUsageMeterBalances,
  } as unknown as FlowgladServer

  return {
    server,
    mocks: {
      getUsageMeterBalances: mockGetUsageMeterBalances,
    },
  }
}

describe('Usage meter subroute handlers', () => {
  describe('getUsageMeterBalances handler', () => {
    it('returns { status: 405, error: { code: "Method not allowed" } } for GET request', async () => {
      const { server } = createMockFlowgladServer()

      // Use type assertion to test non-POST method handling
      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.GET as HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(405)
      expect(result.error).toEqual({
        code: 'Method not allowed',
        json: {},
      })
      expect(result.data).toEqual({})
    })

    it('returns { status: 405, error } for PUT request', async () => {
      const { server } = createMockFlowgladServer()

      // Use type assertion to test non-POST method handling
      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.PUT as HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(405)
      expect(result.error?.code).toBe('Method not allowed')
    })

    it('returns { status: 405, error } for DELETE request', async () => {
      const { server } = createMockFlowgladServer()

      // Use type assertion to test non-POST method handling
      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.DELETE as HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(405)
      expect(result.error?.code).toBe('Method not allowed')
    })

    it('returns { status: 200, data: { usageMeterBalances } } for valid POST request', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const mockBalances = [mockUsageMeterBalance]
      mocks.getUsageMeterBalances.mockResolvedValue({
        usageMeterBalances: mockBalances,
      })

      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual({
        usageMeterBalances: mockBalances,
      })
      expect(result.error).toBeUndefined()
      expect(mocks.getUsageMeterBalances).toHaveBeenCalledWith({})
    })

    it('returns { status: 200, data: { usageMeterBalances } } when subscriptionId is provided', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const mockBalances = [mockUsageMeterBalance]
      mocks.getUsageMeterBalances.mockResolvedValue({
        usageMeterBalances: mockBalances,
      })

      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.POST,
          data: { subscriptionId: 'sub_123' },
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual({
        usageMeterBalances: mockBalances,
      })
      expect(mocks.getUsageMeterBalances).toHaveBeenCalledWith({
        subscriptionId: 'sub_123',
      })
    })

    it('returns { status: 500, error: { code: "get_usage_meter_balances_failed", json: { message } } } when FlowgladServer throws', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getUsageMeterBalances.mockRejectedValue(
        new Error('User not authenticated')
      )

      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(500)
      expect(result.error).toEqual({
        code: 'get_usage_meter_balances_failed',
        json: {
          message: 'User not authenticated',
        },
      })
      expect(result.data).toEqual({})
    })

    it('returns { status: 500, error } when server throws API error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getUsageMeterBalances.mockRejectedValue(
        new Error('NOT_FOUND: Customer not found')
      )

      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.POST,
          data: { subscriptionId: 'sub_nonexistent' },
        },
        server
      )

      expect(result.status).toBe(500)
      expect(result.error?.code).toBe(
        'get_usage_meter_balances_failed'
      )
      expect(result.error?.json).toEqual({
        message: 'NOT_FOUND: Customer not found',
      })
    })

    it('returns empty usageMeterBalances array when no balances exist', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getUsageMeterBalances.mockResolvedValue({
        usageMeterBalances: [],
      })

      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual({ usageMeterBalances: [] })
    })

    it('returns balances via FlowgladServer.getUsageMeterBalances', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const mockBalances = [
        mockUsageMeterBalance,
        {
          ...mockUsageMeterBalance,
          id: 'umb_456',
          slug: 'storage-gb',
          name: 'Storage GB',
          availableBalance: 50,
        },
      ]
      mocks.getUsageMeterBalances.mockResolvedValue({
        usageMeterBalances: mockBalances,
      })

      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual({
        usageMeterBalances: mockBalances,
      })
      expect(mocks.getUsageMeterBalances).toHaveBeenCalledTimes(1)
    })
  })
})
