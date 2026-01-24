/**
 * DB-Backed Test Setup
 *
 * This setup file is for tests that need database access but should be isolated.
 * Each test runs within a savepoint that rolls back after the test completes.
 *
 * Use for: Table methods, business logic with DB, service layer tests
 * File pattern: *.dbtest.ts
 *
 * Features:
 * - Database access via auto-rollback savepoints
 * - Each test starts clean (changes don't persist between tests)
 * - MSW in STRICT mode (errors on unhandled requests)
 * - Environment variables auto-tracked and restored
 * - Spies auto-restored via globalSpyManager
 * - Global mock state reset after each test
 *
 * Note: The database is seeded ONCE in beforeAll. Each test then creates
 * a savepoint and rolls back at the end, so tests see the seeded data
 * but don't affect each other.
 */

/// <reference types="@testing-library/jest-dom" />

// Set environment variables FIRST, before any imports that might use them
process.env.UNKEY_API_ID = process.env.UNKEY_API_ID || 'api_test_mock'
process.env.UNKEY_ROOT_KEY =
  process.env.UNKEY_ROOT_KEY || 'unkey_test_mock'
process.env.BETTER_AUTH_URL =
  process.env.BETTER_AUTH_URL || 'http://localhost:3000'

// IMPORTANT: Import mocks first, before any other imports
import './bun.mocks'

// Import consolidated global type declarations (after mocks)
import '@/test/globals.d'

// Initialize auth session mock to null (will be reset after each test)
globalThis.__mockedAuthSession = null

import { afterAll, afterEach, beforeAll, beforeEach } from 'bun:test'
import { cleanup } from '@testing-library/react'
import {
  beginOuterTransaction,
  beginTestTransaction,
  cleanupTestDb,
  rollbackTestTransaction,
} from '@/test/db/transactionIsolation'
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

  // Seed database once (this commits and persists via normal db client)
  await seedDatabase()

  // Start outer transaction for this file's test isolation
  // Each file gets its own dedicated connection
  await beginOuterTransaction()
})

beforeEach(async () => {
  // Capture environment state at test start
  envTracker.startTracking()

  // Start a savepoint - all DB changes in this test will be rolled back
  await beginTestTransaction()
})

afterEach(async () => {
  // Rollback all DB changes made during the test
  await rollbackTestTransaction()

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

afterAll(async () => {
  server.close()
  await cleanupTestDb()
})
