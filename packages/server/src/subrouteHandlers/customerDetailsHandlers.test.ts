import { HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from '../FlowgladServer'
import { getCustomerDetails } from './customerDetailsHandlers'

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
    it.skip('returns 405 for GET request', async () => {
      // TODO: Implement in Patch 2
    })

    it.skip('returns 405 for PUT request', async () => {
      // TODO: Implement in Patch 2
    })

    it.skip('returns customer profile via FlowgladServer', async () => {
      // TODO: Implement in Patch 2
    })

    it.skip('returns 500 with parsed error on failure', async () => {
      // TODO: Implement in Patch 2
    })
  })
})
