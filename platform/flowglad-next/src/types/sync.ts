import { z } from 'zod'

/**
 * Valid namespaces for sync events, matching cache dependency patterns.
 * Each namespace represents a type of entity that can be synced.
 */
export const SYNC_NAMESPACES = [
  'customerSubscriptions',
  'subscriptionItems',
  'subscriptionItemFeatures',
  'meterBalances',
  'paymentMethods',
  'purchases',
  'invoices',
] as const

export type SyncNamespace = (typeof SYNC_NAMESPACES)[number]

/**
 * Type guard to check if a string is a valid SyncNamespace
 */
export function isSyncNamespace(
  value: unknown
): value is SyncNamespace {
  return (
    typeof value === 'string' &&
    SYNC_NAMESPACES.includes(value as SyncNamespace)
  )
}

/**
 * Valid event types for sync events.
 * - 'update': The entity was created or updated (data field contains full payload)
 * - 'delete': The entity was removed (data field is null)
 */
export const syncEventTypeSchema = z.enum(['update', 'delete'])
export type SyncEventType = z.infer<typeof syncEventTypeSchema>

/**
 * Schema for validating namespace strings
 */
export const syncNamespaceSchema = z.enum(SYNC_NAMESPACES)

/**
 * A sync event represents a change to an entity that should be
 * streamed to connected clients via SSE.
 */
export interface SyncEvent {
  /** Auto-generated unique ID for this event */
  id: string
  /** Namespace matching cache dependency (e.g., 'customerSubscriptions') */
  namespace: SyncNamespace
  /** Primary entity ID (e.g., customerId for customerSubscriptions) */
  entityId: string
  /** Scope identifier from API key (currently organizationId, will become pricingModelId) */
  scopeId: string
  /** Event type - update means data changed, delete means entity removed */
  eventType: 'update' | 'delete'
  /** The full data payload (null for delete events) */
  data: unknown | null
  /** Redis Stream sequence number (e.g., "1706745600000-0") */
  sequence: string
  /** ISO timestamp when event was created */
  timestamp: string
  /** Whether this is livemode data (derived from API key environment) */
  livemode: boolean
}

/**
 * Zod schema for validating SyncEvent objects
 */
export const syncEventSchema = z.object({
  id: z.string().min(1),
  namespace: syncNamespaceSchema,
  entityId: z.string().min(1),
  scopeId: z.string().min(1),
  eventType: syncEventTypeSchema,
  data: z.unknown().nullable(),
  sequence: z.string().min(1),
  timestamp: z.string().datetime(),
  livemode: z.boolean(),
})

/**
 * Input type for creating a new sync event.
 * Omits auto-generated fields (id, sequence, timestamp).
 */
export interface SyncEventInsert {
  namespace: SyncNamespace
  entityId: string
  scopeId: string
  eventType: 'update' | 'delete'
  data: unknown | null
  livemode: boolean
}

/**
 * Zod schema for validating SyncEventInsert objects
 */
export const syncEventInsertSchema = z.object({
  namespace: syncNamespaceSchema,
  entityId: z.string().min(1),
  scopeId: z.string().min(1),
  eventType: syncEventTypeSchema,
  data: z.unknown().nullable(),
  livemode: z.boolean(),
})
