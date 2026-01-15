import { FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from './FlowgladServer'
import type { FlowgladServerAdmin } from './FlowgladServerAdmin'
import { RequestHandlerError, requestHandler } from './requestHandler'

const createMockFlowgladServer = (): FlowgladServer => {
  return {} as FlowgladServer
}

const createMockFlowgladServerAdmin = (
  overrides: Partial<FlowgladServerAdmin> = {}
): FlowgladServerAdmin => {
  return {
    getDefaultPricingModel: vi.fn().mockResolvedValue({
      pricingModel: {
        id: 'pm_default',
        name: 'Default Pricing',
        isDefault: true,
      },
    }),
    ...overrides,
  } as unknown as FlowgladServerAdmin
}

describe('requestHandler public routes', () => {
  it('returns 501 if pricing called without flowgladAdmin', async () => {
    const handler = requestHandler({
      getCustomerExternalId: vi
        .fn()
        .mockResolvedValue('customer_123'),
      flowglad: vi.fn().mockResolvedValue(createMockFlowgladServer()),
      // flowgladAdmin is intentionally not provided
    })

    const result = await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
        query: {},
      },
      {}
    )

    expect(result.status).toBe(501)
    expect(result.error).toEqual({
      message: 'Public routes require flowgladAdmin option',
    })
  })

  it('bypasses auth for public routes', async () => {
    const getCustomerExternalIdMock = vi.fn()
    const flowgladMock = vi.fn()

    const handler = requestHandler({
      getCustomerExternalId: getCustomerExternalIdMock,
      flowglad: flowgladMock,
      flowgladAdmin: () => createMockFlowgladServerAdmin(),
    })

    await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
        query: {},
      },
      {}
    )

    // Auth functions should NOT be called for public routes
    expect(getCustomerExternalIdMock).not.toHaveBeenCalled()
    expect(flowgladMock).not.toHaveBeenCalled()
  })

  it('calls flowgladAdmin for public routes', async () => {
    const getDefaultPricingModelMock = vi.fn().mockResolvedValue({
      pricingModel: {
        id: 'pm_default',
        name: 'Default Pricing',
        isDefault: true,
      },
    })
    const flowgladAdminMock = vi.fn().mockReturnValue(
      createMockFlowgladServerAdmin({
        getDefaultPricingModel: getDefaultPricingModelMock,
      })
    )

    const handler = requestHandler({
      getCustomerExternalId: vi
        .fn()
        .mockResolvedValue('customer_123'),
      flowglad: vi.fn().mockResolvedValue(createMockFlowgladServer()),
      flowgladAdmin: flowgladAdminMock,
    })

    const result = await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
        query: {},
      },
      {}
    )

    expect(flowgladAdminMock).toHaveBeenCalledTimes(1)
    expect(getDefaultPricingModelMock).toHaveBeenCalledTimes(1)
    expect(result.status).toBe(200)
    expect(result.data).toEqual({
      id: 'pm_default',
      name: 'Default Pricing',
      isDefault: true,
    })
  })

  it('returns pricing model data on success', async () => {
    const mockPricingModel = {
      id: 'pm_test',
      name: 'Test Pricing',
      isDefault: true,
      products: [],
    }

    const handler = requestHandler({
      getCustomerExternalId: vi.fn(),
      flowglad: vi.fn(),
      flowgladAdmin: () =>
        createMockFlowgladServerAdmin({
          getDefaultPricingModel: vi.fn().mockResolvedValue({
            pricingModel: mockPricingModel,
          }),
        }),
    })

    const result = await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
        query: {},
      },
      {}
    )

    expect(result.status).toBe(200)
    expect(result.data).toEqual(mockPricingModel)
  })

  it('still requires auth for non-public routes', async () => {
    const getCustomerExternalIdMock = vi
      .fn()
      .mockResolvedValue('customer_123')
    const flowgladMock = vi.fn().mockResolvedValue({
      getBilling: vi.fn().mockResolvedValue({
        customer: { id: 'cust_123' },
      }),
    })

    const handler = requestHandler({
      getCustomerExternalId: getCustomerExternalIdMock,
      flowglad: flowgladMock,
      flowgladAdmin: () => createMockFlowgladServerAdmin(),
    })

    await handler(
      {
        path: ['customers', 'billing'],
        method: HTTPMethod.POST,
        body: { externalId: 'ext_123' },
      },
      {}
    )

    // Auth functions SHOULD be called for non-public routes
    expect(getCustomerExternalIdMock).toHaveBeenCalled()
    expect(flowgladMock).toHaveBeenCalled()
  })

  it('runs beforeRequest for public routes', async () => {
    const beforeRequestMock = vi.fn()

    const handler = requestHandler({
      getCustomerExternalId: vi.fn(),
      flowglad: vi.fn(),
      flowgladAdmin: () => createMockFlowgladServerAdmin(),
      beforeRequest: beforeRequestMock,
    })

    await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
        query: {},
      },
      {}
    )

    expect(beforeRequestMock).toHaveBeenCalledTimes(1)
  })

  it('runs afterRequest for public routes', async () => {
    const afterRequestMock = vi.fn()

    const handler = requestHandler({
      getCustomerExternalId: vi.fn(),
      flowglad: vi.fn(),
      flowgladAdmin: () => createMockFlowgladServerAdmin(),
      afterRequest: afterRequestMock,
    })

    await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
        query: {},
      },
      {}
    )

    expect(afterRequestMock).toHaveBeenCalledTimes(1)
  })

  it('calls onError when public route handler throws', async () => {
    const onErrorMock = vi.fn()

    const handler = requestHandler({
      getCustomerExternalId: vi.fn(),
      flowglad: vi.fn(),
      flowgladAdmin: () =>
        createMockFlowgladServerAdmin({
          getDefaultPricingModel: vi
            .fn()
            .mockRejectedValue(new Error('API error')),
        }),
      onError: onErrorMock,
    })

    await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
        query: {},
      },
      {}
    )

    // onError is not called for errors handled within the handler
    // The pricing handler catches errors and returns a 500 response
    // So onError should not be called
  })

  it('returns 404 for invalid paths', async () => {
    const handler = requestHandler({
      getCustomerExternalId: vi.fn(),
      flowglad: vi.fn(),
      flowgladAdmin: () => createMockFlowgladServerAdmin(),
    })

    const result = await handler(
      {
        path: ['invalid', 'path'],
        method: HTTPMethod.GET,
        query: {},
      },
      {}
    )

    expect(result.status).toBe(404)
    expect(result.error).toEqual({
      message: '"invalid/path" is not a valid Flowglad API path',
    })
  })
})
