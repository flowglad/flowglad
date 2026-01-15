import type { FlowgladActionKey } from '@flowglad/shared'
import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import {
  assert200Success,
  assert401Unauthorized,
  assert404NotFound,
  assert405MethodNotAllowed,
} from './__tests__/test-utils'
import {
  findOrCreateCustomer,
  getCustomerBilling,
  updateCustomer,
} from './customerHandlers'
import type { InferRouteHandlerParams } from './types'

type GetCustomerBillingParams =
  InferRouteHandlerParams<FlowgladActionKey.GetCustomerBilling>
type FindOrCreateCustomerParams =
  InferRouteHandlerParams<FlowgladActionKey.FindOrCreateCustomer>
type UpdateCustomerParams =
  InferRouteHandlerParams<FlowgladActionKey.UpdateCustomer>

const mockBillingData = {
  currentSubscription: { id: 'sub_123', status: 'active' },
  currentSubscriptions: [{ id: 'sub_123', status: 'active' }],
  invoices: [],
  paymentMethods: [],
}

const mockCustomer = {
  id: 'cust_123',
  externalId: 'ext_123',
  email: 'test@example.com',
  name: 'Test User',
}

const mockSession = {
  email: 'test@example.com',
  name: 'Test User',
}

const createMockFlowgladServer = () => {
  const mockGetBilling = vi.fn()
  const mockGetSession = vi.fn()
  const mockGetCustomer = vi.fn()
  const mockCreateCustomer = vi.fn()
  const mockUpdateCustomer = vi.fn()
  const mockGetRequestingCustomerId = vi.fn()

  const server = {
    getBilling: mockGetBilling,
    getSession: mockGetSession,
    getCustomer: mockGetCustomer,
    createCustomer: mockCreateCustomer,
    updateCustomer: mockUpdateCustomer,
    getRequestingCustomerId: mockGetRequestingCustomerId,
  } as unknown as FlowgladServer

  return {
    server,
    mocks: {
      getBilling: mockGetBilling,
      getSession: mockGetSession,
      getCustomer: mockGetCustomer,
      createCustomer: mockCreateCustomer,
      updateCustomer: mockUpdateCustomer,
      getRequestingCustomerId: mockGetRequestingCustomerId,
    },
  }
}

