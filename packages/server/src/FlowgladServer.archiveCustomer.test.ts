import { describe, expect, it, vi } from 'vitest'
import { FlowgladServer } from './FlowgladServer'
import type { CoreCustomerUser } from './types'

/**
 * Mock customer data for testing
 */
const mockCustomer = {
  id: 'cust_test_123',
  externalId: 'test-user-id',
  name: 'Test User',
  email: 'test@example.com',
  archived: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  organizationId: 'org_123',
  pricingModelId: 'pm_123',
  livemode: false,
  domain: null,
  iconURL: null,
  logoURL: null,
  invoiceNumberBase: null,
  userId: null,
  billingAddress: null,
}

const mockArchivedCustomer = {
  ...mockCustomer,
  archived: true,
}

/**
 * Creates a mock FlowgladServer with mocked flowgladNode methods
 */
const createMockFlowgladServer = () => {
  const server = new FlowgladServer({
    apiKey: 'test-api-key',
    baseURL: 'http://localhost:3000',
    getRequestingCustomer: async (): Promise<CoreCustomerUser> => ({
      externalId: 'test-user-id',
      name: 'Test User',
      email: 'test@example.com',
    }),
  })

  const mockPost = vi.fn()

  // Access private properties for mocking
  // @ts-expect-error - accessing private property for testing
  server.flowgladNode = {
    post: mockPost,
  } as unknown

  return {
    server,
    mocks: {
      post: mockPost,
    },
  }
}

describe('FlowgladServer.archiveCustomer', () => {
  it('calls the archive endpoint with the correct URL and returns the archived customer', async () => {
    const { server, mocks } = createMockFlowgladServer()
    mocks.post.mockResolvedValue({ customer: mockArchivedCustomer })

    const result = await server.archiveCustomer('test-user-id')

    expect(result).toEqual(mockArchivedCustomer)
    expect(result.archived).toBe(true)
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/customers/test-user-id/archive',
      { body: {} }
    )
  })

  it('URL-encodes the externalId to handle special characters', async () => {
    const { server, mocks } = createMockFlowgladServer()
    const specialExternalId = 'user/with/slashes'
    const customerWithSpecialId = {
      ...mockArchivedCustomer,
      externalId: specialExternalId,
    }
    mocks.post.mockResolvedValue({ customer: customerWithSpecialId })

    const result = await server.archiveCustomer(specialExternalId)

    expect(result.externalId).toEqual(specialExternalId)
    expect(mocks.post).toHaveBeenCalledWith(
      `/api/v1/customers/${encodeURIComponent(specialExternalId)}/archive`,
      { body: {} }
    )
  })

  it('propagates errors from the API', async () => {
    const { server, mocks } = createMockFlowgladServer()
    const apiError = new Error('Customer not found')
    mocks.post.mockRejectedValue(apiError)

    await expect(
      server.archiveCustomer('nonexistent-user')
    ).rejects.toThrow('Customer not found')
  })
})
