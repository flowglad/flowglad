import { z } from 'zod'
import { logger } from '@/utils/logger'
import {
  generateSignatureHeader,
  SIGNATURE_HEADER,
} from '@/utils/webhookSignature'

/**
 * Webhook payload sent to merchant endpoints.
 * This is a lightweight notification - NOT the full event data.
 * Merchants read from the stream to get actual events.
 */
export const syncWebhookPayloadSchema = z.object({
  /** Scope identifier (matches API key scope) */
  scopeId: z.string().min(1),
  /** Latest sequence ID in the stream (Redis Stream ID format) */
  latestSequence: z.string().min(1),
  /** ISO timestamp when notification was generated */
  timestamp: z.string().datetime(),
  /** Number of events waiting in the stream since last read */
  eventCount: z.number().int().nonnegative(),
})

export type SyncWebhookPayload = z.infer<
  typeof syncWebhookPayloadSchema
>

/**
 * Configuration for webhook delivery.
 */
export interface WebhookConfig {
  /** The merchant's webhook endpoint URL */
  url: string
  /** The signing secret for this endpoint */
  secret: string
}

/**
 * Result of a webhook delivery attempt.
 */
export interface WebhookDeliveryResult {
  /** Whether the webhook was delivered successfully */
  success: boolean
  /** HTTP status code from the endpoint (if available) */
  statusCode?: number
  /** Number of retry attempts made */
  attempts: number
  /** Error message if delivery failed */
  error?: string
}

/**
 * Retry configuration with exponential backoff.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 5) */
  maxRetries?: number
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number
  /** Maximum delay in milliseconds (default: 16000) */
  maxDelayMs?: number
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 16000,
}

/**
 * Calculate delay for exponential backoff.
 * Delay pattern: 1s -> 2s -> 4s -> 8s -> 16s
 */
const calculateBackoffDelay = (
  attempt: number,
  config: Required<RetryConfig>
): number => {
  const delay = config.initialDelayMs * Math.pow(2, attempt)
  return Math.min(delay, config.maxDelayMs)
}

/**
 * Determine if an HTTP status code indicates a client error that should not be retried.
 * 4xx errors (except 408 Request Timeout and 429 Too Many Requests) are client errors.
 */
const isClientError = (statusCode: number): boolean => {
  return (
    statusCode >= 400 &&
    statusCode < 500 &&
    statusCode !== 408 &&
    statusCode !== 429
  )
}

/**
 * Determine if an error is transient and worth retrying.
 */
const isTransientError = (
  error: unknown,
  statusCode?: number
): boolean => {
  // Don't retry client errors (4xx, except 408 and 429)
  if (statusCode !== undefined && isClientError(statusCode)) {
    return false
  }

  // Retry server errors (5xx)
  if (statusCode !== undefined && statusCode >= 500) {
    return true
  }

  // Retry timeout errors
  if (statusCode === 408 || statusCode === 429) {
    return true
  }

  // Retry network errors (expanded to include fetch failures)
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    // Check for known network-related error messages
    const isNetworkError =
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('socket') ||
      message.includes('failed to fetch') ||
      message.includes('fetch failed') ||
      message.includes('abort')

    // Default to retrying unknown errors - better to retry unnecessarily
    // than to give up on a transient issue
    return isNetworkError || !isKnownNonRetryableError(message)
  }

  // Default: retry on unknown errors
  return true
}

/**
 * Check if an error message indicates a known non-retryable error.
 * These are errors that will definitely fail on retry.
 */
const isKnownNonRetryableError = (message: string): boolean => {
  return (
    message.includes('invalid url') ||
    message.includes('invalid protocol') ||
    message.includes('unsupported protocol')
  )
}

/**
 * Sleep for the specified duration.
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Send a single webhook request.
 * Returns the response or throws on network error.
 */
const sendWebhookRequest = async (
  url: string,
  payload: string,
  signatureHeader: string
): Promise<Response> => {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [SIGNATURE_HEADER]: signatureHeader,
    },
    body: payload,
  })
}

/**
 * Push a sync notification webhook to the merchant's endpoint.
 *
 * This function:
 * 1. Signs the payload with HMAC-SHA256
 * 2. Sends POST request with signature header
 * 3. Retries with exponential backoff on transient failures
 * 4. Does NOT retry on 4xx client errors (indicates config issue)
 *
 * @param config - Webhook endpoint URL and signing secret
 * @param payload - The notification payload to send
 * @param retryConfig - Optional retry configuration
 * @returns Delivery result indicating success/failure
 */
