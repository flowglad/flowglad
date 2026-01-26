/**
 * Strict External Service Mocks for DB Tests
 *
 * This file provides blocking mocks for external services that should NOT be
 * accessed in db.test.ts files. When code attempts to use these services,
 * it will fail immediately with a descriptive error.
 *
 * IMPORTANT: This file must be imported AFTER bun.mocks.ts in db test setup.
 *
 * Services blocked:
 * - Redis (@upstash/redis) - Use in-memory state or test helpers instead
 * - Stripe (stripe) - Mock at the function level if needed
 * - Unkey (@unkey/api) - Mock at the function level if needed
 * - Svix (svix) - Mock at the function level if needed
 * - Resend (resend) - Mock at the function level if needed
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
 *
 * The real module returns a class that creates HTTP-based Redis clients.
 * We block both the class instantiation and any method calls.
 */
mock.module('@upstash/redis', () => {
  const blockedRedis = createBlockingProxy('Redis (@upstash/redis)')
  return {
    Redis: blockedRedis,
    default: blockedRedis,
  }
})

/**
 * Block stripe - Stripe SDK
 *
 * The real module is a class constructor. Block instantiation.
 */
mock.module('stripe', () => {
  const StripeBlocked = function () {
    throw createBlockedServiceError('Stripe')
  }
  // Stripe SDK exports default as the class
  return {
    default: StripeBlocked,
    Stripe: StripeBlocked,
  }
})

/**
 * Block @unkey/api - Unkey SDK
 *
 * The real module exports an Unkey class and other utilities.
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
 *
 * The real module exports a Svix class.
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
 *
 * The real module exports a Resend class.
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
 *
 * Block the main SDK to prevent accidental job triggers.
 * Note: Specific trigger tasks are mocked in bun.mocks.ts with controlled behavior.
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
