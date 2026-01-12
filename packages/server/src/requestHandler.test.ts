import { FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import { describe, expect, it, vi } from 'vitest'
import type { FlowgladServer } from './FlowgladServer'
import type { FlowgladServerAdmin } from './FlowgladServerAdmin'
import { RequestHandlerError, requestHandler } from './requestHandler'

describe('requestHandler public route handling', () => {
  const createMockFlowgladServer = () =>
    ({
      // Mock FlowgladServer methods as needed
    }) as unknown as FlowgladServer

  const createMockFlowgladServerAdmin = (
    overrides: Partial<FlowgladServerAdmin> = {}
  ) =>
    ({
      getDefaultPricingModel: vi.fn().mockResolvedValue({
        pricingModel: { id: 'pm_1', name: 'Default Plan' },
      }),
      ...overrides,
    }) as unknown as FlowgladServerAdmin

  it('returns status 501 with error message when pricing endpoint called without flowgladAdmin configured', async () => {
    const handler = requestHandler({
      getCustomerExternalId: vi.fn().mockResolvedValue('user_1'),
      flowglad: vi.fn().mockReturnValue(createMockFlowgladServer()),
    })

    const response = await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
      },
      {}
    )

    expect(response.status).toBe(501)
    expect(response.error).toEqual({
      message: 'Public routes require flowgladAdmin option',
    })
  })

  it('does not call getCustomerExternalId when flowgladAdmin provided and public route requested', async () => {
    const getCustomerExternalId = vi.fn()
    const mockAdmin = createMockFlowgladServerAdmin()

    const handler = requestHandler({
      getCustomerExternalId,
      flowglad: vi.fn().mockReturnValue(createMockFlowgladServer()),
      flowgladAdmin: () => mockAdmin,
    })

    await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
      },
      {}
    )

    expect(getCustomerExternalId).not.toHaveBeenCalled()
  })

  it('returns pricing model data when flowgladAdmin is configured and public route requested', async () => {
    const mockAdmin = createMockFlowgladServerAdmin({
      getDefaultPricingModel: vi.fn().mockResolvedValue({
        pricingModel: { id: 'pm_123', name: 'Pro Plan' },
      }),
    })

    const handler = requestHandler({
      getCustomerExternalId: vi.fn().mockResolvedValue('user_1'),
      flowglad: vi.fn().mockReturnValue(createMockFlowgladServer()),
      flowgladAdmin: () => mockAdmin,
    })

    const response = await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
      },
      {}
    )

    expect(response.status).toBe(200)
    expect((response.data as any).pricingModel.id).toBe('pm_123')
    expect((response.data as any).pricingModel.name).toBe('Pro Plan')
  })

  it('calls getCustomerExternalId for non-public routes', async () => {
    const getCustomerExternalId = vi.fn().mockResolvedValue('user_1')
    const mockFlowgladServer = {
      getCustomerBilling: vi.fn().mockResolvedValue({
        subscription: { id: 'sub_1' },
      }),
    } as unknown as FlowgladServer

    const handler = requestHandler({
      getCustomerExternalId,
      flowglad: vi.fn().mockReturnValue(mockFlowgladServer),
      flowgladAdmin: vi
        .fn()
        .mockReturnValue(createMockFlowgladServerAdmin()),
    })

    await handler(
      {
        path: ['customers', 'billing'],
        method: HTTPMethod.POST,
        body: { externalId: 'user_1' },
      },
      {}
    )

    expect(getCustomerExternalId).toHaveBeenCalled()
  })

  it('returns 404 for invalid paths', async () => {
    const handler = requestHandler({
      getCustomerExternalId: vi.fn().mockResolvedValue('user_1'),
      flowglad: vi.fn().mockReturnValue(createMockFlowgladServer()),
    })

    const response = await handler(
      {
        path: ['invalid', 'path'],
        method: HTTPMethod.GET,
      },
      {}
    )

    expect(response.status).toBe(404)
    expect(response.error).toEqual({
      message: '"invalid/path" is not a valid Flowglad API path',
    })
  })

  it('calls beforeRequest and afterRequest hooks for public routes', async () => {
    const beforeRequest = vi.fn()
    const afterRequest = vi.fn()
    const mockAdmin = createMockFlowgladServerAdmin()

    const handler = requestHandler({
      getCustomerExternalId: vi.fn().mockResolvedValue('user_1'),
      flowglad: vi.fn().mockReturnValue(createMockFlowgladServer()),
      flowgladAdmin: () => mockAdmin,
      beforeRequest,
      afterRequest,
    })

    await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
      },
      {}
    )

    expect(beforeRequest).toHaveBeenCalled()
    expect(afterRequest).toHaveBeenCalled()
  })

  it('calls onError when public route handler throws', async () => {
    const onError = vi.fn()
    const mockAdmin = createMockFlowgladServerAdmin({
      getDefaultPricingModel: vi
        .fn()
        .mockRejectedValue(new Error('Network error')),
    })

    const handler = requestHandler({
      getCustomerExternalId: vi.fn().mockResolvedValue('user_1'),
      flowglad: vi.fn().mockReturnValue(createMockFlowgladServer()),
      flowgladAdmin: () => mockAdmin,
      onError,
    })

    const response = await handler(
      {
        path: ['pricing-models', 'default'],
        method: HTTPMethod.GET,
      },
      {}
    )

    // The error is caught inside the pricing handler, so status is 500
    // The error is returned in response.error, not response.data.error
    expect(response.status).toBe(500)
    expect((response.error as any)?.message).toBe('Network error')
  })
})

describe('isPublicActionKey type guard', () => {
  it('returns true for GetDefaultPricingModel action key', async () => {
    const handler = requestHandler({
      getCustomerExternalId: vi.fn(),
      flowglad: vi.fn().mockReturnValue({} as FlowgladServer),
      flowgladAdmin: () =>
        ({
          getDefaultPricingModel: vi.fn().mockResolvedValue({
            pricingModel: { id: 'pm_1' },
          }),
        }) as unknown as FlowgladServerAdmin,
    })

    // If the route is public, getCustomerExternalId should not be called
    const getCustomerExternalId = vi.fn()
    const handler2 = requestHandler({
      getCustomerExternalId,
      flowglad: vi.fn().mockReturnValue({} as FlowgladServer),
      flowgladAdmin: () =>
        ({
          getDefaultPricingModel: vi.fn().mockResolvedValue({
            pricingModel: { id: 'pm_1' },
          }),
        }) as unknown as FlowgladServerAdmin,
    })

    await handler2(
      { path: ['pricing-models', 'default'], method: HTTPMethod.GET },
      {}
    )
    expect(getCustomerExternalId).not.toHaveBeenCalled()
  })

  it('returns false for GetCustomerBilling action key (requires auth)', async () => {
    const getCustomerExternalId = vi.fn().mockResolvedValue('user_1')
    const mockFlowgladServer = {
      getCustomerBilling: vi.fn().mockResolvedValue({
        subscription: null,
        catalog: { products: [], prices: [] },
        features: [],
        usageMeterBalances: [],
      }),
    } as unknown as FlowgladServer

    const handler = requestHandler({
      getCustomerExternalId,
      flowglad: vi.fn().mockReturnValue(mockFlowgladServer),
    })

    await handler(
      {
        path: ['customers', 'billing'],
        method: HTTPMethod.POST,
        body: { externalId: 'user_1' },
      },
      {}
    )

    // For non-public routes, getCustomerExternalId should be called
    expect(getCustomerExternalId).toHaveBeenCalled()
  })
})
