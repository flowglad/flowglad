import { createHmac, randomBytes } from 'crypto'

/**
 * Header name for Flowglad webhook signatures.
 * Format: t=<timestamp>,v1=<signature>
 */
export const SIGNATURE_HEADER = 'X-Flowglad-Signature'

/**
 * Default tolerance for timestamp validation (5 minutes in seconds).
 * Webhooks older than this are rejected to prevent replay attacks.
 */
export const DEFAULT_TOLERANCE_SECONDS = 300

/**
 * Generate a new webhook signing secret.
 * Returns a 32-byte hex string (64 characters).
 */
export const generateSigningSecret = (): string => {
  return randomBytes(32).toString('hex')
}

/**
 * Compute HMAC-SHA256 signature for webhook payload.
 *
 * The signed payload is: `${timestamp}.${payload}`
 * This prevents replay attacks by binding the signature to a specific time.
 *
 * @param payload - The JSON payload string to sign
 * @param secret - The signing secret (hex string)
 * @param timestamp - Unix timestamp in seconds
 * @returns Hex-encoded HMAC-SHA256 signature
 */
export const computeSignature = (
  payload: string,
  secret: string,
  timestamp: number
): string => {
  const signedPayload = `${timestamp}.${payload}`
  return createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex')
}

/**
 * Generate the full signature header value.
 *
 * Format: t=<timestamp>,v1=<signature>
 * - t: Unix timestamp when signature was generated
 * - v1: HMAC-SHA256 signature (versioned for future algorithm changes)
 *
 * @param payload - The JSON payload string to sign
 * @param secret - The signing secret (hex string)
 * @param timestamp - Optional Unix timestamp (defaults to current time)
 * @returns The complete signature header value
 */
export const generateSignatureHeader = (
  payload: string,
  secret: string,
  timestamp?: number
): string => {
  const ts = timestamp ?? Math.floor(Date.now() / 1000)
  const signature = computeSignature(payload, secret, ts)
  return `t=${ts},v1=${signature}`
}

/**
 * Parse the signature header into its components.
 *
 * @param header - The signature header value (t=...,v1=...)
 * @returns Parsed timestamp and signature, or null if invalid format
 */
export const parseSignatureHeader = (
  header: string
): { timestamp: number; signature: string } | null => {
  if (!header) {
    return null
  }

  const parts = header.split(',')
  let timestamp: number | null = null
  let signature: string | null = null

  for (const part of parts) {
    const [rawKey, rawValue] = part.split('=')
    // Trim whitespace to handle headers with spaces (e.g., "t=..., v1=...")
    const key = rawKey?.trim()
    const value = rawValue?.trim()
    if (key === 't' && value) {
      const parsed = parseInt(value, 10)
      if (!isNaN(parsed)) {
        timestamp = parsed
      }
    } else if (key === 'v1' && value) {
      signature = value
    }
  }

  if (timestamp === null || signature === null) {
    return null
  }

  return { timestamp, signature }
}

/**
 * Verify a webhook signature.
 *
 * This function:
 * 1. Parses the signature header to extract timestamp and signature
 * 2. Validates the timestamp is within tolerance window
 * 3. Recomputes the expected signature and compares
 *
 * @param payload - The raw JSON payload string (must match exactly what was signed)
 * @param signatureHeader - The X-Flowglad-Signature header value
 * @param secret - The signing secret
 * @param toleranceSeconds - Maximum age of webhook in seconds (default: 300)
 * @returns true if signature is valid and timestamp is within tolerance
 */
export const verifyWebhookSignature = (
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS
): boolean => {
  const parsed = parseSignatureHeader(signatureHeader)
  if (!parsed) {
    return false
  }

  const { timestamp, signature } = parsed

  // Check timestamp tolerance to prevent replay attacks
  const now = Math.floor(Date.now() / 1000)
  const age = now - timestamp
  if (age > toleranceSeconds || age < -toleranceSeconds) {
    return false
  }

  // Compute expected signature and compare
  const expectedSignature = computeSignature(
    payload,
    secret,
    timestamp
  )

  // Use timing-safe comparison to prevent timing attacks
  return timingSafeEqual(signature, expectedSignature)
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 *
 * Uses constant-time comparison by checking all characters regardless
 * of where the first difference occurs.
 */
const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
