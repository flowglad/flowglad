/**
 * External Service Blockers for DB Tests
 *
 * This file provides blocking mocks for external services that should NOT be
 * accessed in db.test.ts files. When code attempts to use these services,
 * it will fail immediately with a descriptive error.
 *
 * IMPORTANT: This file must be imported AFTER module-mocks.ts in db test setup.
 *
 * Services blocked:
 * - Redis (@upstash/redis) - Use mocked @/utils/redis functions instead
 * - Resend (resend) - Mock at the function level if needed
 *
 * NOT blocked (passthrough to mock server containers):
 * - Stripe (stripe) - SDK calls go to stripe-mock container (localhost:12111)
 * - Svix (svix) - SDK calls go to flowglad-mock-server (localhost:9001)
 * - Unkey (@unkey/api) - SDK calls go to flowglad-mock-server (localhost:9002)
 * - Trigger.dev (@trigger.dev/sdk) - SDK calls go to flowglad-mock-server (localhost:9003)
 *
 * If a test legitimately needs real external services, use *.integration.test.ts instead.
 */
import { mock } from 'bun:test'

/**
 * Error factory for blocked external services.
 */
function createBlockedServiceError(serviceName: string): Error {
  return new Error(
    `[DB Test] External service "${serviceName}" is blocked in db.test.ts files. ` +
      `If this test needs real ${serviceName} access, rename it to *.integration.test.ts. ` +
      `Otherwise, mock the specific function you need at the test level.`
  )
}

/**
 * Creates a proxy that throws on any property access or method call.
 */
function createBlockingProxy(serviceName: string): unknown {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      // Allow common inspection properties
      if (
        prop === Symbol.toStringTag ||
        prop === 'then' ||
        prop === Symbol.iterator
      ) {
        return undefined
      }
      // Throw for any other access
      throw createBlockedServiceError(serviceName)
    },
    apply() {
      throw createBlockedServiceError(serviceName)
    },
    construct() {
      throw createBlockedServiceError(serviceName)
    },
  }
  return new Proxy(function () {}, handler)
}

/**
 * Block @upstash/redis - Redis client
 * Redis is blocked because we don't have a redis-mock container.
 * Use mocked @/utils/redis functions instead.
 */
mock.module('@upstash/redis', () => {
  const blockedRedis = createBlockingProxy('Redis (@upstash/redis)')
  return {
    Redis: blockedRedis,
    default: blockedRedis,
  }
})

// NOTE: Stripe SDK is NOT blocked - calls go to stripe-mock container (localhost:12111)
// NOTE: Svix SDK is NOT blocked - calls go to flowglad-mock-server (localhost:9001)
// NOTE: Unkey SDK is NOT blocked - calls go to flowglad-mock-server (localhost:9002)
// NOTE: Trigger.dev SDK is NOT blocked - calls go to flowglad-mock-server (localhost:9003)

/**
 * Block resend - Email service
 * Resend is blocked because we don't have a resend-mock container.
 */
mock.module('resend', () => {
  const ResendBlocked = function () {
    throw createBlockedServiceError('Resend')
  }
  return {
    Resend: ResendBlocked,
    default: ResendBlocked,
  }
})
