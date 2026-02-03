import type { FlowgladActionKey } from '@flowglad/shared'
import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import {
  assert200Success,
  assert405MethodNotAllowed,
  assertHandlerResponse,
} from './__tests__/test-utils'
import { getCustomerDetails } from './customerDetailsHandlers'
import type { InferRouteHandlerParams } from './types'

type GetCustomerDetailsParams =
  InferRouteHandlerParams<FlowgladActionKey.GetCustomerDetails>

const mockCustomerDetails = {
  id: 'cust_123',
  livemode: false,
  email: 'test@example.com',
  name: 'Test Customer',
  externalId: 'ext_123',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

const createMockFlowgladServer = () => {
  const mockGetCustomerDetails = vi.fn()

  const server = {
    getCustomerDetails: mockGetCustomerDetails,
  } as unknown as FlowgladServer

  return {
    server,
    mocks: {
      getCustomerDetails: mockGetCustomerDetails,
    },
  }
}

describe('Customer details subroute handlers', () => {
  describe('getCustomerDetails handler', () => {
    it('returns 405 for GET request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await getCustomerDetails(
        {
          method: HTTPMethod.GET,
          data: {},
        } as unknown as GetCustomerDetailsParams,
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 405 for PUT request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await getCustomerDetails(
        {
          method: HTTPMethod.PUT,
          data: {},
        } as unknown as GetCustomerDetailsParams,
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns customer profile via FlowgladServer', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getCustomerDetails.mockResolvedValue(mockCustomerDetails)

      const result = await getCustomerDetails(
        { method: HTTPMethod.POST, data: {} },
        server
      )

      assert200Success(result, mockCustomerDetails)
      expect(mocks.getCustomerDetails).toHaveBeenCalledTimes(1)
    })

    it('returns 500 with parsed error on failure', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getCustomerDetails.mockRejectedValue(
        new Error('404 {"message":"Customer not found"}')
      )

      const result = await getCustomerDetails(
        { method: HTTPMethod.POST, data: {} },
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
})
