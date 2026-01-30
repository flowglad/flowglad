/**
 * Tests for CLI Router - Device Authorization
 *
 * Tests the tRPC procedures for CLI device authorization flow.
 */

import type { Mock } from 'bun:test'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test'

// Mock modules BEFORE importing them
mock.module('next/headers', () => ({
  headers: mock(() => new Headers()),
  cookies: mock(() => ({
    set: mock(),
    get: mock(),
    delete: mock(),
  })),
}))

// Note: @/utils/auth is mocked globally in bun.setup.ts
// Tests can set globalThis.__mockedAuthSession to configure the session

import type { Organization } from '@db-core/schema/organizations'
import type { User } from '@db-core/schema/users'
import { TRPCError } from '@trpc/server'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { cliRouter } from '@/server/routers/cliRouter'
import type { TRPCContext } from '@/server/trpcContext'
import { createSpyTracker } from '@/test/spyTracker'
import { auth } from '@/utils/auth'

let organization: Organization.Record
let user: User.Record

const spyTracker = createSpyTracker()

// Helper to create a caller with a user context
const createAuthenticatedCaller = (user: User.Record) => {
  const ctx: TRPCContext = {
    user,
    path: '/cli',
    environment: 'test',
    livemode: false,
    organizationId: undefined,
    organization: undefined,
    isApi: false,
    apiKey: undefined,
  }
  return cliRouter.createCaller(ctx)
}

// Helper to create a caller without auth (for public procedures)
const createPublicCaller = () => {
  const ctx: TRPCContext = {
    user: undefined,
    path: '/cli',
    environment: 'test',
    livemode: false,
    organizationId: undefined,
    organization: undefined,
    isApi: false,
    apiKey: undefined,
  }
  return cliRouter.createCaller(ctx)
}

beforeEach(async () => {
  spyTracker.reset()
  globalThis.__mockedAuthSession = null

  // Set up organization with products and prices
  const orgSetup = await setupOrg()
  organization = orgSetup.organization

  // Set up user
  const userSetup = await setupUserAndApiKey({
    organizationId: organization.id,
    livemode: false,
  })
  user = userSetup.user
})

afterEach(() => {
  spyTracker.restoreAll()
})

describe('cli.verifyDeviceCode', () => {
  it('returns valid true for valid user code', async () => {
    // Mock the fetch call to the device verification endpoint
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      } as Response)
    )

    try {
      const caller = createPublicCaller()
      const result = await caller.verifyDeviceCode({
        userCode: 'ABCD-1234',
      })

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('returns valid false for invalid user code', async () => {
    // Mock the fetch call to return a 404/error
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 404,
      } as Response)
    )

    try {
      const caller = createPublicCaller()
      const result = await caller.verifyDeviceCode({
        userCode: 'INVALID-CODE',
      })

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid or expired code')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('cli.approveDevice', () => {
  it('approves device and returns success', async () => {
    // Set up the mocked auth session
    globalThis.__mockedAuthSession = {
      user: {
        id: user.betterAuthId!,
        email: user.email,
        name: user.name || '',
        image: null,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {
        id: 'session_123',
        userId: user.betterAuthId!,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
        token: 'test_token',
      },
    }

    // Mock the auth.api.deviceApprove call
    const deviceApproveMock = mock(() =>
      Promise.resolve({ success: true })
    )
    spyTracker.track(
      mock.module('@/utils/auth', () => ({
        auth: {
          api: {
            deviceApprove: deviceApproveMock,
            getSession: mock(() =>
              Promise.resolve(globalThis.__mockedAuthSession)
            ),
          },
        },
        getSession: mock(() =>
          Promise.resolve(globalThis.__mockedAuthSession)
        ),
      }))
    )

    const caller = createAuthenticatedCaller(user)
    const result = await caller.approveDevice({
      userCode: 'ABCD-1234',
    })

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
  })
})

describe('cli.denyDevice', () => {
  it('denies device and returns success', async () => {
    // Set up the mocked auth session
    globalThis.__mockedAuthSession = {
      user: {
        id: user.betterAuthId!,
        email: user.email,
        name: user.name || '',
        image: null,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {
        id: 'session_123',
        userId: user.betterAuthId!,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
        token: 'test_token',
      },
    }

    // Mock the auth.api.deviceDeny call
    const deviceDenyMock = mock(() =>
      Promise.resolve({ success: true })
    )
    spyTracker.track(
      mock.module('@/utils/auth', () => ({
        auth: {
          api: {
            deviceDeny: deviceDenyMock,
            getSession: mock(() =>
              Promise.resolve(globalThis.__mockedAuthSession)
            ),
          },
        },
        getSession: mock(() =>
          Promise.resolve(globalThis.__mockedAuthSession)
        ),
      }))
    )

    const caller = createAuthenticatedCaller(user)
    const result = await caller.denyDevice({ userCode: 'ABCD-1234' })

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
  })
})
