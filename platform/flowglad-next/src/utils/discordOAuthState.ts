import { timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { panic } from '@/errors'
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
  channelId: z.string().min(1),
  createdAt: z.string().datetime(),
})

type CsrfTokenData = z.infer<typeof csrfTokenDataSchema>

/**
 * Build Redis key for CSRF token storage
 */
function buildCsrfTokenKey(token: string): string {
  return `${RedisKeyNamespace.DiscordOAuthCsrfToken}:${token}`
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
 * with the associated user, organization, and channel context.
 */
export async function createDiscordOAuthCsrfToken(params: {
  userId: string
  organizationId: string
  channelId: string
}): Promise<string> {
  const { userId, organizationId, channelId } = params

  const csrfToken = generateRandomBytes(CSRF_TOKEN_BYTES)

  const tokenData: CsrfTokenData = {
    userId,
    organizationId,
    channelId,
    createdAt: new Date().toISOString(),
  }

  const key = buildCsrfTokenKey(csrfToken)

  try {
    const redisClient = redis()
    await redisClient.set(key, JSON.stringify(tokenData), {
      ex: CSRF_TTL_SECONDS,
    })

    logger.info('Discord OAuth CSRF token created', {
      userId,
      organizationId,
      channelId,
      tokenPrefix: csrfToken.substring(0, 4),
    })

    return csrfToken
  } catch (error) {
    logger.error('Failed to store Discord OAuth CSRF token', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      organizationId,
    })
    panic('Unable to initiate Discord OAuth flow')
  }
}

/**
 * Validates and consumes a CSRF token. This is a single-use operation —
 * the token is atomically retrieved and deleted from Redis.
 */
export async function validateAndConsumeDiscordOAuthCsrfToken(params: {
  csrfToken: string
  expectedUserId: string
}): Promise<{ organizationId: string; channelId: string } | null> {
  const { csrfToken, expectedUserId } = params
  const key = buildCsrfTokenKey(csrfToken)

  try {
    const redisClient = redis()

    const rawData = await redisClient.getdel(key)

    if (!rawData) {
      logger.warn(
        'Discord OAuth CSRF token not found or already consumed',
        {
          tokenPrefix: csrfToken.substring(0, 4),
          expectedUserId,
        }
      )
      return null
    }

    const jsonData =
      typeof rawData === 'string' ? JSON.parse(rawData) : rawData
    const parseResult = csrfTokenDataSchema.safeParse(jsonData)

    if (!parseResult.success) {
      logger.warn('Discord OAuth CSRF token data invalid', {
        tokenPrefix: csrfToken.substring(0, 4),
        error: parseResult.error.message,
      })
      return null
    }

    const tokenData = parseResult.data

    if (!safeCompare(tokenData.userId, expectedUserId)) {
      logger.warn('Discord OAuth CSRF token user mismatch', {
        tokenPrefix: csrfToken.substring(0, 4),
        expectedUserId,
      })
      return null
    }

    logger.info('Discord OAuth CSRF token validated', {
      userId: expectedUserId,
      organizationId: tokenData.organizationId,
      channelId: tokenData.channelId,
      tokenPrefix: csrfToken.substring(0, 4),
    })

    return {
      organizationId: tokenData.organizationId,
      channelId: tokenData.channelId,
    }
  } catch (error) {
    logger.error('Error validating Discord OAuth CSRF token', {
      error: error instanceof Error ? error.message : String(error),
      tokenPrefix: csrfToken.substring(0, 4),
    })
    return null
  }
}

/**
 * Encodes a CSRF token for use in the OAuth state parameter.
 */
export function encodeDiscordOAuthState(csrfToken: string): string {
  return Buffer.from(csrfToken, 'utf8').toString('base64')
}

/**
 * Decodes the OAuth state parameter to extract the CSRF token.
 */
export function decodeDiscordOAuthState(state: string): string {
  try {
    const decoded = decodeURIComponent(state)
    return Buffer.from(decoded, 'base64').toString('utf8')
  } catch {
    panic('Invalid OAuth state parameter')
  }
}
