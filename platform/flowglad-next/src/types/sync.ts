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
 * Base fields shared by all sync events
 */
interface SyncEventBase {
  /** Auto-generated unique ID for this event */
  id: string
  /** Namespace matching cache dependency (e.g., 'customerSubscriptions') */
  namespace: SyncNamespace
  /** Primary entity ID (e.g., customerId for customerSubscriptions) */
  entityId: string
  /**
   * Scope identifier derived from API key context.
   * Different API keys exist for live vs test mode, so this already
   * encodes the environment implicitly. Will transition from org-based
   * to pricingModelId-based scoping.
   */
  scopeId: string
  /** Redis Stream sequence number (e.g., "1706745600000-0") */
  sequence: string
  /** ISO timestamp when event was created */
  timestamp: string
  /**
   * Whether this is livemode data. Stored in event payload for client use,
   * but NOT used for stream keying (scopeId already encodes environment).
   */
  livemode: boolean
}

/**
 * Sync event for entity updates - data contains the full payload
 */
interface SyncEventUpdate extends SyncEventBase {
  eventType: 'update'
  /** The full data payload for the updated entity */
  data: unknown
}

/**
 * Sync event for entity deletions - data is null
 */
interface SyncEventDelete extends SyncEventBase {
  eventType: 'delete'
  /** Always null for delete events */
  data: null
}

/**
 * A sync event represents a change to an entity that should be
 * streamed to connected clients via SSE.
 * Discriminated union based on eventType ensures data matches the event type.
 */
export type SyncEvent = SyncEventUpdate | SyncEventDelete

/**
 * Base schema fields shared by all sync events
 */
const syncEventBaseSchema = {
  id: z.string().min(1),
  namespace: syncNamespaceSchema,
  entityId: z.string().min(1),
  scopeId: z.string().min(1),
  sequence: z.string().min(1),
  timestamp: z.string().datetime(),
  livemode: z.boolean(),
}

/**
 * Schema for non-null, non-undefined data (used for update events).
 * Uses loose equality (!=) to reject both null and undefined.
 */
const nonNullDataSchema = z.unknown().refine((val) => val != null, {
  message: 'data is required for update events',
})

/**
 * Zod schema for validating SyncEvent objects.
 * Uses discriminated union to enforce data type based on eventType.
 */
export const syncEventSchema = z.discriminatedUnion('eventType', [
  z.object({
    ...syncEventBaseSchema,
    eventType: z.literal('update'),
    data: nonNullDataSchema,
  }),
  z.object({
    ...syncEventBaseSchema,
    eventType: z.literal('delete'),
    data: z.null(),
  }),
])

/**
 * Base fields shared by all sync event inserts
 */
interface SyncEventInsertBase {
  namespace: SyncNamespace
  entityId: string
  /**
   * Scope identifier derived from API key context.
   * Different API keys exist for live vs test mode, so this already
   * encodes the environment implicitly (used for stream keying).
   */
  scopeId: string
  /**
   * Whether this is livemode data. Stored in event payload for client use,
   * but NOT used for stream keying (scopeId already encodes environment).
   */
  livemode: boolean
}

/**
 * Insert type for update events - data contains the full payload
 */
interface SyncEventInsertUpdate extends SyncEventInsertBase {
  eventType: 'update'
  /** The full data payload for the updated entity */
  data: unknown
}

/**
 * Insert type for delete events - data is null
 */
interface SyncEventInsertDelete extends SyncEventInsertBase {
  eventType: 'delete'
  /** Always null for delete events */
  data: null
}

/**
 * Input type for creating a new sync event.
 * Omits auto-generated fields (id, sequence, timestamp).
 * Discriminated union based on eventType ensures data matches the event type.
 */
export type SyncEventInsert =
  | SyncEventInsertUpdate
  | SyncEventInsertDelete

/**
 * Base schema fields shared by all sync event inserts
 */
const syncEventInsertBaseSchema = {
  namespace: syncNamespaceSchema,
  entityId: z.string().min(1),
  scopeId: z.string().min(1),
  livemode: z.boolean(),
}

/**
 * Zod schema for validating SyncEventInsert objects.
 * Uses discriminated union to enforce data type based on eventType.
 */
export const syncEventInsertSchema = z.discriminatedUnion(
  'eventType',
  [
    z.object({
      ...syncEventInsertBaseSchema,
      eventType: z.literal('update'),
      data: nonNullDataSchema,
    }),
    z.object({
      ...syncEventInsertBaseSchema,
      eventType: z.literal('delete'),
      data: z.null(),
    }),
  ]
)
