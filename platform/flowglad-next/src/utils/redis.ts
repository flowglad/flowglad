import { Redis } from '@upstash/redis'
import core from './core'
import { verifyKey } from '@unkey/api'
import { hashData } from './backendCore'
import { z } from 'zod'

const verificationCodeEnum = z.enum([
  'VALID',
  'NOT_FOUND',
  'FORBIDDEN',
  'USAGE_EXCEEDED',
  'RATE_LIMITED',
  'UNAUTHORIZED',
  'DISABLED',
  'INSUFFICIENT_PERMISSIONS',
  'EXPIRED',
])

const errorResponseSchema = z.object({
  result: z.undefined(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    docs: z.string(),
    requestId: z.string(),
  }),
})

const successResponseSchema = z.object({
  result: z.object({
    keyId: z.string().optional(),
    valid: z.boolean(),
    name: z.string().optional(),
    ownerId: z.string().optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
    expires: z.number().optional(),
    ratelimit: z
      .object({
        limit: z.number(),
        remaining: z.number(),
        reset: z.number(),
      })
      .optional(),
    remaining: z.number().optional(),
    code: verificationCodeEnum,
    enabled: z.boolean().optional(),
    permissions: z.array(z.string()).optional(),
    roles: z.array(z.string()).optional(),
    environment: z.string().optional(),
    identity: z
      .object({
        id: z.string(),
        externalId: z.string(),
        meta: z.record(z.string(), z.unknown()),
      })
      .optional(),
    requestId: z.string().optional(),
  }),
  error: z.undefined(),
})

export const apiKeyVerificationResultSchema = z.union([
  errorResponseSchema,
  successResponseSchema,
])

type ApiKeyVerificationResult = z.infer<
  typeof apiKeyVerificationResultSchema
>

const redis = () => {
  return new Redis({
    url: core.envVariable('UPSTASH_REDIS_REST_URL'),
    token: core.envVariable('UPSTASH_REDIS_REST_TOKEN'),
  })
}

enum RedisKeyNamespace {
  ApiKeyVerificationResult = 'apiKeyVerificationResult',
}

const evictionPolicy: Record<
  RedisKeyNamespace,
  Record<string, number>
> = {
  [RedisKeyNamespace.ApiKeyVerificationResult]: {
    max: 100000, // 100,000 items
    ttl: 60 * 60 * 2.4, // 2.4 hours
  },
}

export const setApiKeyVerificationResult = async (
  apiKey: string,
  result: Awaited<ReturnType<typeof verifyKey>>
) => {
  try {
    const redisClient = redis()
    const apiKeyHash = hashData(apiKey)
    await redisClient.set(
      `apiKeyVerificationResult:${apiKeyHash}`,
      JSON.stringify(result),
      {
        ex: evictionPolicy[RedisKeyNamespace.ApiKeyVerificationResult]
          .ttl,
      }
    )
  } catch (error) {
    console.error('Error setting api key verification result', error)
  }
}

export const deleteApiKeyVerificationResult = async ({
  hashText,
}: {
  hashText: string
}) => {
  const redisClient = redis()
  await redisClient.del(
    `${RedisKeyNamespace.ApiKeyVerificationResult}:${hashText}`
  )
}

export const getApiKeyVerificationResult = async (
  apiKey: string
): Promise<ApiKeyVerificationResult | null> => {
  try {
    const redisClient = redis()
    const apiKeyHash = hashData(apiKey)
    const result = await redisClient.get(
      `${RedisKeyNamespace.ApiKeyVerificationResult}:${apiKeyHash}`
    )
    const jsonResult =
      typeof result === 'string' ? JSON.parse(result) : result
    if (!jsonResult) {
      return null
    }
    const parsed =
      apiKeyVerificationResultSchema.safeParse(jsonResult)
    if (!parsed.success) {
      console.error(
        'Error parsing api key verification result',
        parsed.error
      )
      return null
    }
    return parsed.data
  } catch (error) {
    console.error('Error getting api key verification result', error)
    return null
  }
}
