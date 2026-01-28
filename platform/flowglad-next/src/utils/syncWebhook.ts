import { z } from 'zod'
import type { Event } from '@/db/schema/events'
import { EventNoun, FlowgladEventType } from '@/types'
import { constructSyncEventsAvailableEventHash } from '@/utils/eventHelpers'

/**
 * Payload for sync.events_available webhook events.
 * This is a lightweight notification sent via Svix when new events
 * are available in the sync stream for a merchant to consume.
 *
 * The payload includes the event object fields (id, object) plus
 * sync-specific data that merchants need to read from the stream.
 */
export const syncEventsAvailablePayloadSchema = z.object({
  /** Event object ID (using scopeId as the identifier) */
  id: z.string().min(1),
  /** Event object type */
  object: z.literal(EventNoun.SyncStream),
  /**
   * Scope identifier for the sync stream.
   * Format: {organizationId}:{livemode ? 'live' : 'test'}
   */
  scopeId: z.string().min(1),
  /** Latest sequence ID in the stream (Redis Stream ID format) */
  latestSequence: z.string().min(1),
  /** Number of events waiting in the stream since last notification */
  eventCount: z.number().int().nonnegative(),
})

export type SyncEventsAvailablePayload = z.infer<
  typeof syncEventsAvailablePayloadSchema
>

/**
 * Build a scope ID from organization ID and livemode.
 * Format: {organizationId}:{livemode ? 'live' : 'test'}
 */
export const buildScopeId = (
  organizationId: string,
  livemode: boolean
): string => {
  return `${organizationId}:${livemode ? 'live' : 'test'}`
}

/**
 * Parse a scope ID into organization ID and livemode.
 */
export const parseScopeId = (
  scopeId: string
): { organizationId: string; livemode: boolean } | null => {
  const parts = scopeId.split(':')
  if (parts.length !== 2) {
    return null
  }
  const [organizationId, mode] = parts
  if (mode !== 'live' && mode !== 'test') {
    return null
  }
  return {
    organizationId,
    livemode: mode === 'live',
  }
}

/**
 * Create a sync.events_available event payload.
 */
export const createSyncEventsAvailablePayload = (params: {
  scopeId: string
  latestSequence: string
  eventCount: number
}): SyncEventsAvailablePayload => {
  return {
    id: params.scopeId,
    object: EventNoun.SyncStream,
    scopeId: params.scopeId,
    latestSequence: params.latestSequence,
    eventCount: params.eventCount,
  }
}

/**
 * Create an Event.Insert record for a sync.events_available notification.
 *
 * This event is sent via Svix to notify merchants that new events
 * are available in their sync stream. Merchants who want real-time
 * notifications subscribe to the 'sync.events_available' event type
 * in their webhook configuration.
 *
 * @param params.organizationId - The organization ID
 * @param params.pricingModelId - The pricing model ID (required for Svix routing)
 * @param params.livemode - Whether this is live or test mode
 * @param params.latestSequence - The latest Redis Stream sequence ID
 * @param params.eventCount - Number of events waiting in the stream
 */
export const createSyncEventsAvailableEvent = (params: {
  organizationId: string
  pricingModelId: string
  livemode: boolean
  latestSequence: string
  eventCount: number
}): Event.Insert => {
  const {
    organizationId,
    pricingModelId,
    livemode,
    latestSequence,
    eventCount,
  } = params

  const scopeId = buildScopeId(organizationId, livemode)
  const payload = createSyncEventsAvailablePayload({
    scopeId,
    latestSequence,
    eventCount,
  })

  const now = Date.now()

  return {
    type: FlowgladEventType.SyncEventsAvailable,
    organizationId,
    pricingModelId,
    livemode,
    payload,
    occurredAt: now,
    submittedAt: now,
    processedAt: null,
    metadata: {},
    hash: constructSyncEventsAvailableEventHash({
      scopeId,
      latestSequence,
    }),
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
