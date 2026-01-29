/**
 * Rate Limiting Utilities and Combinators
 *
 * This module provides Upstash Ratelimit utilities with a combinator-based API
 * for separating rate limiting concerns from business logic.
 *
 * ## Public API
 * - `rateLimited` - Primary combinator for adding rate limiting to functions
 * - `RateLimiters` - Pre-configured rate limiters for common use cases
 * - `createFingerprint` - Helper to create identifier from IP + user agent
 * - `RateLimitExceededError` - Error class for rate limit exceeded
 *
 * @example Simple rate limiting
 * ```ts
 * const doThing = async (userId: string, data: Data) => { ... }
 * const rateLimitedDoThing = rateLimited(
 *   {
 *     name: 'doThing',
 *     limiter: RateLimiters.ai('doThing'),
 *     identifierFn: (userId) => userId,
 *   },
 *   doThing
 * )
 * ```
 */

import { Ratelimit } from '@upstash/ratelimit'
import { createHash } from 'crypto'
import { logger } from './logger'
import { RedisKeyNamespace, redis } from './redis'
import { traced } from './tracing'

// ============================================================================
// Error Class
// ============================================================================

/**
 * Error thrown when a rate limit is exceeded.
 */
export class RateLimitExceededError extends Error {
  constructor(
    public readonly identifier: string,
    public readonly resetAt: Date,
    public readonly limit: number,
    public readonly remaining: number
  ) {
    super(`Rate limit exceeded for ${identifier}`)
    this.name = 'RateLimitExceededError'
  }
}

// ============================================================================
// Types
// ============================================================================

type RateLimiterAlgorithm =
  | ReturnType<typeof Ratelimit.slidingWindow>
  | ReturnType<typeof Ratelimit.fixedWindow>
  | ReturnType<typeof Ratelimit.tokenBucket>

interface RateLimitConfig<TArgs extends unknown[]> {
  /** Unique name for this rate limiter (used in Redis keys and observability) */
  name: string
  /** Rate limiting algorithm configuration */
  limiter: RateLimiterAlgorithm
  /** Extract identifier from function arguments (e.g., userId, IP, sessionId) */
  identifierFn: (...args: TArgs) => string
  /** Whether to fail open (allow request) if Redis is unavailable. Defaults to true. */
  failOpen?: boolean
}

// ============================================================================
// Pre-configured Rate Limiters
// ============================================================================

/**
 * Pre-configured rate limiters for common use cases.
 */
export const RateLimiters = {
  /** 20 requests per minute - suitable for AI/LLM endpoints */
  ai: () => Ratelimit.slidingWindow(20, '1m'),
  /** 100 requests per minute - suitable for general API endpoints */
  standard: () => Ratelimit.slidingWindow(100, '1m'),
  /** 10 requests per minute - suitable for expensive operations */
  strict: () => Ratelimit.slidingWindow(10, '1m'),
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a fingerprint from IP address and user agent.
 *
 * Combining IP with user agent provides better protection against distributed abuse
 * while still being practical. The fingerprint is a hash to normalize the length
 * and avoid exposing raw user agents in Redis keys.
 *
 * @param ip - The client's IP address
 * @param userAgent - The client's user agent string
 * @returns A hashed fingerprint string
 */
export function createFingerprint(
  ip: string,
  userAgent: string
): string {
  const combined = `${ip}:${userAgent}`
  return createHash('sha256')
    .update(combined)
    .digest('hex')
    .slice(0, 32)
}

// ============================================================================
// Rate Limiter Instance Cache
// ============================================================================

/**
 * Cache of Ratelimit instances by name.
 * Each rate limiter name gets its own Upstash Ratelimit instance.
 */
const rateLimiterInstances = new Map<string, Ratelimit>()

/**
 * Get or create a Ratelimit instance for the given configuration.
 */
function getRateLimiter(
  name: string,
  limiter: RateLimiterAlgorithm
): Ratelimit {
  const existing = rateLimiterInstances.get(name)
  if (existing) {
    return existing
  }

  const redisClient = redis()
  const instance = new Ratelimit({
    redis: redisClient,
    limiter,
    prefix: `${RedisKeyNamespace.RateLimit}:${name}`,
  })

  rateLimiterInstances.set(name, instance)
  return instance
}

// ============================================================================
// Core Combinator
// ============================================================================

/**
 * The primary combinator for adding rate limiting to an async function.
 *
 * @param config - Rate limiting configuration
 * @param fn - The function to rate limit
 * @returns A rate-limited version of the function with identical signature
 */
export function rateLimited<TArgs extends unknown[], TResult>(
  config: RateLimitConfig<TArgs>,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  const failOpen = config.failOpen ?? true

  return traced(
    {
      options: (...args: TArgs) => ({
        spanName: `ratelimit.${config.name}`,
        tracerName: 'cache', // Reuse cache tracer since rate limiting uses Redis
        attributes: {
          'ratelimit.name': config.name,
          'ratelimit.identifier': config.identifierFn(...args),
        },
      }),
      extractResultAttributes: () => ({}),
    },
    async (...args: TArgs): Promise<TResult> => {
      const identifier = config.identifierFn(...args)

      try {
        const rateLimiter = getRateLimiter(
          config.name,
          config.limiter
        )
        const result = await rateLimiter.limit(identifier)

        logger.info('rate_limit_check', {
          name: config.name,
          identifier,
          success: result.success,
          limit: result.limit,
          remaining: result.remaining,
          reset: result.reset,
        })

        if (!result.success) {
          throw new RateLimitExceededError(
            identifier,
            new Date(result.reset),
            result.limit,
            result.remaining
          )
        }

        return fn(...args)
      } catch (error) {
        // If it's already a RateLimitExceededError, rethrow it
        if (error instanceof RateLimitExceededError) {
          throw error
        }

        // Handle Redis errors based on failOpen setting
        const errorMessage =
          error instanceof Error ? error.message : String(error)

        if (failOpen) {
          logger.warn('rate_limit_redis_error', {
            name: config.name,
            identifier,
            error: errorMessage,
            failOpen: true,
          })
          // Fail open - allow the request
          return fn(...args)
        } else {
          logger.error('rate_limit_redis_error', {
            name: config.name,
            identifier,
            error: errorMessage,
            failOpen: false,
          })
          throw error
        }
      }
    }
  )
}
