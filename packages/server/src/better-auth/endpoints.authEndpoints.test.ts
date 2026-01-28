import { HTTPMethod } from '@flowglad/shared'
import { getSessionFromCtx } from 'better-auth/api'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBillingEndpoints,
  createGetExternalIdEndpoint,
  createGetPricingModelEndpoint,
} from './endpoints'

type PricingModelHandlerResult = {
  status: number
  data?: unknown
  error?: unknown
}

type BillingHandlerResult = {
  data: {}
  status: number
  error?: {
    code: string
    json: Record<string, unknown>
  }
}

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

const pricingModelState = vi.hoisted(() => ({
  calls: [] as Array<unknown>,
  impl: async (
    _handlerArgs: unknown,
    _deps: unknown
  ): Promise<PricingModelHandlerResult> => ({
    status: 200,
    data: {},
  }),
}))

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

vi.mock('../FlowgladServerAdmin', () => ({
  FlowgladServerAdmin: class FlowgladServerAdmin {
    public readonly config: unknown
    public constructor(config: unknown) {
      this.config = config
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
          return billingHandlerState.impl(handlerArgs, flowgladServer)
        }
      },
    }
  )

  return {
    routeToHandlerMap,
  }
})

vi.mock('../subrouteHandlers/pricingModelHandlers', () => ({
  getPricingModel: async (
    handlerArgs: unknown,
    deps: unknown
  ): Promise<{ status: number; data?: unknown; error?: unknown }> => {
    pricingModelState.calls.push({ handlerArgs, deps })
    const result = await pricingModelState.impl(handlerArgs, deps)
    return result
  },
}))

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

describe('createGetExternalIdEndpoint', () => {
  it('throws when headers are missing', async () => {
    const endpoint = createGetExternalIdEndpoint({})
    const { ctx } = makeCtx({
      headers: undefined,
      context: {},
    })

    await expect(getEndpointHandler(endpoint)(ctx)).rejects.toThrow(
      /Headers are required/
    )
  })

  it('returns externalId: null when unauthenticated', async () => {
    vi.mocked(getSessionFromCtx).mockResolvedValueOnce(null)

    const endpoint = createGetExternalIdEndpoint({})
    const { ctx, responses } = makeCtx({
      headers: { get: () => null },
      context: {},
    })

    await getEndpointHandler(endpoint)(ctx)
    expect(responses[0]?.body).toEqual({ externalId: null })
  })

  it('returns userId when authenticated in user mode (even if active org exists)', async () => {
    const session = makeBetterAuthSessionResult({
      userId: 'user-1',
      email: 'u@x.com',
      name: 'U',
      activeOrganizationId: 'org-1',
    })

    vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

    const endpoint = createGetExternalIdEndpoint({
      customerType: 'user',
    })
    const { ctx, responses } = makeCtx({
      headers: { get: () => null },
      context: {},
    })

    await getEndpointHandler(endpoint)(ctx)
    expect(responses[0]?.body).toEqual({ externalId: 'user-1' })
  })

  it('returns activeOrganizationId when authenticated in organization mode and active org exists', async () => {
    const session = makeBetterAuthSessionResult({
      userId: 'user-1',
      email: 'u@x.com',
      name: 'U',
      activeOrganizationId: 'org-1',
    })

    vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

    const endpoint = createGetExternalIdEndpoint({
      customerType: 'organization',
    })
    const { ctx, responses } = makeCtx({
      headers: { get: () => null },
      context: {},
    })

    await getEndpointHandler(endpoint)(ctx)
    expect(responses[0]?.body).toEqual({ externalId: 'org-1' })
  })

  it('returns externalId: null in organization mode when active org is missing', async () => {
    const session = makeBetterAuthSessionResult({
      userId: 'user-1',
      email: 'u@x.com',
      name: 'U',
    })

    vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

    const endpoint = createGetExternalIdEndpoint({
      customerType: 'organization',
    })
    const { ctx, responses } = makeCtx({
      headers: { get: () => null },
      context: {},
    })

    await getEndpointHandler(endpoint)(ctx)
    expect(responses[0]?.body).toEqual({ externalId: null })
  })
})

