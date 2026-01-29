import { trace } from '@opentelemetry/api'
import { logger } from './logger'

interface SecurityEvent {
  type:
    | 'failed_auth'
    | 'expired_key'
    | 'rate_limit'
    | 'suspicious_pattern'
  organizationId?: string
  apiKeyPrefix?: string
  /**
   * Pricing model ID for PM-scoped access tracking.
   * Present when the API key has pricing model context.
   */
  pricingModelId?: string
  clientIp?: string
  details?: Record<string, any>
}

// Track failed auth attempts per IP/key prefix
const failedAuthAttempts = new Map<
  string,
  { count: number; lastAttempt: Date }
>()
const FAILED_AUTH_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const SUSPICIOUS_FAILED_AUTH_THRESHOLD = 5

export function trackSecurityEvent(event: SecurityEvent) {
  const span = trace.getActiveSpan()

  // Log the security event
  logger.warn('Security Event', {
    event_type: event.type,
    organization_id: event.organizationId,
    api_key_prefix: event.apiKeyPrefix,
    pricing_model_id: event.pricingModelId,
    client_ip_hash: event.clientIp
      ? hashIp(event.clientIp)
      : undefined,
    details: event.details,
  })

  // Add to span if available
  if (span) {
    span.addEvent(`security.${event.type}`, {
      'security.event_type': event.type,
      'security.organization_id': event.organizationId || 'unknown',
      'security.pricing_model_id': event.pricingModelId || 'unknown',
      'security.details': JSON.stringify(event.details || {}),
    })

    // Track in span attributes
    span.setAttributes({
      [`security.${event.type}`]: true,
      'security.event_occurred': true,
    })
  }

  // Track failed auth attempts for suspicious pattern detection
  if (event.type === 'failed_auth' && event.apiKeyPrefix) {
    trackFailedAuth(event.apiKeyPrefix)
  }
}

export function trackFailedAuth(keyPrefix: string): boolean {
  const now = new Date()
  const existing = failedAuthAttempts.get(keyPrefix)

  if (existing) {
    // Check if within window
    if (
      now.getTime() - existing.lastAttempt.getTime() <
      FAILED_AUTH_WINDOW_MS
    ) {
      existing.count++
      existing.lastAttempt = now

      // Check if suspicious
      if (existing.count >= SUSPICIOUS_FAILED_AUTH_THRESHOLD) {
        trackSecurityEvent({
          type: 'suspicious_pattern',
          apiKeyPrefix: keyPrefix,
          details: {
            failed_attempts: existing.count,
            window_minutes: FAILED_AUTH_WINDOW_MS / 60000,
            pattern: 'multiple_failed_auth_attempts',
          },
        })

        // Reset counter after alerting
        failedAuthAttempts.delete(keyPrefix)
        return true // Suspicious activity detected
      }
    } else {
      // Reset if outside window
      existing.count = 1
      existing.lastAttempt = now
    }
  } else {
    // First attempt
    failedAuthAttempts.set(keyPrefix, { count: 1, lastAttempt: now })
  }

  return false
}

export function checkForExpiredKeyUsage(
  expiresAt?: number | Date
): boolean {
  if (!expiresAt) return false

  const expiryTime =
    typeof expiresAt === 'number' ? expiresAt : expiresAt.getTime()
  const isExpired = Date.now() > expiryTime

  if (isExpired) {
    trackSecurityEvent({
      type: 'expired_key',
      details: {
        expired_at: new Date(expiryTime).toISOString(),
        expired_ago_ms: Date.now() - expiryTime,
      },
    })
  }

  return isExpired
}

// Simple IP hashing for privacy
function hashIp(ip: string): string {
  // Simple hash for privacy - in production, use proper hashing
  return Buffer.from(ip).toString('base64').substring(0, 8)
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of failedAuthAttempts.entries()) {
    if (now - value.lastAttempt.getTime() > FAILED_AUTH_WINDOW_MS) {
      failedAuthAttempts.delete(key)
    }
  }
}, 60000) // Clean up every minute
