import { FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import { getSessionFromCtx } from 'better-auth/api'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBillingEndpoints,
  resolveCustomerExternalId,
} from './endpoints'

describe('endpoints.ts externalId resolution + injection behavior', () => {
  const fixedDate = new Date('2020-01-01T00:00:00.000Z')

  const makeBetterAuthSessionResult = (params: {
    userId: string
    email: string
    name?: string
    activeOrganizationId?: string
  }) => {
    return {
      session: {
        id: 'session-1',
        userId: params.userId,
        activeOrganizationId: params.activeOrganizationId,
        createdAt: fixedDate,
        updatedAt: fixedDate,
        expiresAt: fixedDate,
        token: 'token-1',
      },
      user: {
        id: params.userId,
        name: params.name ?? 'User',
        email: params.email,
        emailVerified: true,
        image: null,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      },
    }
  }

  type BillingHandlerResult = {
    data: {}
    status: number
    error?: {
      code: string
      json: Record<string, unknown>
    }
  }

  const billingHandlerState = vi.hoisted(() => ({
    calls: [] as Array<{
      actionKey: string
      handlerArgs: unknown
      server: unknown
    }>,
    impl: async (
      _handlerArgs: unknown,
      _flowgladServer: unknown
    ): Promise<BillingHandlerResult> => ({ status: 200, data: {} }),
  }))

  const flowgladServerState = vi.hoisted(() => ({
    instances: [] as Array<{
      config: unknown
    }>,
  }))

  vi.mock('better-auth/api', () => ({
    getSessionFromCtx: vi.fn(),
  }))

  vi.mock('better-auth/plugins', () => ({
    createAuthEndpoint: (
      path: string,
      config: unknown,
      handler: (ctx: unknown) => unknown
    ) => ({ path, config, handler }),
    createAuthMiddleware: (handler: (ctx: unknown) => unknown) =>
      handler,
  }))

  vi.mock('../FlowgladServer', () => ({
    FlowgladServer: class FlowgladServer {
      public readonly config: unknown
      public constructor(config: unknown) {
        this.config = config
        flowgladServerState.instances.push({ config })
      }
    },
  }))

  vi.mock('../subrouteHandlers', () => {
    const routeToHandlerMap = new Proxy(
      {},
      {
        get: (_target, prop) => {
          const actionKey = String(prop)
          return async (
            handlerArgs: unknown,
            flowgladServer: unknown
          ) => {
            billingHandlerState.calls.push({
              actionKey,
              handlerArgs,
              server: flowgladServer,
            })
            return billingHandlerState.impl(
              handlerArgs,
              flowgladServer
            )
          }
        },
      }
    )

    return {
      routeToHandlerMap,
    }
  })

  const makeCtx = (params: {
    headers?: { get: (key: string) => string | null }
    body?: unknown
    context?: Record<string, unknown>
  }) => {
    const responses: Array<{
      body: unknown
      init?: { status?: number }
    }> = []

    const ctx = {
      headers: params.headers,
      body: params.body,
      context: params.context ?? {},
      json: (body: unknown, init?: { status?: number }) => {
        responses.push({ body, init })
        return { body, init }
      },
    }

    return { ctx, responses }
  }

  const getEndpointHandler = (endpoint: unknown) => {
    if (
      typeof endpoint !== 'object' ||
      endpoint === null ||
      Array.isArray(endpoint)
    ) {
      throw new Error('Mocked endpoint is not an object')
    }
    const handler = Reflect.get(endpoint, 'handler')
    if (typeof handler !== 'function') {
      throw new Error('Mocked endpoint missing a handler function')
    }
    const typedHandler: (...args: unknown[]) => unknown = handler
    return typedHandler
  }

  beforeEach(() => {
    billingHandlerState.impl = async () => ({ status: 200, data: {} })
    billingHandlerState.calls.length = 0
    flowgladServerState.instances.length = 0
  })

  describe('resolveCustomerExternalId', () => {
    it('returns the user ID as externalId when customerType is undefined (defaults to user)', () => {
      const session = makeBetterAuthSessionResult({
        userId: 'user-1',
        email: 'u@x.com',
      })

      const result = resolveCustomerExternalId({}, session)

      expect(result).toEqual({ externalId: 'user-1' })
    })

    it('returns the user ID as externalId when customerType is explicitly "user" (even if active org exists)', () => {
      const session = makeBetterAuthSessionResult({
        userId: 'user-1',
        email: 'u@x.com',
        activeOrganizationId: 'org-1',
      })

      const result = resolveCustomerExternalId(
        { customerType: 'user' },
        session
      )

      expect(result).toEqual({ externalId: 'user-1' })
    })

    it('returns the organization ID as externalId when customerType is "organization" and activeOrganizationId exists', () => {
      const session = makeBetterAuthSessionResult({
        userId: 'user-1',
        email: 'u@x.com',
        activeOrganizationId: 'org-1',
      })

      const result = resolveCustomerExternalId(
        { customerType: 'organization' },
        session
      )

      expect(result).toEqual({ externalId: 'org-1' })
    })

    it('returns NO_ACTIVE_ORGANIZATION error when customerType is "organization" but activeOrganizationId is missing', () => {
      const session = makeBetterAuthSessionResult({
        userId: 'user-1',
        email: 'u@x.com',
      })

      const result = resolveCustomerExternalId(
        { customerType: 'organization' },
        session
      )

      expect(result).toEqual({
        error: {
          code: 'NO_ACTIVE_ORGANIZATION',
          message: expect.stringContaining(
            'Organization billing requires an active organization'
          ),
        },
      })
    })
  })

  describe('createFlowgladBillingEndpoint externalId injection gate (via createBillingEndpoints)', () => {
    it('injects the resolved customer externalId into the body for GetCustomerBilling (and overrides any client-provided externalId)', async () => {
      const session = makeBetterAuthSessionResult({
        userId: 'user-1',
        email: 'u@x.com',
      })
      vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

      const endpoints = createBillingEndpoints({})
      const endpoint = endpoints.getCustomerBilling
      const { ctx } = makeCtx({
        headers: { get: () => null },
        body: { externalId: 'attacker-id' },
        context: {},
      })

      await getEndpointHandler(endpoint)(ctx)

      expect(billingHandlerState.calls).toHaveLength(1)
      expect(billingHandlerState.calls[0]?.actionKey).toBe(
        FlowgladActionKey.GetCustomerBilling
      )
      expect(billingHandlerState.calls[0]?.handlerArgs).toEqual({
        method: HTTPMethod.POST,
        data: { externalId: 'user-1' },
      })

      expect(flowgladServerState.instances).toHaveLength(1)
      expect(flowgladServerState.instances[0]?.config).toEqual(
        expect.objectContaining({
          customerExternalId: 'user-1',
          getCustomerDetails: expect.any(Function),
        })
      )
    })

    it('injects the resolved customer externalId into the body for FindOrCreateCustomer', async () => {
      const session = makeBetterAuthSessionResult({
        userId: 'user-1',
        email: 'u@x.com',
      })
      vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

      const endpoints = createBillingEndpoints({})
      const endpoint = endpoints.findOrCreateCustomer
      const { ctx } = makeCtx({
        headers: { get: () => null },
        body: {},
        context: {},
      })

      await getEndpointHandler(endpoint)(ctx)

      expect(billingHandlerState.calls).toHaveLength(1)
      expect(billingHandlerState.calls[0]?.actionKey).toBe(
        FlowgladActionKey.FindOrCreateCustomer
      )
      expect(billingHandlerState.calls[0]?.handlerArgs).toEqual({
        method: HTTPMethod.POST,
        data: { externalId: 'user-1' },
      })
      expect(flowgladServerState.instances[0]?.config).toEqual(
        expect.objectContaining({ customerExternalId: 'user-1' })
      )
    })

    it('injects the resolved customer externalId into the body for UpdateCustomer while preserving the customer payload', async () => {
      const session = makeBetterAuthSessionResult({
        userId: 'user-1',
        email: 'u@x.com',
      })
      vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

      const endpoints = createBillingEndpoints({})
      const endpoint = endpoints.updateCustomer
      const { ctx } = makeCtx({
        headers: { get: () => null },
        body: {
          externalId: 'attacker-id',
          customer: { id: 'cust-1', name: 'Updated Name' },
        },
        context: {},
      })

      await getEndpointHandler(endpoint)(ctx)

      expect(billingHandlerState.calls).toHaveLength(1)
      expect(billingHandlerState.calls[0]?.actionKey).toBe(
        FlowgladActionKey.UpdateCustomer
      )
      expect(billingHandlerState.calls[0]?.handlerArgs).toEqual({
        method: HTTPMethod.POST,
        data: {
          externalId: 'user-1',
          customer: { id: 'cust-1', name: 'Updated Name' },
        },
      })
      expect(flowgladServerState.instances[0]?.config).toEqual(
        expect.objectContaining({ customerExternalId: 'user-1' })
      )
    })

    describe('claimResource must NOT receive injected customer externalId in body', () => {
      it('keeps quantity mode valid by not injecting externalId (which would violate the schema refinement)', async () => {
        const session = makeBetterAuthSessionResult({
          userId: 'user-1',
          email: 'u@x.com',
        })
        vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

        const endpoints = createBillingEndpoints({})
        const endpoint = endpoints.claimResource
        const { ctx } = makeCtx({
          headers: { get: () => null },
          body: { resourceSlug: 'seats', quantity: 1 },
          context: {},
        })

        await getEndpointHandler(endpoint)(ctx)

        expect(billingHandlerState.calls).toHaveLength(1)
        expect(billingHandlerState.calls[0]?.actionKey).toBe(
          FlowgladActionKey.ClaimResource
        )
        expect(billingHandlerState.calls[0]?.handlerArgs).toEqual({
          method: HTTPMethod.POST,
          data: { resourceSlug: 'seats', quantity: 1 },
        })
        expect(flowgladServerState.instances[0]?.config).toEqual(
          expect.objectContaining({ customerExternalId: 'user-1' })
        )
      })

      it('preserves claim externalId in single-externalId mode (does not override it with customer externalId)', async () => {
        const session = makeBetterAuthSessionResult({
          userId: 'user-1',
          email: 'u@x.com',
        })
        vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

        const endpoints = createBillingEndpoints({})
        const endpoint = endpoints.claimResource
        const { ctx } = makeCtx({
          headers: { get: () => null },
          body: {
            resourceSlug: 'seats',
            externalId: 'invitee@example.com',
          },
          context: {},
        })

        await getEndpointHandler(endpoint)(ctx)

        expect(billingHandlerState.calls).toHaveLength(1)
        expect(billingHandlerState.calls[0]?.handlerArgs).toEqual({
          method: HTTPMethod.POST,
          data: {
            resourceSlug: 'seats',
            externalId: 'invitee@example.com',
          },
        })
        expect(flowgladServerState.instances[0]?.config).toEqual(
          expect.objectContaining({ customerExternalId: 'user-1' })
        )
      })

      it('preserves claim externalIds in multi-externalIds mode (does not inject externalId)', async () => {
        const session = makeBetterAuthSessionResult({
          userId: 'user-1',
          email: 'u@x.com',
        })
        vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

        const endpoints = createBillingEndpoints({})
        const endpoint = endpoints.claimResource
        const { ctx } = makeCtx({
          headers: { get: () => null },
          body: {
            resourceSlug: 'seats',
            externalIds: ['a@example.com', 'b@example.com'],
          },
          context: {},
        })

        await getEndpointHandler(endpoint)(ctx)

        expect(billingHandlerState.calls).toHaveLength(1)
        expect(billingHandlerState.calls[0]?.handlerArgs).toEqual({
          method: HTTPMethod.POST,
          data: {
            resourceSlug: 'seats',
            externalIds: ['a@example.com', 'b@example.com'],
          },
        })
      })

      it('returns VALIDATION_ERROR when an invalid combination is provided (quantity + externalId)', async () => {
        const session = makeBetterAuthSessionResult({
          userId: 'user-1',
          email: 'u@x.com',
        })
        vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

        const endpoints = createBillingEndpoints({})
        const endpoint = endpoints.claimResource
        const { ctx, responses } = makeCtx({
          headers: { get: () => null },
          body: {
            resourceSlug: 'seats',
            quantity: 1,
            externalId: 'x@example.com',
          },
          context: {},
        })

        await getEndpointHandler(endpoint)(ctx)

        expect(responses[0]?.init?.status).toBe(400)
        expect(responses[0]?.body).toEqual({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: expect.objectContaining({
              fieldErrors: expect.any(Object),
            }),
          },
        })
        expect(billingHandlerState.calls).toHaveLength(0)
        expect(flowgladServerState.instances).toHaveLength(0)
      })

      it('returns NO_ACTIVE_ORGANIZATION when organization billing is configured but activeOrganizationId is missing (even though claimResource does not inject into body)', async () => {
        const session = makeBetterAuthSessionResult({
          userId: 'user-1',
          email: 'u@x.com',
        })
        vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

        const endpoints = createBillingEndpoints({
          customerType: 'organization',
        })
        const endpoint = endpoints.claimResource
        const { ctx, responses } = makeCtx({
          headers: { get: () => null },
          body: { resourceSlug: 'seats', quantity: 1 },
          context: {},
        })

        await getEndpointHandler(endpoint)(ctx)

        expect(responses[0]?.init?.status).toBe(400)
        expect(responses[0]?.body).toEqual({
          error: {
            code: 'NO_ACTIVE_ORGANIZATION',
            message: expect.stringContaining(
              'Organization billing requires an active organization'
            ),
          },
        })
        expect(billingHandlerState.calls).toHaveLength(0)
        expect(flowgladServerState.instances).toHaveLength(0)
      })

      it('in organization billing mode, uses activeOrganizationId as the customer externalId while preserving claim externalId', async () => {
        const session = makeBetterAuthSessionResult({
          userId: 'user-1',
          email: 'u@x.com',
          activeOrganizationId: 'org-1',
        })
        vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

        const endpoints = createBillingEndpoints({
          customerType: 'organization',
        })
        const endpoint = endpoints.claimResource
        const { ctx } = makeCtx({
          headers: { get: () => null },
          body: {
            resourceSlug: 'seats',
            externalId: 'invitee@example.com',
          },
          context: {},
        })

        await getEndpointHandler(endpoint)(ctx)

        expect(billingHandlerState.calls).toHaveLength(1)
        expect(billingHandlerState.calls[0]?.handlerArgs).toEqual({
          method: HTTPMethod.POST,
          data: {
            resourceSlug: 'seats',
            externalId: 'invitee@example.com',
          },
        })
        expect(flowgladServerState.instances[0]?.config).toEqual(
          expect.objectContaining({ customerExternalId: 'org-1' })
        )
      })
    })
  })
})