describe('createBillingEndpoints (createFlowgladBillingEndpoint behavior)', () => {
  beforeEach(() => {
    billingHandlerState.impl = async () => ({ status: 200, data: {} })
    flowgladServerState.instances.length = 0
    billingHandlerState.calls.length = 0
  })

  it('returns 401 UNAUTHORIZED when session is missing', async () => {
    vi.mocked(getSessionFromCtx).mockResolvedValueOnce(null)

    const endpoints = createBillingEndpoints({})
    const endpoint = endpoints.getCustomerBilling
    const { ctx, responses } = makeCtx({
      headers: { get: () => null },
      body: {},
      context: {},
    })

    await getEndpointHandler(endpoint)(ctx)

    expect(responses[0]?.init?.status).toBe(401)
    expect(responses[0]?.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    })
    expect(flowgladServerState.instances).toHaveLength(0)
    expect(billingHandlerState.calls).toHaveLength(0)
  })

  it('returns 400 NO_ACTIVE_ORGANIZATION when org billing is configured but no active org exists', async () => {
    const session = makeBetterAuthSessionResult({
      userId: 'user-1',
      email: 'u@x.com',
      name: 'U',
    })

    vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

    const endpoints = createBillingEndpoints({
      customerType: 'organization',
    })
    const endpoint = endpoints.getCustomerBilling
    const { ctx, responses } = makeCtx({
      headers: { get: () => null },
      body: {},
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
  })

  it('treats non-record bodies as empty objects and still injects externalId', async () => {
    const session = makeBetterAuthSessionResult({
      userId: 'user-1',
      email: 'u@x.com',
      name: 'U',
    })

    vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

    const endpoints = createBillingEndpoints({})
    const endpoint = endpoints.getCustomerBilling
    const { ctx } = makeCtx({
      headers: { get: () => null },
      body: 'not-an-object',
      context: {},
    })

    await getEndpointHandler(endpoint)(ctx)

    expect(billingHandlerState.calls).toHaveLength(1)
    const firstCall = billingHandlerState.calls[0]
    expect(firstCall?.handlerArgs).toEqual({
      method: expect.any(String),
      data: { externalId: 'user-1' },
    })
  })

  it('server-injected externalId overrides client-provided externalId before validation/handler call', async () => {
    const session = makeBetterAuthSessionResult({
      userId: 'user-1',
      email: 'u@x.com',
      name: 'U',
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
    expect(billingHandlerState.calls[0]?.handlerArgs).toEqual({
      method: expect.any(String),
      data: { externalId: 'user-1' },
    })
  })

  it('returns 400 VALIDATION_ERROR when validator rejects the body', async () => {
    const session = makeBetterAuthSessionResult({
      userId: 'user-1',
      email: 'u@x.com',
      name: 'U',
    })

    vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

    const endpoints = createBillingEndpoints({})
    const endpoint = endpoints.createCheckoutSession
    const { ctx, responses } = makeCtx({
      headers: { get: () => null },
      body: {},
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
  })

  it('returns handler error with string message when error.json.message is a string', async () => {
    const session = makeBetterAuthSessionResult({
      userId: 'user-1',
      email: 'u@x.com',
      name: 'U',
    })

    vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

    billingHandlerState.impl = async () => ({
      status: 402,
      data: {},
      error: {
        code: 'payment_failed',
        json: { message: 'Card declined', extra: 'x' },
      },
    })

    const endpoints = createBillingEndpoints({})
    const endpoint = endpoints.getCustomerBilling
    const { ctx, responses } = makeCtx({
      headers: { get: () => null },
      body: {},
      context: {},
    })

    await getEndpointHandler(endpoint)(ctx)

    expect(responses[0]?.init?.status).toBe(402)
    expect(responses[0]?.body).toEqual({
      error: {
        code: 'payment_failed',
        message: 'Card declined',
        details: { message: 'Card declined', extra: 'x' },
      },
    })
  })

  it('falls back to code-based message when handler error.json.message is not a string', async () => {
    const session = makeBetterAuthSessionResult({
      userId: 'user-1',
      email: 'u@x.com',
      name: 'U',
    })

    vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

    billingHandlerState.impl = async () => ({
      status: 400,
      data: {},
      error: {
        code: 'bad_request',
        json: { message: 123 },
      },
    })

    const endpoints = createBillingEndpoints({})
    const endpoint = endpoints.getCustomerBilling
    const { ctx, responses } = makeCtx({
      headers: { get: () => null },
      body: {},
      context: {},
    })

    await getEndpointHandler(endpoint)(ctx)

    expect(responses[0]?.init?.status).toBe(400)
    expect(responses[0]?.body).toEqual({
      error: {
        code: 'bad_request',
        message: 'Flowglad API error: bad_request',
        details: { message: 123 },
      },
    })
  })
})

describe('createGetPricingModelEndpoint', () => {
  it('returns 500 CONFIGURATION_ERROR when apiKey is missing from options and env', async () => {
    const oldKey = process.env.FLOWGLAD_SECRET_KEY
    delete process.env.FLOWGLAD_SECRET_KEY

    const endpoint = createGetPricingModelEndpoint({})
    const { ctx, responses } = makeCtx({
      headers: { get: () => null },
      body: {},
      context: {},
    })

    await getEndpointHandler(endpoint)(ctx)

    expect(responses[0]?.init?.status).toBe(500)
    expect(responses[0]?.body).toEqual({
      error: {
        code: 'CONFIGURATION_ERROR',
        message: expect.stringContaining('API key required'),
      },
    })

    if (typeof oldKey === 'string') {
      process.env.FLOWGLAD_SECRET_KEY = oldKey
    }
  })

  it('calls pricing model handler unauthenticated with flowgladServer: null (admin fallback)', async () => {
    const oldKey = process.env.FLOWGLAD_SECRET_KEY
    process.env.FLOWGLAD_SECRET_KEY = 'sk_test_123'

    vi.mocked(getSessionFromCtx).mockResolvedValueOnce(null)

    pricingModelState.calls.length = 0
    const endpoint = createGetPricingModelEndpoint({})
    const { ctx } = makeCtx({
      headers: { get: () => null },
      body: {},
      context: {},
    })

    await getEndpointHandler(endpoint)(ctx)

    expect(pricingModelState.calls).toHaveLength(1)
    expect(pricingModelState.calls[0]).toEqual({
      handlerArgs: { method: HTTPMethod.POST, data: {} },
      deps: {
        flowgladServer: null,
        flowgladServerAdmin: expect.any(Object),
      },
    })

    if (typeof oldKey === 'string') {
      process.env.FLOWGLAD_SECRET_KEY = oldKey
    } else {
      delete process.env.FLOWGLAD_SECRET_KEY
    }
  })

  it('when authenticated but organization resolution fails, still calls handler with flowgladServer: null', async () => {
    const oldKey = process.env.FLOWGLAD_SECRET_KEY
    process.env.FLOWGLAD_SECRET_KEY = 'sk_test_123'

    const session = makeBetterAuthSessionResult({
      userId: 'user-1',
      email: 'u@x.com',
      name: 'U',
    })

    vi.mocked(getSessionFromCtx).mockResolvedValueOnce(session)

    pricingModelState.calls.length = 0
    const endpoint = createGetPricingModelEndpoint({
      customerType: 'organization',
    })
    const { ctx } = makeCtx({
      headers: { get: () => null },
      body: {},
      context: { adapter: null },
    })

    await getEndpointHandler(endpoint)(ctx)

    expect(pricingModelState.calls).toHaveLength(1)
    expect(pricingModelState.calls[0]).toEqual({
      handlerArgs: { method: HTTPMethod.POST, data: {} },
      deps: {
        flowgladServer: null,
        flowgladServerAdmin: expect.any(Object),
      },
    })

    if (typeof oldKey === 'string') {
      process.env.FLOWGLAD_SECRET_KEY = oldKey
    } else {
      delete process.env.FLOWGLAD_SECRET_KEY
    }
  })

  it('maps handler errors to better-auth format (message/details forwarded only when strings)', async () => {
    const oldKey = process.env.FLOWGLAD_SECRET_KEY
    process.env.FLOWGLAD_SECRET_KEY = 'sk_test_123'

    vi.mocked(getSessionFromCtx).mockResolvedValueOnce(null)

    pricingModelState.impl = async () => ({
      status: 404,
      error: {
        code: 'not_found',
        json: { message: 'Nope', details: 'x' },
      },
    })

    const endpoint = createGetPricingModelEndpoint({})
    const { ctx, responses } = makeCtx({
      headers: { get: () => null },
      body: {},
      context: {},
    })

    await getEndpointHandler(endpoint)(ctx)

    expect(responses[0]?.init?.status).toBe(404)
    expect(responses[0]?.body).toEqual({
      error: { code: 'not_found', message: 'Nope', details: 'x' },
    })

    if (typeof oldKey === 'string') {
      process.env.FLOWGLAD_SECRET_KEY = oldKey
    } else {
      delete process.env.FLOWGLAD_SECRET_KEY
    }
  })
})
