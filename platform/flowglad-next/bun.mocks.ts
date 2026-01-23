/**
 * This file MUST be imported before any other modules in bun.setup.ts.
 *
 * Mock module registration order is critical in bun:test - mock.module() calls
 * must precede any imports that transitively load the mocked modules. By isolating
 * all mock.module() calls in this file and importing it first, we ensure the mocks
 * are registered before module resolution caches the real implementations.
 */
import { mock } from 'bun:test'

// Mock server-only module (used by Next.js server components)
mock.module('server-only', () => ({}))

// Mock auth module with a globally-controllable session
// Tests can set `globalThis.__mockedAuthSession` to control what getSession() returns
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

// Mock Trigger.dev idempotency keys
mock.module('@trigger.dev/core', () => ({
  idempotencyKeys: {
    create: async (key: string) => `mock-${key}-${Math.random()}`,
  },
}))
