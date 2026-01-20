import { Redis } from '@upstash/redis'
import { describe } from 'vitest'

/**
 * Redis integration test helpers.
 *
 * These helpers are designed for integration tests that make real calls
 * to Redis (Upstash). They should NOT be used with mocks.
 */

/**
 * Gets the Redis connection details from environment variables.
 * Returns undefined if not set.
 */
export const getRedisConnectionDetails = ():
  | { url: string; token: string }
  | undefined => {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    return undefined
  }

  return { url, token }
}

/**
 * Creates a Redis client for integration tests.
 * Throws if connection details are not set.
 */
export const getRedisTestClient = (): Redis => {
  const connection = getRedisConnectionDetails()
  if (!connection) {
    throw new Error(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for Redis integration tests.'
    )
  }
  return new Redis({
    url: connection.url,
    token: connection.token,
  })
}

/**
 * Creates a describe block that only runs if Redis credentials are available.
 * Use this to wrap integration test suites that require Redis access.
 *
 * @example
 * ```ts
 * describeIfRedisKey('Cache Integration Tests', () => {
 *   it('should cache and retrieve data', async () => {
 *     // test code...
 *   })
 * })
 * ```
 */
export const describeIfRedisKey = (
  name: string,
  fn: () => void
): void => {
  const hasConnection = !!getRedisConnectionDetails()
  if (hasConnection) {
    describe(name, fn)
  } else {
    describe.skip(name, fn)
  }
}

/**
 * Generates a unique test key prefix to avoid collisions between test runs.
 * Use this to namespace all keys created during a test.
 */
export const generateTestKeyPrefix = (): string => {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Cleans up Redis keys created during tests.
 *
 * @param client - Redis client
 * @param keys - Array of explicit keys to delete
 */
export const cleanupRedisTestKeys = async (
  client: Redis,
  keys: string[]
): Promise<void> => {
  if (keys.length === 0) return

  try {
    await client.del(...(keys as [string, ...string[]]))
  } catch {
    // Ignore errors - keys may already be cleaned up
  }
}

/**
 * Generic polling helper for Redis cache keys.
 * Polls until the condition is met or timeout elapses.
 */
async function pollCacheKey<T>(
  client: Redis,
  cacheKey: string,
  options: {
    timeoutMs?: number
    intervalMs?: number
    condition: (value: unknown) => boolean
    onSuccess: (value: unknown) => T
    timeoutMessage: string
    errorMessage: string
  }
): Promise<T> {
  const { timeoutMs = 5000, intervalMs = 50 } = options
  const startTime = Date.now()

  return new Promise<T>((resolve, reject) => {
    const checkCache = async () => {
      try {
        const value = await client.get(cacheKey)
        if (options.condition(value)) {
          return resolve(options.onSuccess(value))
        }

        if (Date.now() - startTime >= timeoutMs) {
          return reject(new Error(options.timeoutMessage))
        }

        setTimeout(checkCache, intervalMs)
      } catch (error) {
        return reject(
          new Error(
            `${options.errorMessage}: ${error instanceof Error ? error.message : String(error)}`
          )
        )
      }
    }

    checkCache()
  })
}

/**
 * Poll Redis for a cache key until it is populated or timeout is reached.
 * Returns the cached value when found, or throws if timeout elapses.
 */
export async function waitForCachePopulation<T>(
  client: Redis,
  cacheKey: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<T> {
  return pollCacheKey(client, cacheKey, {
    ...options,
    condition: (value) => value !== null,
    onSuccess: (value) => value as T,
    timeoutMessage: `Timeout waiting for cache key "${cacheKey}" to be populated after ${options.timeoutMs ?? 5000}ms`,
    errorMessage: `Redis error while waiting for cache key "${cacheKey}" to be populated`,
  })
}

/**
 * Poll Redis until a cache key is invalidated (null) or timeout is reached.
 * Throws if the key is still present after timeout elapses.
 */
export async function waitForCacheInvalidation(
  client: Redis,
  cacheKey: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  return pollCacheKey(client, cacheKey, {
    ...options,
    condition: (value) => value === null,
    onSuccess: () => undefined,
    timeoutMessage: `Timeout waiting for cache key "${cacheKey}" to be invalidated after ${options.timeoutMs ?? 5000}ms`,
    errorMessage: `Redis error while waiting for cache key "${cacheKey}" to be invalidated`,
  })
}
