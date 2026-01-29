/**
 * DB Test Mocks
 *
 * This file provides blocking mocks for external services that should NOT be
 * accessed in db.test.ts files, plus working mocks for utility modules.
 *
 * IMPORTANT: This file must be imported AFTER bun.mocks.ts in db test setup.
 *
 * It does two things:
 * 1. Blocks direct SDK access (Stripe, Unkey, Svix, Redis, Resend, Trigger)
 * 2. Mocks @/utils/unkey with working implementations (since SDK is blocked)
 *
 * If a test legitimately needs real external services, use *.integration.test.ts instead.
 */
import { mock } from 'bun:test'

// Import and register SDK blockers
import './mocks/db-blockers'

// Import and register @/utils/unkey mock (needed since @unkey/api is blocked)
import { unkeyUtilsMockExports } from './mocks/unkey-utils-mock'

mock.module('@/utils/unkey', () => unkeyUtilsMockExports)

// NOTE: Stripe is NOT mocked in db tests.
// DB tests use stripe-mock (Docker container) for Stripe API calls.
// Tests that need to mock Stripe functions should use *.stripe.test.ts instead.
