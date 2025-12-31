import { timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { generateRandomBytes } from './backendCore'
import { logger } from './logger'
import { RedisKeyNamespace, redis } from './redis'

/**
 * CSRF token length in bytes (32 bytes = 256 bits of entropy)
 */
const CSRF_TOKEN_BYTES = 32

/**
 * TTL for CSRF tokens in seconds (15 minutes)
 */
const CSRF_TTL_SECONDS = 60 * 15

/**
 * Schema for CSRF token data stored in Redis
 */
const csrfTokenDataSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  createdAt: z.string().datetime(),
})

type CsrfTokenData = z.infer<typeof csrfTokenDataSchema>

/**
 * Build Redis key for CSRF token storage
 */
function buildCsrfTokenKey(token: string): string {
  return `${RedisKeyNamespace.StripeOAuthCsrfToken}:${token}`
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) {
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

/**
 * Creates a cryptographically random CSRF token and stores it in Redis
 * with the associated user and organization context.
 *
 * @param params - User and organization identifiers to bind to the token
 * @returns The generated CSRF token
 * @throws Error if Redis storage fails
 */
export async function createStripeOAuthCsrfToken(params: {
  userId: string
  organizationId: string
}): Promise<string> {
  const { userId, organizationId } = params

  // Generate cryptographically random token
  const csrfToken = generateRandomBytes(CSRF_TOKEN_BYTES)

  const tokenData: CsrfTokenData = {
    userId,
    organizationId,
    createdAt: new Date().toISOString(),
  }

  const key = buildCsrfTokenKey(csrfToken)

  try {
    const redisClient = redis()
    await redisClient.set(key, JSON.stringify(tokenData), {
      ex: CSRF_TTL_SECONDS,
    })

    logger.info('Stripe OAuth CSRF token created', {
      userId,
      organizationId,
      tokenPrefix: csrfToken.substring(0, 4),
    })

    return csrfToken
  } catch (error) {
    logger.error('Failed to store Stripe OAuth CSRF token', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      organizationId,
    })
    throw new Error('Unable to initiate Stripe OAuth flow')
  }
}

/**
 * Validates and consumes a CSRF token. This is a single-use operation -
 * the token is atomically retrieved and deleted from Redis.
 *
 * Uses Redis GETDEL command for atomic get-and-delete to prevent race conditions
 * where two concurrent requests could both read the same token before deletion.
 *
 * @param params - Token and expected user ID for validation
 * @returns Organization ID if valid, null if invalid/expired/already used
 */
export async function validateAndConsumeStripeOAuthCsrfToken(params: {
  csrfToken: string
  expectedUserId: string
}): Promise<{ organizationId: string } | null> {
  const { csrfToken, expectedUserId } = params
  const key = buildCsrfTokenKey(csrfToken)

  try {
    const redisClient = redis()

    // Atomic get-and-delete using Redis GETDEL command (Redis 6.2+)
    // This prevents race conditions where concurrent callbacks could
    // both read the token before either deletes it
    const rawData = await redisClient.getdel(key)

    if (!rawData) {
      logger.warn(
        'Stripe OAuth CSRF token not found or already consumed',
        {
          tokenPrefix: csrfToken.substring(0, 4),
          expectedUserId,
        }
      )
      return null
    }

    // Parse stored data
    const jsonData =
      typeof rawData === 'string' ? JSON.parse(rawData) : rawData
    const parseResult = csrfTokenDataSchema.safeParse(jsonData)

    if (!parseResult.success) {
      logger.warn('Stripe OAuth CSRF token data invalid', {
        tokenPrefix: csrfToken.substring(0, 4),
        error: parseResult.error.message,
      })
      return null
    }

    const tokenData = parseResult.data

    // Verify user binding with timing-safe comparison
    if (!safeCompare(tokenData.userId, expectedUserId)) {
      logger.warn('Stripe OAuth CSRF token user mismatch', {
        tokenPrefix: csrfToken.substring(0, 4),
        expectedUserId,
        // Don't log actual stored userId for security
      })
      return null
    }

    logger.info('Stripe OAuth CSRF token validated', {
      userId: expectedUserId,
      organizationId: tokenData.organizationId,
      tokenPrefix: csrfToken.substring(0, 4),
    })

    return { organizationId: tokenData.organizationId }
  } catch (error) {
    logger.error('Error validating Stripe OAuth CSRF token', {
      error: error instanceof Error ? error.message : String(error),
      tokenPrefix: csrfToken.substring(0, 4),
    })
    return null
  }
}

/**
 * Encodes a CSRF token for use in the OAuth state parameter.
 * Uses base64 encoding for URL safety.
 *
 * @param csrfToken - The raw CSRF token
 * @returns Base64-encoded state string
 */
export function encodeStripeOAuthState(csrfToken: string): string {
  return Buffer.from(csrfToken, 'utf8').toString('base64')
}

/**
 * Decodes the OAuth state parameter to extract the CSRF token.
 *
 * @param state - The URL-decoded state parameter
 * @returns The raw CSRF token
 * @throws Error if decoding fails
 */
export function decodeStripeOAuthState(state: string): string {
  try {
    // Handle URL encoding that may have been applied
    const decoded = decodeURIComponent(state)
    return Buffer.from(decoded, 'base64').toString('utf8')
  } catch {
    throw new Error('Invalid OAuth state parameter')
  }
}
