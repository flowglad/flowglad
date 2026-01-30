/**
 * Integration test mocks for bun:test
 *
 * This file contains only the essential mocks needed for integration tests.
 * Unlike bun.mocks.ts (used by unit/db tests), this DOES NOT mock:
 * - @/utils/redis (integration tests use real Redis via _setTestRedisClient or describeIfRedisKey)
 * - @/utils/svix (integration tests may need real Svix)
 * - @unkey/api (integration tests use real Unkey API)
 *
 * This allows integration tests to:
 * 1. Make real Redis calls when credentials are available
 * 2. Inject mock Redis clients via _setTestRedisClient() for specific test scenarios
 * 3. Use real Svix and Unkey APIs when needed
 *
 * This file MUST be imported before any other modules in bun.integration.setup.ts.
 */

// Import common module mocks (auth, server-only)
import './mocks/module-mocks'
