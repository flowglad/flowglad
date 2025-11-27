import crypto from 'crypto'

/**
 * Default timestamp tolerance in seconds (5 minutes).
 * Webhooks older than this will be rejected.
 */
const DEFAULT_TIMESTAMP_TOLERANCE_SECONDS = 300

/**
 * Maximum allowed future timestamp offset in seconds (60 seconds).
 * Webhooks with timestamps further in the future will be rejected to prevent clock skew attacks.
 */
const MAX_FUTURE_TIMESTAMP_OFFSET_SECONDS = 60

/**
 * Error thrown when webhook verification fails.
 */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebhookVerificationError'
  }
}

/**
 * Extract a header value from headers object, handling case-insensitive lookup
 * and array values (takes first element if array).
 *
 * @param headers - Request headers object
 * @param name - Header name (case-insensitive)
 * @returns Header value as string, or throws WebhookVerificationError if missing
 */
function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string {
  const lowerName = name.toLowerCase()
  const value = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === lowerName
  )?.[1]

  if (!value) {
    throw new WebhookVerificationError(
      `Missing required header: ${name}`
    )
  }

  // Handle array values (take first element)
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new WebhookVerificationError(
        `Missing required header: ${name}`
      )
    }
    return value[0]
  }

  return value
}

/**
 * Verify a webhook payload and headers.
 *
 * @param payload - The raw request body as a string or Buffer.
 *                  CRITICAL: Must be the raw, unparsed body.
 * @param headers - The request headers object. The function will extract
 *                  svix-id, svix-timestamp, and svix-signature automatically.
 * @param secret - The webhook signing secret (format: whsec_<base64-key>)
 * @param timestampToleranceSeconds - Maximum age of webhook in seconds before it's considered invalid.
 *                                    - If not provided (undefined): Uses default of 300 seconds (5 minutes)
 *                                    - If a number is provided: Uses that value in seconds
 *                                    - If null is provided: Disables timestamp validation entirely
 * @returns The verified and parsed payload (JSON object). Returns `unknown` type
 *          - caller should validate/type the result based on expected webhook event type
 * @throws WebhookVerificationError if verification fails
 */
export function verifyWebhook(
  payload: string | Buffer,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
  timestampToleranceSeconds?: number | null
): unknown {
  // Extract required headers
  const id = getHeader(headers, 'svix-id')
  const timestamp = getHeader(headers, 'svix-timestamp')
  const signatureHeader = getHeader(headers, 'svix-signature')

  // Validate timestamp if not explicitly disabled
  if (timestampToleranceSeconds !== null) {
    const webhookTime = parseInt(timestamp, 10)
    if (isNaN(webhookTime)) {
      throw new WebhookVerificationError(
        `Invalid timestamp format. Expected numeric timestamp, got: ${timestamp}`
      )
    }

    const currentTime = Math.floor(Date.now() / 1000)
    const age = currentTime - webhookTime

    // Use default if not specified
    const toleranceSeconds =
      timestampToleranceSeconds ?? DEFAULT_TIMESTAMP_TOLERANCE_SECONDS

    if (age > toleranceSeconds) {
      throw new WebhookVerificationError(
        `Webhook timestamp is too old. Age: ${age}s, tolerance: ${toleranceSeconds}s`
      )
    }

    // Reject if timestamp is too far in future (clock skew protection)
    const futureOffset = webhookTime - currentTime
    if (
      webhookTime >
      currentTime + MAX_FUTURE_TIMESTAMP_OFFSET_SECONDS
    ) {
      throw new WebhookVerificationError(
        `Webhook timestamp is too far in the future. Offset: ${futureOffset}s, max allowed: ${MAX_FUTURE_TIMESTAMP_OFFSET_SECONDS}s. Possible clock skew.`
      )
    }
  }

  // Validate secret format
  if (!secret.startsWith('whsec_')) {
    throw new WebhookVerificationError(
      'Invalid secret format. Must start with whsec_'
    )
  }

  // Extract secret key (strip whsec_ prefix and base64 decode)
  let secretKey: Buffer
  try {
    const secretBase64 = secret.split('_')[1]
    if (!secretBase64) {
      throw new WebhookVerificationError(
        'Invalid secret format. Secret must include base64-encoded key after whsec_ prefix'
      )
    }

    // Validate base64 format (only contains valid base64 characters)
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(secretBase64)) {
      throw new WebhookVerificationError(
        'Invalid secret format. Secret must be base64 encoded'
      )
    }

    secretKey = Buffer.from(secretBase64, 'base64')

    // Verify that the base64 was valid by checking if re-encoding matches
    // (Buffer.from with 'base64' doesn't throw for invalid base64, so we need to validate)
    if (secretKey.toString('base64') !== secretBase64) {
      throw new WebhookVerificationError(
        'Invalid secret format. Secret must be base64 encoded'
      )
    }
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      throw error
    }
    throw new WebhookVerificationError(
      'Invalid secret format. Secret must be base64 encoded'
    )
  }

  // Convert payload to string if Buffer
  const payloadString =
    typeof payload === 'string' ? payload : payload.toString('utf8')

  // Construct signed content: id.timestamp.body
  const signedContent = `${id}.${timestamp}.${payloadString}`

  // Compute expected signature
  const expected = crypto
    .createHmac('sha256', secretKey)
    .update(signedContent)
    .digest('base64')

  // Handle multiple signatures (space-delimited, e.g., "v1,sig1 v1,sig2")
  // Accept if ANY signature matches (supports secret rotation)
  const signatures = signatureHeader.trim().split(/\s+/)
  let isValid = false

  for (const signature of signatures) {
    // Extract version and signature from "v1,<base64-sig>" format
    const [version, sig] = signature.split(',')
    if (version !== 'v1' || !sig) {
      continue // Skip invalid format, try next signature
    }

    try {
      const sigBuffer = Buffer.from(sig, 'base64')
      const expectedBuffer = Buffer.from(expected, 'base64')

      // Use timing-safe comparison
      if (
        sigBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(sigBuffer, expectedBuffer)
      ) {
        isValid = true
        break
      }
    } catch (error) {}
  }

  if (!isValid) {
    const signatureCount = signatures.length
    throw new WebhookVerificationError(
      `Invalid signature. None of the ${signatureCount} provided signature${signatureCount === 1 ? '' : 's'} matched the expected signature`
    )
  }

  // Parse and return payload
  try {
    return JSON.parse(payloadString)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown parsing error'
    throw new WebhookVerificationError(
      `Invalid JSON payload. Failed to parse: ${errorMessage}`
    )
  }
}
