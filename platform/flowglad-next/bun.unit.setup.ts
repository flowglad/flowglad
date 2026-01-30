/**
 * Pure Unit Test Setup
 *
 * This setup file is for tests that should NOT access the database.
 * It BLOCKS database imports - any test that tries to import db modules will fail immediately.
 *
 * Use for: Pure functions, schema validation, UI logic, utilities
 * File pattern: *.unit.test.ts
 *
 * Features:
 * - Database access BLOCKED (throws error if attempted)
 * - MSW in STRICT mode (errors on unhandled requests)
 * - Environment variables auto-tracked and restored
 * - Spies auto-restored via globalSpyManager
 * - Global mock state reset after each test
 */

/// <reference types="@testing-library/jest-dom" />
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  mock,
} from 'bun:test'

// BLOCK database imports FIRST - before any other imports that might load them
// This ensures unit tests cannot accidentally access the database
mock.module('@/db/client', () => {
  throw new Error(
    'Database access is blocked in unit tests. ' +
      'If your test needs database access, rename it to *.db.test.ts'
  )
})

mock.module('@/db/adminTransaction', () => {
  throw new Error(
    'Database access is blocked in unit tests. ' +
      'If your test needs database access, rename it to *.db.test.ts'
  )
})

mock.module('@/db/authenticatedTransaction', () => {
  throw new Error(
    'Database access is blocked in unit tests. ' +
      'If your test needs database access, rename it to *.db.test.ts'
  )
})

mock.module('@/db/recomputeTransaction', () => {
  throw new Error(
    'Database access is blocked in unit tests. ' +
      'If your test needs database access, rename it to *.db.test.ts'
  )
})

// Import standard mocks (after db blockers)
import './bun.mocks'
// Import unit-test-only mocks (Svix, Unkey, Redis - no network calls)
import './bun.unit.mocks'

// Now import isolation utilities and other modules
import { cleanup } from '@testing-library/react'
import { createAutoEnvTracker } from '@/test/isolation/envTracker'
import {
  initializeGlobalMockState,
  resetAllGlobalMocks,
} from '@/test/isolation/globalStateGuard'
import { globalSpyManager } from '@/test/isolation/spyManager'
import { server } from './mocks/server'

const envTracker = createAutoEnvTracker()

// Initialize global state once at setup load time
initializeGlobalMockState()

beforeAll(() => {
  // MSW STRICT mode - fail on unhandled requests
  // Unit tests should have all external calls mocked
  server.listen({ onUnhandledRequest: 'error' })
})

beforeEach(() => {
  // Capture environment state at test start
  envTracker.startTracking()
})

afterEach(() => {
  // Reset MSW handlers
  server.resetHandlers()

  // Cleanup React testing-library
  cleanup()

  // Auto-restore all tracked spies (does not affect mock.module)
  globalSpyManager.restoreAll()

  // Auto-restore all environment variable changes
  envTracker.restoreAll()

  // Reset all global mock state (__mockedAuthSession, __mock*, etc.)
  resetAllGlobalMocks()
})

afterAll(() => {
  server.close()
})
