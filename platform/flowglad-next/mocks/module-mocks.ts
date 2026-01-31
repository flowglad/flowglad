/**
 * Common Module Mocks
 *
 * This file contains mock.module() calls for modules that need mocking
 * across all test types (unit, db, integration).
 *
 * IMPORTANT: Mock module registration order is critical in bun:test.
 * These mocks must be registered before any imports that transitively
 * load the mocked modules.
 *
 * Import this file FIRST in test setup files.
 *
 * NOTE: Trigger.dev tasks are NOT mocked here. They route to the mock server
 * via TRIGGER_API_URL when set in .env.test.
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