export const pushSyncNotification = async (
  config: WebhookConfig,
  payload: SyncWebhookPayload,
  retryConfig?: RetryConfig
): Promise<WebhookDeliveryResult> => {
  const { url, secret } = config
  const retry: Required<RetryConfig> = {
    ...DEFAULT_RETRY_CONFIG,
    ...retryConfig,
  }

  // Validate payload
  const validatedPayload = syncWebhookPayloadSchema.parse(payload)
  const payloadString = JSON.stringify(validatedPayload)

  // Generate signature header
  const signatureHeader = generateSignatureHeader(
    payloadString,
    secret
  )

  let lastError: Error | undefined
  let lastStatusCode: number | undefined

  for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
    try {
      // Apply backoff delay for retries (not first attempt)
      if (attempt > 0) {
        const delay = calculateBackoffDelay(attempt - 1, retry)
        await sleep(delay)

        logger.debug('Retrying webhook delivery', {
          url,
          scopeId: payload.scopeId,
          attempt: attempt + 1,
          maxAttempts: retry.maxRetries + 1,
          delayMs: delay,
        })
      }

      const response = await sendWebhookRequest(
        url,
        payloadString,
        signatureHeader
      )
      lastStatusCode = response.status

      // Success: 2xx status codes
      if (response.ok) {
        logger.info('Webhook delivered successfully', {
          url,
          scopeId: payload.scopeId,
          statusCode: response.status,
          attempts: attempt + 1,
        })

        return {
          success: true,
          statusCode: response.status,
          attempts: attempt + 1,
        }
      }

      // Client error: don't retry
      if (isClientError(response.status)) {
        const responseText = await response
          .text()
          .catch(() => 'Unknown error')
        logger.warn(
          'Webhook delivery failed with client error (not retrying)',
          {
            url,
            scopeId: payload.scopeId,
            statusCode: response.status,
            response: responseText.slice(0, 200),
            attempts: attempt + 1,
          }
        )

        return {
          success: false,
          statusCode: response.status,
          attempts: attempt + 1,
          error: `Client error: ${response.status} ${response.statusText}`,
        }
      }

      // Server error or retryable status: continue to retry
      lastError = new Error(
        `HTTP ${response.status}: ${response.statusText}`
      )
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(String(error))
      lastStatusCode = undefined

      // Check if we should retry this error
      if (!isTransientError(error, lastStatusCode)) {
        logger.warn(
          'Webhook delivery failed with non-transient error',
          {
            url,
            scopeId: payload.scopeId,
            error: lastError.message,
            attempts: attempt + 1,
          }
        )

        return {
          success: false,
          attempts: attempt + 1,
          error: lastError.message,
        }
      }
    }
  }

  // All retries exhausted
  logger.error('Webhook delivery failed after max retries', {
    url,
    scopeId: payload.scopeId,
    error: lastError?.message,
    statusCode: lastStatusCode,
    attempts: retry.maxRetries + 1,
  })

  return {
    success: false,
    statusCode: lastStatusCode,
    attempts: retry.maxRetries + 1,
    error: lastError?.message ?? 'Max retries exceeded',
  }
}

/**
 * Validate that a URL is acceptable for webhook registration.
 *
 * Rules:
 * - HTTPS required in production
 * - localhost/127.0.0.1 allowed in development
 * - Must be a valid URL
 */
export const validateWebhookUrl = (
  url: string,
  isProduction: boolean
): { valid: boolean; error?: string } => {
  try {
    const parsed = new URL(url)

    // Check protocol
    const isLocalhost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1'

    if (isProduction) {
      if (parsed.protocol !== 'https:') {
        return {
          valid: false,
          error: 'Webhook URL must use HTTPS in production',
        }
      }
      if (isLocalhost) {
        return {
          valid: false,
          error: 'Localhost URLs are not allowed in production',
        }
      }
    } else {
      // Development: allow HTTP for localhost only
      if (parsed.protocol !== 'https:' && !isLocalhost) {
        return {
          valid: false,
          error: 'Non-localhost URLs must use HTTPS',
        }
      }
    }

    return { valid: true }
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format',
    }
  }
}

/**
 * Create a webhook payload from stream info.
 */
export const createSyncWebhookPayload = (params: {
  scopeId: string
  latestSequence: string
  eventCount: number
}): SyncWebhookPayload => {
  return {
    scopeId: params.scopeId,
    latestSequence: params.latestSequence,
    timestamp: new Date().toISOString(),
    eventCount: params.eventCount,
  }
}
