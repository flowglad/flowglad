/// <reference types="@testing-library/jest-dom" />
import { afterAll, afterEach, beforeAll, mock } from 'bun:test'
import { webcrypto } from 'node:crypto'

/**
 * Global mutable auth state for testing.
 * Tests can set `globalThis.__mockedAuthSession` to control what getSession() returns.
 * This ensures consistent mocking across all test files.
 */
declare global {
  // eslint-disable-next-line no-var
  var __mockedAuthSession:
    | null
    | { user: { id: string; email: string } }
    | undefined
}
globalThis.__mockedAuthSession = null

// IMPORTANT: All mock.module() calls must come BEFORE any imports that might
// transitively load the mocked modules. This ensures the mocks are registered
// before module resolution caches the real implementations.
mock.module('server-only', () => ({}))

mock.module('@/utils/auth', () => ({
  auth: {
    api: {
      signInMagicLink: mock(async () => ({ success: true })),
      createUser: mock(async () => ({})),
      getSession: async () => globalThis.__mockedAuthSession,
    },
  },
  getSession: async () => globalThis.__mockedAuthSession,
}))

mock.module('@trigger.dev/core', () => ({
  idempotencyKeys: {
    create: async (key: string) => `mock-${key}-${Math.random()}`,
  },
}))

// Now import the remaining modules (after mocks are set up)
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { cleanup } from '@testing-library/react'
import { server } from './mocks/server'
import { seedDatabase } from './seedDatabase'

GlobalRegistrator.register()

import { expect } from 'bun:test'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)

process.env.UNKEY_API_ID = process.env.UNKEY_API_ID || 'api_test_mock'
process.env.UNKEY_ROOT_KEY =
  process.env.UNKEY_ROOT_KEY || 'unkey_test_mock'
process.env.BETTER_AUTH_URL =
  process.env.BETTER_AUTH_URL || 'http://localhost:3000'

if (!global.crypto) {
  global.crypto = webcrypto as unknown as Crypto
}

beforeAll(async () => {
  if (!global.crypto) {
    global.crypto = webcrypto as unknown as Crypto
  }
  server.listen({ onUnhandledRequest: 'warn' })
  await seedDatabase()
})

afterEach(() => {
  server.resetHandlers()
  cleanup()
})

afterAll(async () => {
  server.close()
})
