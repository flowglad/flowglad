/**
 * Integration test mocks for bun:test
 *
 * This file contains only the essential mocks needed for integration tests.
 * Unlike bun.mocks.ts (used by unit/db tests), this DOES NOT mock:
 * - @/utils/redis (integration tests use real Redis or _setTestRedisClient)
 * - @/utils/svix (integration tests may need real Svix)
 *
 * This file MUST be imported before any other modules in bun.integration.setup.ts.
 */
import { mock } from 'bun:test'

// Import common module mocks (trigger tasks, auth, server-only)
import './mocks/module-mocks'

// Import and register the Unkey SDK mock (still needed to prevent real API calls)
import { MockUnkey } from './mocks/unkey-sdk-mock'

mock.module('@unkey/api', () => ({
  Unkey: MockUnkey,
  default: MockUnkey,
}))

// NOTE: Unlike bun.mocks.ts, we do NOT mock @/utils/redis or @/utils/svix here.
// Integration tests that need to test real Redis behavior (like evalWithShaFallback)
// can use _setTestRedisClient() to inject a mock client while still using the
// real implementation logic.
