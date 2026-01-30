/**
 * Unit Test Mocks
 *
 * This file contains mock.module() calls for modules that need mocking
 * ONLY in unit tests. These mocks prevent network calls entirely.
 *
 * For DB tests, we allow these modules to make real HTTP calls that
 * passthrough MSW to the flowglad-mock-server containers (similar to
 * how Stripe SDK calls go to stripe-mock).
 *
 * IMPORTANT: Import this file ONLY in bun.unit.setup.ts, AFTER bun.mocks.ts.
 */
import { mock } from 'bun:test'

// Import and register the Unkey SDK mock (working mock for unit tests)
import { MockUnkey } from './mocks/unkey-sdk-mock'

mock.module('@unkey/api', () => ({
  Unkey: MockUnkey,
  default: MockUnkey,
}))

// Import and register Redis utility mock
import { redisMockExports } from './mocks/redis-mock'

mock.module('@/utils/redis', () => redisMockExports)

// Import and register Svix utility mock
import { svixMockExports } from './mocks/svix-mock'

mock.module('@/utils/svix', () => svixMockExports)

// Block raw SDK access in unit tests (they should use utility modules)
mock.module('svix', () => {
  const SvixBlocked = function () {
    throw new Error(
      '[Unit Test] Direct Svix SDK access is blocked. Use @/utils/svix functions instead, ' +
        'or rename to *.db.test.ts to use the mock server.'
    )
  }
  return {
    Svix: SvixBlocked,
    default: SvixBlocked,
  }
})

mock.module('@upstash/redis', () => {
  const RedisBlocked = function () {
    throw new Error(
      '[Unit Test] Direct Redis SDK access is blocked. Use @/utils/redis functions instead, ' +
        'or rename to *.db.test.ts to use the mock server.'
    )
  }
  return {
    Redis: RedisBlocked,
    default: RedisBlocked,
  }
})
