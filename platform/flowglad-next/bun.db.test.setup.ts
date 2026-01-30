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
 * External Services (via mock server containers):
 * - Stripe → stripe-mock (localhost:12111)
 * - Svix → flowglad-mock-server (localhost:9001)
 * - Unkey → flowglad-mock-server (localhost:9002)
 * - Trigger.dev → flowglad-mock-server (localhost:9003)
 *
 * Note: Tests share the database state. Use unique identifiers (nanoid)
 * to avoid collisions between tests.
 */

/// <reference types="@testing-library/jest-dom" />

// IMPORTANT: Import mocks first, before any other imports
// This also sets test environment variable defaults (UNKEY_*, BETTER_AUTH_URL)
import './bun.mocks'
// Block external services (Redis, Resend) - must come after bun.mocks
// Note: Svix, Unkey, Trigger.dev passthrough to flowglad-mock-server
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

/**
 * Check if a mock server is healthy by hitting its health endpoint.
 * Returns true if healthy, false if not reachable.
 */
async function checkMockServerHealth(
  url: string,
  headers?: Record<string, string>
): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1000)
    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    })
    clearTimeout(timeout)
    return response.ok
  } catch {
    return false
  }
}

/**
 * Verify all required mock servers are running.
 * Throws descriptive error if any are missing.
 */
async function verifyMockServers(): Promise<void> {
  const servers = [
    {
      name: 'stripe-mock',
      url: 'http://localhost:12111/v1/customers',
      envVar: 'STRIPE_MOCK_HOST',
      // stripe-mock requires authentication
      headers: { Authorization: 'Bearer sk_test_xxx' },
    },
    {
      name: 'flowglad-mock-server (Svix)',
      url: 'http://localhost:9001/health',
      envVar: 'SVIX_MOCK_HOST',
    },
    {
      name: 'flowglad-mock-server (Unkey)',
      url: 'http://localhost:9002/health',
      envVar: 'UNKEY_MOCK_HOST',
    },
    {
      name: 'flowglad-mock-server (Trigger)',
      url: 'http://localhost:9003/health',
      envVar: 'TRIGGER_API_URL',
    },
    {
      name: 'flowglad-mock-server (Redis)',
      url: 'http://localhost:9004/health',
      envVar: 'UPSTASH_REDIS_REST_URL',
    },
    {
      name: 'flowglad-mock-server (Resend)',
      url: 'http://localhost:9005/health',
      envVar: 'RESEND_BASE_URL',
    },
    {
      name: 'flowglad-mock-server (Cloudflare)',
      url: 'http://localhost:9006/health',
      envVar: 'CLOUDFLARE_R2_ENDPOINT',
    },
  ]

  const results = await Promise.all(
    servers.map(async (s) => ({
      ...s,
      healthy: await checkMockServerHealth(s.url, s.headers),
    }))
  )

  const unhealthy = results.filter((r) => !r.healthy)
  if (unhealthy.length > 0) {
    const missing = unhealthy.map((r) => `  - ${r.name}`).join('\n')
    throw new Error(
      `Mock server(s) not running:\n${missing}\n\n` +
        `Start them with: bun run test:setup\n` +
        `Or: docker-compose -f docker-compose.test.yml up -d`
    )
  }
}

beforeAll(async () => {
  // MSW STRICT mode - fail on unhandled external requests
  server.listen({ onUnhandledRequest: 'error' })

  // Verify mock servers are running before proceeding
  await verifyMockServers()

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