describe('Customer subroute handlers', () => {
  describe('getCustomerBilling handler', () => {
    it('returns 405 for GET request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await getCustomerBilling(
        {
          method: HTTPMethod.GET,
          data: {},
        } as unknown as GetCustomerBillingParams,
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 405 for PUT request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await getCustomerBilling(
        {
          method: HTTPMethod.PUT,
          data: {},
        } as unknown as GetCustomerBillingParams,
        server
      )
      assert405MethodNotAllowed(result)
    })

    it('returns 200 with billingData for valid POST request', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getBilling.mockResolvedValue(mockBillingData)

      const result = await getCustomerBilling(
        { method: HTTPMethod.POST, data: { externalId: 'ext_123' } },
        server
      )

      assert200Success(result, mockBillingData)
      expect(mocks.getBilling).toHaveBeenCalledTimes(1)
    })
  })

  describe('findOrCreateCustomer handler', () => {
    it('returns 405 with numbered format for GET request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await findOrCreateCustomer(
        {
          method: HTTPMethod.GET,
          data: {},
        } as unknown as FindOrCreateCustomerParams,
        server
      )
      assert405MethodNotAllowed(result, 'numbered')
    })

    it('returns 405 with numbered format for DELETE request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await findOrCreateCustomer(
        {
          method: HTTPMethod.DELETE,
          data: {},
        } as unknown as FindOrCreateCustomerParams,
        server
      )
      assert405MethodNotAllowed(result, 'numbered')
    })

    it('returns 401 Unauthorized when session is null', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getSession.mockResolvedValue(null)

      const result = await findOrCreateCustomer(
        { method: HTTPMethod.POST, data: { externalId: 'ext_123' } },
        server
      )

      assert401Unauthorized(result)
      expect(mocks.getSession).toHaveBeenCalledTimes(1)
    })

    it('returns 200 with customer when customer exists', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getSession.mockResolvedValue(mockSession)
      mocks.getCustomer.mockResolvedValue(mockCustomer)
      mocks.getRequestingCustomerId.mockResolvedValue('ext_123')

      const result = await findOrCreateCustomer(
        { method: HTTPMethod.POST, data: { externalId: 'ext_123' } },
        server
      )

      assert200Success(result, mockCustomer)
      expect(mocks.getSession).toHaveBeenCalledTimes(1)
      expect(mocks.getCustomer).toHaveBeenCalledTimes(1)
      expect(mocks.createCustomer).not.toHaveBeenCalled()
    })

    it('returns 200 with customer when customer does not exist and is created', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getSession.mockResolvedValue(mockSession)
      mocks.getRequestingCustomerId.mockResolvedValue('ext_123')
      mocks.getCustomer.mockRejectedValue({
        error: { code: 'NOT_FOUND' },
      })
      mocks.createCustomer.mockResolvedValue(mockCustomer)

      const result = await findOrCreateCustomer(
        { method: HTTPMethod.POST, data: { externalId: 'ext_123' } },
        server
      )

      assert200Success(result, mockCustomer)
      expect(mocks.getCustomer).toHaveBeenCalledTimes(1)
      expect(mocks.createCustomer).toHaveBeenCalledTimes(1)
      expect(mocks.createCustomer).toHaveBeenCalledWith({
        customer: {
          email: mockSession.email,
          name: mockSession.name,
          externalId: 'ext_123',
        },
      })
    })

    it('returns 404 when customer not found and creation returns undefined', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getSession.mockResolvedValue(mockSession)
      mocks.getRequestingCustomerId.mockResolvedValue('ext_123')
      mocks.getCustomer.mockRejectedValue({
        error: { code: 'NOT_FOUND' },
      })
      mocks.createCustomer.mockResolvedValue(undefined)

      const result = await findOrCreateCustomer(
        { method: HTTPMethod.POST, data: { externalId: 'ext_123' } },
        server
      )

      assert404NotFound(result, 'Customer ext_123 not found')
    })

    it('returns 404 when getCustomer throws non-NOT_FOUND error and customer remains undefined', async () => {
      const { server, mocks } = createMockFlowgladServer()
      mocks.getSession.mockResolvedValue(mockSession)
      mocks.getRequestingCustomerId.mockResolvedValue('ext_456')
      mocks.getCustomer.mockRejectedValue({
        error: { code: 'OTHER_ERROR' },
      })

      const result = await findOrCreateCustomer(
        { method: HTTPMethod.POST, data: { externalId: 'ext_456' } },
        server
      )

      assert404NotFound(result, 'Customer ext_456 not found')
      expect(mocks.createCustomer).not.toHaveBeenCalled()
    })
  })

  describe('updateCustomer handler', () => {
    it('returns 405 with numbered format for GET request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await updateCustomer(
        {
          method: HTTPMethod.GET,
          data: {},
        } as unknown as UpdateCustomerParams,
        server
      )
      assert405MethodNotAllowed(result, 'numbered')
    })

    it('returns 405 with numbered format for PATCH request', async () => {
      const { server } = createMockFlowgladServer()
      const result = await updateCustomer(
        {
          method: HTTPMethod.PATCH,
          data: {},
        } as unknown as UpdateCustomerParams,
        server
      )
      assert405MethodNotAllowed(result, 'numbered')
    })

    it('returns 200 with customer for valid POST request with name update', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const updatedCustomer = { ...mockCustomer, name: 'New Name' }
      mocks.updateCustomer.mockResolvedValue(updatedCustomer)

      const params = {
        customer: { id: 'cust_123', name: 'New Name' },
        externalId: 'ext_123',
      }
      const result = await updateCustomer(
        { method: HTTPMethod.POST, data: params },
        server
      )

      assert200Success(result, updatedCustomer)
      expect(mocks.updateCustomer).toHaveBeenCalledTimes(1)
      expect(mocks.updateCustomer).toHaveBeenCalledWith(params)
    })

    it('returns 200 with customer for valid POST request with email update', async () => {
      const { server, mocks } = createMockFlowgladServer()
      const updatedCustomer = {
        ...mockCustomer,
        email: 'new@example.com',
      }
      mocks.updateCustomer.mockResolvedValue(updatedCustomer)

      const params = {
        customer: { id: 'cust_123', email: 'new@example.com' },
        externalId: 'ext_123',
      }
      const result = await updateCustomer(
        { method: HTTPMethod.POST, data: params },
        server
      )

      assert200Success(result, updatedCustomer)
      expect(mocks.updateCustomer).toHaveBeenCalledWith(params)
    })
  })
})
