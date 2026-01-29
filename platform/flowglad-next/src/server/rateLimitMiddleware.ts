/**
 * tRPC Rate Limiting Middleware
 *
 * Provides rate limiting middleware for tRPC procedures using Upstash Ratelimit.
 *
 * ## Public API
 * - `createRateLimitMiddleware` - Factory to create rate limit middleware with custom config
 * - `rateLimitByFingerprint` - Pre-built middleware using IP + user agent fingerprint
 *
 * @example Custom identifier
 * ```ts
 * const rateLimitByUserId = createRateLimitMiddleware({
 *   name: 'userActions',
 *   limiter: RateLimiters.standard(),
 *   getIdentifier: (ctx) => ctx.user?.id ?? 'anonymous',
 * })
 *
 * export const myProcedure = protectedProcedure
 *   .use(rateLimitByUserId)
 *   .mutation(...)
 * ```
 *
 * @example Fingerprint-based for public endpoints
 * ```ts
 * export const publicMutation = publicProcedure
 *   .use(rateLimitByFingerprint('supportChat', RateLimiters.ai()))
 *   .mutation(...)
 * ```
 */

import { TRPCError } from '@trpc/server'
import { Ratelimit } from '@upstash/ratelimit'
import { logger } from '@/utils/logger'
import {
  createFingerprint,
  RateLimitExceededError,
  RateLimiters,
} from '@/utils/ratelimit'
import { RedisKeyNamespace, redis } from '@/utils/redis'
import { t } from './coreTrpcObject'
import type { TRPCApiContext, TRPCContext } from './trpcContext'

// ============================================================================
// Types
// ============================================================================

type RateLimiterAlgorithm =
  | ReturnType<typeof Ratelimit.slidingWindow>
  | ReturnType<typeof Ratelimit.fixedWindow>
  | ReturnType<typeof Ratelimit.tokenBucket>

type AnyContext = TRPCContext | TRPCApiContext

interface RateLimitMiddlewareConfig {
  /** Unique name for this rate limiter (used in Redis keys and observability) */
  name: string
  /** Rate limiter algorithm configuration */
  limiter: RateLimiterAlgorithm
  /** Extract identifier from tRPC context (e.g., user ID, IP address) */
  getIdentifier: (ctx: AnyContext) => string
  /** Custom error message. Defaults to "Too many requests" */
  message?: string
  /** Whether to fail open (allow request) if Redis is unavailable. Defaults to true. */
  failOpen?: boolean
}

// ============================================================================
// Rate Limiter Instance Cache
// ============================================================================

const rateLimiterInstances = new Map<string, Ratelimit>()

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
// Middleware Factory
// ============================================================================

/**
 * Factory function to create rate limit middleware for tRPC procedures.
 *
 * @param config - Rate limiting configuration
 * @returns tRPC middleware function
 */
export function createRateLimitMiddleware(
  config: RateLimitMiddlewareConfig
) {
  const failOpen = config.failOpen ?? true
  const errorMessage = config.message ?? 'Too many requests'

  return t.middleware(async ({ ctx, next }) => {
    const identifier = config.getIdentifier(ctx as AnyContext)

    try {
      const rateLimiter = getRateLimiter(config.name, config.limiter)
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
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: errorMessage,
          cause: new RateLimitExceededError(
            identifier,
            new Date(result.reset),
            result.limit,
            result.remaining
          ),
        })
      }

      return next({ ctx })
    } catch (error) {
      // If it's already a TRPCError, rethrow it
      if (error instanceof TRPCError) {
        throw error
      }

      // Handle Redis errors based on failOpen setting
      const errorMsg =
        error instanceof Error ? error.message : String(error)

      if (failOpen) {
        logger.warn('rate_limit_redis_error', {
          name: config.name,
          identifier,
          error: errorMsg,
          failOpen: true,
        })
        // Fail open - allow the request
        return next({ ctx })
      } else {
        logger.error('rate_limit_redis_error', {
          name: config.name,
          identifier,
          error: errorMsg,
          failOpen: false,
        })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Rate limiting service unavailable',
          cause: error,
        })
      }
    }
  })
}

// ============================================================================
// Pre-built Middleware
// ============================================================================

/**
 * Create rate limit middleware that identifies clients by IP + user agent fingerprint.
 *
 * This is ideal for public endpoints where users are not authenticated.
 * The fingerprint combines IP and user agent to provide reasonable protection
 * against simple abuse while not being overly restrictive for legitimate users
 * behind shared IPs.
 *
 * @param name - Unique name for this rate limiter
 * @param limiter - Rate limiting algorithm (e.g., RateLimiters.ai())
 * @returns tRPC middleware function
 */
export function rateLimitByFingerprint(
  name: string,
  limiter: RateLimiterAlgorithm
) {
  return createRateLimitMiddleware({
    name,
    limiter,
    getIdentifier: (ctx) => {
      const clientIp = ctx.clientIp ?? 'unknown'
      const userAgent = ctx.userAgent ?? 'unknown'
      return createFingerprint(clientIp, userAgent)
    },
  })
}

// Re-export RateLimiters for convenience
export { RateLimiters }
