import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import {
  assert200Success,
  assert405MethodNotAllowed,
  assertHandlerResponse,
} from './test-utils'
import { getUsageMeterBalances } from './usageMeterHandlers'

const mockUsageMeterBalances = [
  {
    id: 'umb_123',
    livemode: true,
    name: 'API Calls',
    slug: 'api-calls',
    availableBalance: 1000,
    subscriptionId: 'sub_123',
  },
  {
    id: 'umb_456',
    livemode: true,
    name: 'Storage',
    slug: 'storage',
    availableBalance: 500,
    subscriptionId: 'sub_123',
  },
]

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
    it('returns 405 for GET request', async () => {
      const { server } = createMockFlowgladServer()

      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.GET,
          data: {},
        } as unknown as Parameters<typeof getUsageMeterBalances>[0],
        server
      )

      assert405MethodNotAllowed(result)
    })

    it('returns 405 for PUT request', async () => {
      const { server } = createMockFlowgladServer()

      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.PUT,
          data: {},
        } as unknown as Parameters<typeof getUsageMeterBalances>[0],
        server
      )

      assert405MethodNotAllowed(result)
    })

    it('returns 405 for DELETE request', async () => {
      const { server } = createMockFlowgladServer()

      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.DELETE,
          data: {},
        } as unknown as Parameters<typeof getUsageMeterBalances>[0],
        server
      )

      assert405MethodNotAllowed(result)
    })

    it('returns balances via FlowgladServer.getUsageMeterBalances with empty params', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getUsageMeterBalances.mockResolvedValue({
        usageMeterBalances: mockUsageMeterBalances,
      })

      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      expect(mocks.getUsageMeterBalances).toHaveBeenCalledWith({})
      assert200Success(result, {
        usageMeterBalances: mockUsageMeterBalances,
      })
    })

    it('returns balances filtered by subscriptionId', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getUsageMeterBalances.mockResolvedValue({
        usageMeterBalances: mockUsageMeterBalances,
      })

      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.POST,
          data: { subscriptionId: 'sub_123' },
        },
        server
      )

      expect(mocks.getUsageMeterBalances).toHaveBeenCalledWith({
        subscriptionId: 'sub_123',
      })
      assert200Success(result, {
        usageMeterBalances: mockUsageMeterBalances,
      })
    })

    it('returns empty array when no balances exist', async () => {
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

      assert200Success(result, { usageMeterBalances: [] })
    })

    it('returns 500 with parsed error code when server throws Error with parseable message', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getUsageMeterBalances.mockRejectedValue(
        new Error('404 {"message": "Customer not found"}')
      )

      const result = await getUsageMeterBalances(
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

    it('returns 500 with "Unknown" code when server throws Error with non-parseable message', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getUsageMeterBalances.mockRejectedValue(
        new Error('Something went wrong')
      )

      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      assertHandlerResponse(result, {
        status: 500,
        error: {
          code: 'Unknown',
          json: { message: 'Something went wrong' },
        },
        data: {},
      })
    })

    it('returns 500 with "Unknown error" when server throws non-Error', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getUsageMeterBalances.mockRejectedValue('oops')

      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.POST,
          data: {},
        },
        server
      )

      assertHandlerResponse(result, {
        status: 500,
        error: {
          code: 'Unknown error',
          json: {},
        },
        data: {},
      })
    })

    it('rejects unknown keys in input (strict schema)', async () => {
      const { server, mocks } = createMockFlowgladServer()

      const result = await getUsageMeterBalances(
        {
          method: HTTPMethod.POST,
          // Cast to bypass TypeScript - we're intentionally testing Zod's strict() validation
          data: {
            subscriptionId: 'sub_123',
            unknownKey: 'value',
          } as unknown as { subscriptionId?: string },
        },
        server
      )

      // Should fail Zod strict() validation
      expect(result.status).toBe(500)
      expect(result.error?.code).toBe('Unknown')
      expect(mocks.getUsageMeterBalances).not.toHaveBeenCalled()
    })
  })
})
