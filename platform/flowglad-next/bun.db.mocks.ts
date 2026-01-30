/**
 * DB Test Mocks
 *
 * This file provides blocking mocks for external services that should NOT be
 * accessed in db.test.ts files, plus working mocks for utility modules.
 *
 * IMPORTANT: This file must be imported AFTER bun.mocks.ts in db test setup.
 *
 * Services that passthrough to mock server containers (NOT mocked):
 * - Stripe SDK → stripe-mock (localhost:12111)
 * - Svix SDK → flowglad-mock-server (localhost:9001)
 * - Unkey SDK → flowglad-mock-server (localhost:9002)
 * - Trigger.dev SDK → flowglad-mock-server (localhost:9003)
 *
 * Services that are blocked (no mock container available):
 * - Redis (@upstash/redis) - use mocked @/utils/redis
 * - Resend - mock at test level if needed
 *
 * If a test legitimately needs real external services, use *.integration.test.ts instead.
 */
import { mock } from 'bun:test'

// Import and register SDK blockers (only Redis and Resend are blocked)
import './mocks/db-blockers'

// Import and register Redis utility mock (since @upstash/redis is blocked)
import { redisMockExports } from './mocks/redis-mock'

mock.module('@/utils/redis', () => redisMockExports)

// NOTE: Stripe, Svix, Unkey, and Trigger.dev are NOT mocked in db tests.
// DB tests use mock server containers for these services:
// - Stripe → stripe-mock (localhost:12111)
// - Svix → flowglad-mock-server (localhost:9001)
// - Unkey → flowglad-mock-server (localhost:9002)
// - Trigger.dev → flowglad-mock-server (localhost:9003)
//
// Tests that need to mock specific functions should use *.stripe.test.ts pattern.
