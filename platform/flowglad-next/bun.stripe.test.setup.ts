/**
 * Stripe-Mocked Test Setup
 *
 * This setup file is for tests that need to mock Stripe utility functions
 * to verify conditional API call logic or control specific response behaviors.
 *
 * Use for: Tests that verify WHEN Stripe APIs are called, WITH WHAT parameters,
 *          or need controlled response states (succeeded/failed/pending)
 * File pattern: *.stripe.test.ts
 *
 * Features:
 * - Database access (seeded once in beforeAll)
 * - Stripe utility functions are MOCKED (not routed to stripe-mock)
 * - MSW in STRICT mode (errors on unhandled requests)
 * - Environment variables auto-tracked and restored
 * - Spies auto-restored via globalSpyManager
 * - Global mock state reset after each test
 * - Stripe mocks reset after each test
 *
 * When to use *.stripe.test.ts vs *.db.test.ts:
 * - Use *.stripe.test.ts when tests verify mock call parameters or conditional logic
 * - Use *.db.test.ts when tests just need Stripe APIs to work (routes to stripe-mock)
 *
 * Note: Tests share the database state. Use unique identifiers (nanoid)
 * to avoid collisions between tests.
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
// Block external services (Redis, Unkey, etc.) - must come after bun.mocks
import './bun.db.mocks'
// Import Stripe function mocks - must come after bun.db.mocks
import { resetAllStripeMocks } from './bun.stripe.mocks'

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

  // Reset all Stripe function mocks
  resetAllStripeMocks()
})

afterAll(() => {
  server.close()
})
