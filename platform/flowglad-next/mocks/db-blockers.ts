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
 * - Unkey (@unkey/api) - Use mocked @/utils/unkey functions instead
 * - Svix (svix) - Use mocked @/utils/svix functions instead
 * - Resend (resend) - Mock at the function level if needed
 *
 * NOT blocked (handled by stripe-mock):
 * - Stripe (stripe) - SDK calls go to stripe-mock container (localhost:12111)
 *
 * If a test legitimately needs these services, use *.integration.test.ts instead.
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
 */
mock.module('@upstash/redis', () => {
  const blockedRedis = createBlockingProxy('Redis (@upstash/redis)')
  return {
    Redis: blockedRedis,
    default: blockedRedis,
  }
})

// NOTE: Stripe SDK is NOT blocked - calls go to stripe-mock container
// The Stripe SDK is configured in src/utils/stripe.ts to point to stripe-mock
// when running in test mode (localhost:12111)

/**
 * Block @unkey/api - Unkey SDK
 */
mock.module('@unkey/api', () => {
  const UnkeyBlocked = function () {
    throw createBlockedServiceError('Unkey (@unkey/api)')
  }
  return {
    Unkey: UnkeyBlocked,
    default: UnkeyBlocked,
    verifyKey: () => {
      throw createBlockedServiceError('Unkey (@unkey/api)')
    },
  }
})

/**
 * Block svix - Webhook delivery service
 */
mock.module('svix', () => {
  const SvixBlocked = function () {
    throw createBlockedServiceError('Svix')
  }
  return {
    Svix: SvixBlocked,
    default: SvixBlocked,
  }
})

/**
 * Block resend - Email service
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

/**
 * Block @trigger.dev/sdk - Background job service
 */
mock.module('@trigger.dev/sdk', () => {
  const blocked = createBlockingProxy(
    'Trigger.dev (@trigger.dev/sdk)'
  )
  return {
    configure: blocked,
    TriggerClient: blocked,
    eventTrigger: blocked,
    cronTrigger: blocked,
    default: blocked,
  }
})
