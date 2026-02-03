/**
 * Tests for CLI Router - Device Authorization
 *
 * Tests the tRPC procedures for CLI device authorization flow.
 * Note: @/utils/auth is mocked globally in mocks/module-mocks.ts
 * with deviceApprove and deviceDeny methods.
 */

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

import type { Organization } from '@db-core/schema/organizations'
import type { User } from '@db-core/schema/users'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { cliRouter } from '@/server/routers/cliRouter'
import type { TRPCContext } from '@/server/trpcContext'

let organization: Organization.Record
let user: User.Record

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

beforeEach(async () => {
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
  globalThis.__mockedAuthSession = null
})

describe('cli.verifyDeviceCode', () => {
  it('returns valid true for valid user code when authenticated', async () => {
    // Mock the fetch call to the device verification endpoint
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      } as Response)
    ) as unknown as typeof fetch

    try {
      // verifyDeviceCode requires authentication to prevent code probing
      const caller = createAuthenticatedCaller(user)
      const result = await caller.verifyDeviceCode({
        userCode: 'ABCD-1234',
      })

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('returns valid false for invalid user code when authenticated', async () => {
    // Mock the fetch call to return a 404/error
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 404,
      } as Response)
    ) as unknown as typeof fetch

    try {
      // verifyDeviceCode requires authentication to prevent code probing
      const caller = createAuthenticatedCaller(user)
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
  it('approves device and returns success when auth.api.deviceApprove succeeds', async () => {
    // The global mock in module-mocks.ts provides deviceApprove
    // that returns { success: true }
    const caller = createAuthenticatedCaller(user)
    const result = await caller.approveDevice({
      userCode: 'ABCD-1234',
    })

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
  })
})

describe('cli.denyDevice', () => {
  it('denies device and returns success when auth.api.deviceDeny succeeds', async () => {
    // The global mock in module-mocks.ts provides deviceDeny
    // that returns { success: true }
    const caller = createAuthenticatedCaller(user)
    const result = await caller.denyDevice({ userCode: 'ABCD-1234' })

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
  })
})
