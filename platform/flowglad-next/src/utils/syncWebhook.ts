import { EventNoun, FlowgladEventType } from '@db-core/enums'
import type { Event } from '@db-core/schema/events'
import { z } from 'zod'
import { panic } from '@/errors'
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
})

export type SyncEventsAvailablePayload = z.infer<
  typeof syncEventsAvailablePayloadSchema
>

/**
 * Build a scope ID from organization ID and livemode.
 * Format: {organizationId}:{livemode ? 'live' : 'test'}
 *
 * @throws Error if organizationId is empty or whitespace-only
 */
export const buildScopeId = (
  organizationId: string,
  livemode: boolean
): string => {
  const trimmedOrgId = organizationId.trim()
  if (!trimmedOrgId) {
    panic('organizationId cannot be empty')
  }
  return `${trimmedOrgId}:${livemode ? 'live' : 'test'}`
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
  // Reject empty or whitespace-only organization IDs (e.g., ":live")
  const trimmedOrgId = organizationId?.trim()
  if (!trimmedOrgId) {
    return null
  }
  if (mode !== 'live' && mode !== 'test') {
    return null
  }
  return {
    organizationId: trimmedOrgId,
    livemode: mode === 'live',
  }
}

/**
 * Create a sync.events_available event payload.
 */
export const createSyncEventsAvailablePayload = (params: {
  scopeId: string
  latestSequence: string
}): SyncEventsAvailablePayload => {
  return {
    id: params.scopeId,
    object: EventNoun.SyncStream,
    scopeId: params.scopeId,
    latestSequence: params.latestSequence,
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
 */
export const createSyncEventsAvailableEvent = (params: {
  organizationId: string
  pricingModelId: string
  livemode: boolean
  latestSequence: string
}): Event.Insert => {
  const { organizationId, pricingModelId, livemode, latestSequence } =
    params

  const scopeId = buildScopeId(organizationId, livemode)
  const payload = createSyncEventsAvailablePayload({
    scopeId,
    latestSequence,
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
