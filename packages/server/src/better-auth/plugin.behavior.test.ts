import { describe, expect, it, vi } from 'vitest'
import {
  createFlowgladCustomerForOrganization,
  flowgladPlugin,
} from './plugin'

const flowgladServerState = vi.hoisted(() => ({
  instances: [] as Array<{
    config: unknown
    findOrCreateCustomerCalls: number
  }>,
}))

vi.mock('../FlowgladServer', () => ({
  FlowgladServer: class FlowgladServer {
    public readonly config: unknown
    private readonly state: {
      config: unknown
      findOrCreateCustomerCalls: number
    }

    public constructor(config: unknown) {
      this.config = config
      this.state = { config, findOrCreateCustomerCalls: 0 }
      flowgladServerState.instances.push(this.state)
    }

    public findOrCreateCustomer = async (): Promise<void> => {
      this.state.findOrCreateCustomerCalls += 1
    }
  },
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

const getConfigProp = (config: unknown, key: string) => {
  if (typeof config !== 'object' || config === null) {
    throw new Error('Expected FlowgladServer config to be an object')
  }
  return Reflect.get(config, key)
}

const getCustomerDetailsFromConfig = async (config: unknown) => {
  const fn = getConfigProp(config, 'getCustomerDetails')
  if (typeof fn !== 'function') {
    throw new Error('Expected getCustomerDetails to be a function')
  }
  const typed: (...args: unknown[]) => Promise<unknown> = fn
  return typed()
}

describe('createFlowgladCustomerForOrganization', () => {
  it('creates a Flowglad customer for the organization (org email/name take precedence) and calls findOrCreateCustomer', async () => {
    flowgladServerState.instances.length = 0

    await createFlowgladCustomerForOrganization(
      {
        customerType: 'organization',
        apiKey: 'sk_test',
        baseURL: 'https://x',
      },
      {
        organizationId: 'org-1',
        userId: 'user-1',
        userEmail: 'user@example.com',
        userName: 'User',
        organizationName: 'Acme Inc',
        organizationEmail: 'billing@acme.com',
      }
    )

    expect(flowgladServerState.instances).toHaveLength(1)
    const instance = flowgladServerState.instances[0]
    expect(instance?.findOrCreateCustomerCalls).toBe(1)

    const customerExternalId = getConfigProp(
      instance?.config,
      'customerExternalId'
    )
    expect(customerExternalId).toBe('org-1')

    await expect(
      getCustomerDetailsFromConfig(instance?.config)
    ).resolves.toEqual({
      name: 'Acme Inc',
      email: 'billing@acme.com',
    })
  })
})

describe('flowgladPlugin after hooks', () => {
  it('sign-up hook creates a Flowglad customer when customerType is user/undefined and returned.user.id exists', async () => {
    flowgladServerState.instances.length = 0
    const plugin = flowgladPlugin({})

    const hook =
      plugin.hooks.after.find((h) =>
        h.matcher({ path: '/sign-up' } as Parameters<
          typeof h.matcher
        >[0])
      ) ?? null
    if (!hook) {
      throw new Error('Expected sign-up hook')
    }

    await hook.handler({
      context: {
        returned: {
          user: { id: 'user-1', email: 'u@x.com', name: 'User' },
        },
      },
    } as Parameters<typeof hook.handler>[0])

    expect(flowgladServerState.instances).toHaveLength(1)
    const instance = flowgladServerState.instances[0]
    expect(
      getConfigProp(instance?.config, 'customerExternalId')
    ).toBe('user-1')
    await expect(
      getCustomerDetailsFromConfig(instance?.config)
    ).resolves.toEqual({
      name: 'User',
      email: 'u@x.com',
    })
  })

  it('sign-up hook does nothing when returned.user.id is missing', async () => {
    flowgladServerState.instances.length = 0
    const plugin = flowgladPlugin({})

    const hook =
      plugin.hooks.after.find((h) =>
        h.matcher({ path: '/sign-up' } as Parameters<
          typeof h.matcher
        >[0])
      ) ?? null
    if (!hook) {
      throw new Error('Expected sign-up hook')
    }

    await hook.handler({
      context: { returned: { user: {} } },
    } as Parameters<typeof hook.handler>[0])

    expect(flowgladServerState.instances).toHaveLength(0)
  })

  it('sign-up hook does nothing when customerType is organization', async () => {
    flowgladServerState.instances.length = 0
    const plugin = flowgladPlugin({ customerType: 'organization' })

    const hook =
      plugin.hooks.after.find((h) =>
        h.matcher({ path: '/sign-up/email' } as Parameters<
          typeof h.matcher
        >[0])
      ) ?? null
    if (!hook) {
      throw new Error('Expected sign-up hook')
    }

    await hook.handler({
      context: {
        returned: {
          user: { id: 'user-1', email: 'u@x.com', name: 'User' },
        },
      },
    } as Parameters<typeof hook.handler>[0])

    expect(flowgladServerState.instances).toHaveLength(0)
  })

  it('organization-create hook creates an org Flowglad customer and prefers owner email from adapter lookup', async () => {
    flowgladServerState.instances.length = 0
    const plugin = flowgladPlugin({ customerType: 'organization' })

    const hook =
      plugin.hooks.after.find((h) =>
        h.matcher({ path: '/organization/create' } as Parameters<
          typeof h.matcher
        >[0])
      ) ?? null
    if (!hook) {
      throw new Error('Expected organization-create hook')
    }

    type Row = Record<string, string>
    class InMemoryAdapter {
      private readonly data: Record<string, Row[]>

      public constructor(data: Record<string, Row[]>) {
        this.data = data
      }

      public findOne = async (args: {
        model: string
        where: { field: string; value: string }[]
      }): Promise<unknown> => {
        const rows = this.data[args.model] ?? []
        const found =
          rows.find((row) =>
            args.where.every(
              (clause) => row[clause.field] === clause.value
            )
          ) ?? null
        return found
      }

      public findMany = async (args: {
        model: string
        where: { field: string; value: string }[]
      }): Promise<unknown> => {
        const rows = this.data[args.model] ?? []
        return rows.filter((row) =>
          args.where.every(
            (clause) => row[clause.field] === clause.value
          )
        )
      }
    }

    const adapter = new InMemoryAdapter({
      organization: [{ id: 'org-1', name: 'Acme Inc', slug: 'acme' }],
      member: [
        {
          userId: 'user-member',
          organizationId: 'org-1',
          role: 'member',
        },
        {
          userId: 'user-owner',
          organizationId: 'org-1',
          role: 'owner',
        },
      ],
      user: [{ id: 'user-owner', email: 'owner@acme.com' }],
    })

    await hook.handler({
      context: {
        adapter,
        orgOptions: { creatorRole: 'owner' },
        session: {
          user: { id: 'user-member', email: 'member@acme.com' },
        },
        returned: {
          organization: {
            id: 'org-1',
            name: 'Acme Inc',
            slug: 'acme',
          },
        },
      },
    } as Parameters<typeof hook.handler>[0])

    expect(flowgladServerState.instances).toHaveLength(1)
    const instance = flowgladServerState.instances[0]
    expect(
      getConfigProp(instance?.config, 'customerExternalId')
    ).toBe('org-1')
    await expect(
      getCustomerDetailsFromConfig(instance?.config)
    ).resolves.toEqual({
      name: 'Acme Inc',
      email: 'owner@acme.com',
    })
  })

  it('organization-create hook falls back to name "Organization" when returned.organization.name is not a string', async () => {
    flowgladServerState.instances.length = 0
    const plugin = flowgladPlugin({ customerType: 'organization' })

    const hook =
      plugin.hooks.after.find((h) =>
        h.matcher({ path: '/organization/create' } as Parameters<
          typeof h.matcher
        >[0])
      ) ?? null
    if (!hook) {
      throw new Error('Expected organization-create hook')
    }

    const adapter = {
      findOne: async () => null,
      findMany: async () => [],
    }

    await hook.handler({
      context: {
        adapter,
        session: { user: { id: 'user-1', email: 'u@x.com' } },
        returned: {
          organization: { id: 'org-1', name: null, slug: 'acme' },
        },
      },
    } as Parameters<typeof hook.handler>[0])

    expect(flowgladServerState.instances).toHaveLength(1)
    const instance = flowgladServerState.instances[0]
    await expect(
      getCustomerDetailsFromConfig(instance?.config)
    ).resolves.toEqual({
      name: 'Organization',
      email: 'u@x.com',
    })
  })

  it('organization-create hook does nothing when customerType is not organization', async () => {
    flowgladServerState.instances.length = 0
    const plugin = flowgladPlugin({ customerType: 'user' })

    const hook =
      plugin.hooks.after.find((h) =>
        h.matcher({ path: '/organization/create' } as Parameters<
          typeof h.matcher
        >[0])
      ) ?? null
    if (!hook) {
      throw new Error('Expected organization-create hook')
    }

    await hook.handler({
      context: {
        session: { user: { id: 'user-1', email: 'u@x.com' } },
        returned: { organization: { id: 'org-1', name: 'Acme' } },
      },
    } as Parameters<typeof hook.handler>[0])

    expect(flowgladServerState.instances).toHaveLength(0)
  })
})
