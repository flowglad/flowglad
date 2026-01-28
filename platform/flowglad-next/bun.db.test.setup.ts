/**
 * DB-Backed Test Setup
 *
 * This setup file is for tests that need database access.
 *
 * Use for: Table methods, business logic with DB, service layer tests
 * File pattern: *.db.test.ts
 *
 * Features:
 * - Database access (seeded once in beforeAll)
 * - MSW in STRICT mode (errors on unhandled requests)
 * - Environment variables auto-tracked and restored
 * - Spies auto-restored via globalSpyManager
 * - Global mock state reset after each test
 *
 * Note: Tests share the database state. Use unique identifiers (nanoid)
 * to avoid collisions between tests.
 */

/// <reference types="@testing-library/jest-dom" />

// IMPORTANT: Import mocks first, before any other imports
// This also sets test environment variable defaults (UNKEY_*, BETTER_AUTH_URL)
import './bun.mocks'
// Block external services (Redis, Stripe, Unkey, etc.) - must come after bun.mocks
import './bun.db.mocks'

// Import consolidated global type declarations (after mocks)
import '@/test/globals'

// Initialize auth session mock to null (will be reset after each test)
globalThis.__mockedAuthSession = null

import { afterAll, afterEach, beforeAll, beforeEach } from 'bun:test'
import { cleanup } from '@testing-library/react'
import { createAutoEnvTracker } from '@/test/isolation/envTracker'
import {
  initializeGlobalMockState,
  resetAllGlobalMocks,
} from '@/test/isolation/globalStateGuard'
import { globalSpyManager } from '@/test/isolation/spyManager'
import { server } from './mocks/server'
import { seedDatabase } from './seedDatabase'

const envTracker = createAutoEnvTracker()

// Initialize global state once at setup load time
initializeGlobalMockState()

beforeAll(async () => {
  // MSW STRICT mode - fail on unhandled external requests
  server.listen({ onUnhandledRequest: 'error' })

  // Seed database once
  await seedDatabase()
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
