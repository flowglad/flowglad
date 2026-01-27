import type { SyncEvent, SyncEventInsert } from '@/types/sync'
import { syncEventSchema } from '@/types/sync'
import { nanoid } from '@/utils/core'
import { logger } from '@/utils/logger'
import {
  getSyncStreamConfig,
  RedisKeyNamespace,
  redis,
} from '@/utils/redis'

// ============================================================================
// Upstash Redis Compatibility Layer
// ============================================================================
//
// Upstash Redis REST API has different response formats than standard Redis
// clients. This section contains adapters to normalize Upstash responses into
// standard formats that the core logic expects.
//
// If migrating to a different Redis client (e.g., ioredis, node-redis), these
// adapters can be updated or replaced without changing the core stream logic.
// ============================================================================

/**
 * Upstash XRANGE response format.
 * Standard Redis: [["id", ["field1", "value1", ...]]]
 * Upstash: { "id": { field1: value1, ... } }
 */
type UpstashXrangeResponse = Record<
  string,
  Record<string, unknown>
> | null

/**
 * Normalized stream entry format used by core logic.
 * [sequence, fields] tuple matching standard Redis client patterns.
 */
type StreamEntry = [string, Record<string, unknown>]

/**
 * Convert Upstash XRANGE object response to standard entry array.
 *
 * Upstash quirk: XRANGE returns { "1234-0": {...fields} } object
 * Standard Redis: returns [["1234-0", {...fields}]] array
 */
const normalizeUpstashXrangeResponse = (
  response: UpstashXrangeResponse
): StreamEntry[] => {
  if (!response || typeof response !== 'object') {
    return []
  }

  const sequences = Object.keys(response)
  return sequences.map((sequence) => [sequence, response[sequence]])
}

/**
 * Extract first entry ID from Upstash XRANGE response.
 * Returns null if response is empty or invalid.
 */
const getFirstEntryIdFromUpstashResponse = (
  response: UpstashXrangeResponse
): string | null => {
  if (!response || typeof response !== 'object') {
    return null
  }
  return Object.keys(response)[0] ?? null
}

/**
 * Parse a field value that may have been auto-deserialized by Upstash.
 *
 * Upstash quirk: JSON strings are auto-parsed to objects.
 * We write: { data: JSON.stringify({foo: 1}) }
 * Standard Redis returns: { data: "{\"foo\":1}" }
 * Upstash returns: { data: {foo: 1} }
 */
const parseUpstashJsonField = <T>(
  value: unknown,
  parser: (str: string) => T
): T => {
  if (typeof value === 'string') {
    return parser(value)
  }
  // Already deserialized by Upstash
  return value as T
}

/**
 * Parse a boolean field that may be string or boolean due to Upstash.
 *
 * Upstash quirk: String "true"/"false" may be auto-converted to boolean.
 * We write: { livemode: "true" }
 * Standard Redis returns: { livemode: "true" }
 * Upstash may return: { livemode: true }
 */
const parseUpstashBooleanField = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value
  }
  return value === 'true'
}

// ============================================================================
// Core Redis Streams Logic
// ============================================================================
//
// Standard Redis Streams operations using XADD, XRANGE, XREVRANGE, XLEN, XTRIM.
// This logic follows Redis Streams conventions and should work with any Redis
// client after adapting the response format normalization above.
// ============================================================================

/**
 * Get the Redis Stream key for a scope's sync events.
 * Scope is determined by API key (currently org+livemode, will become pricingModelId).
 * Livemode is already embedded in the API key scope, so we don't need to key by it separately.
 */
export const getSyncStreamKey = (scopeId: string): string => {
  return `${RedisKeyNamespace.SyncStream}:${scopeId}`
}

/**
 * Standard Redis Streams event field structure.
 * All values are strings as per Redis Streams convention.
 */
interface StreamEventFields {
  id: string
  namespace: string
  entityId: string
  scopeId: string
  eventType: string
  data: string // JSON-serialized
  timestamp: string
  livemode: string // "true" or "false"
}

/**
 * Serialize a SyncEventInsert into Redis Stream fields.
 * All values must be strings for Redis Streams.
 */
const serializeEventFields = (
  event: SyncEventInsert,
  id: string,
  timestamp: string
): StreamEventFields => ({
  id,
  namespace: event.namespace,
  entityId: event.entityId,
  scopeId: event.scopeId,
  eventType: event.eventType,
  data: JSON.stringify(event.data),
  timestamp,
  livemode: String(event.livemode),
})

/**
 * Parse a stream entry into a SyncEvent.
 * Handles both standard Redis string values and Upstash auto-deserialized values.
 */
const parseStreamEntry = (entry: StreamEntry): SyncEvent | null => {
  const [sequence, fields] = entry

  try {
    // Handle Upstash auto-deserialization of JSON data field
    const data = parseUpstashJsonField(fields.data, JSON.parse)

    // Handle Upstash auto-conversion of boolean livemode field
    const livemode = parseUpstashBooleanField(fields.livemode)

    const event = {
      id: fields.id as string,
      namespace: fields.namespace as string,
      entityId: fields.entityId as string,
      scopeId: fields.scopeId as string,
      eventType: fields.eventType as string,
      data,
      sequence,
      timestamp: fields.timestamp as string,
      livemode,
    }

    const parsed = syncEventSchema.safeParse(event)
    if (!parsed.success) {
      logger.warn('Failed to parse sync event from stream', {
        sequence,
        error: parsed.error.message,
      })
      return null
    }

    return parsed.data
  } catch (error) {
    logger.warn('Failed to parse sync event from stream', {
      sequence,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Append a sync event to the scope's stream.
 * Returns the sequence ID assigned by Redis.
 *
 * Uses XADD with:
 * - '*' for auto-generated sequence ID (timestamp-based)
 * - MAXLEN with ~ for approximate trimming (efficient, allows Redis optimization)
 */
export const appendSyncEvent = async (
  event: SyncEventInsert
): Promise<{ sequence: string; id: string }> => {
  const redisClient = redis()
  const config = getSyncStreamConfig()

  const key = getSyncStreamKey(event.scopeId)

  const id = nanoid()
  const timestamp = new Date().toISOString()

  const fields = serializeEventFields(event, id, timestamp)

  try {
    // XADD: Append entry to stream
    // '*': Auto-generate ID as <timestamp>-<sequence>
    // MAXLEN ~: Trim to approximately maxlen entries (~ allows efficient trimming)
    const sequence = await redisClient.xadd(key, '*', fields, {
      trim: {
        type: 'MAXLEN',
        threshold: config.maxlen,
        comparison: '~',
      },
    })

    if (!sequence) {
      throw new Error('XADD returned null sequence')
    }

    return { sequence, id }
  } catch (error) {
    logger.error('Failed to append sync event', {
      error: error instanceof Error ? error.message : String(error),
      key,
      eventId: id,
    })
    throw error
  }
}

/**
 * Read events from stream starting after lastSequence.
 * Returns up to `count` events. If lastSequence is undefined, starts from beginning.
 *
 * Uses XRANGE with:
 * - '-' for stream start, '+' for stream end
 * - '(id' syntax for exclusive start (events after lastSequence)
 */
export const readSyncEvents = async (params: {
  scopeId: string
  lastSequence?: string
  count?: number
}): Promise<SyncEvent[]> => {
  const { scopeId, lastSequence, count = 100 } = params
  const redisClient = redis()

  const key = getSyncStreamKey(scopeId)

  try {
    // XRANGE: Read entries from start to end
    // '-': Beginning of stream
    // '+': End of stream
    // '(id': Exclusive start (entries AFTER this ID)
    const start = lastSequence
      ? `(${lastSequence}` // '(' prefix makes it exclusive
      : '-'
    const end = '+'

    const rawEntries = await redisClient.xrange(
      key,
      start,
      end,
      count
    )

    // Normalize Upstash response format to standard entries
    const entries = normalizeUpstashXrangeResponse(
      rawEntries as UpstashXrangeResponse
    )

    const events: SyncEvent[] = []
    for (const entry of entries) {
      const event = parseStreamEntry(entry)
      if (event) {
        events.push(event)
      }
    }

    return events
  } catch (error) {
    // Return empty array if stream doesn't exist
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    if (
      errorMessage.includes('no such key') ||
      errorMessage.includes('NOGROUP')
    ) {
      return []
    }

    logger.error('Failed to read sync events', {
      error: errorMessage,
      key,
      lastSequence,
    })
    throw error
  }
}

/**
 * Trim stream to retain only events within retention window.
 * Called periodically or on write to prevent unbounded growth.
 *
 * Uses XTRIM with MINID strategy:
 * - MINID removes entries older than the specified ID
 * - Redis Stream IDs are timestamp-based: <timestamp>-<sequence>
 * - ~ allows approximate trimming for efficiency
 */
export const trimSyncStream = async (params: {
  scopeId: string
  retentionMs?: number
}): Promise<number> => {
  const config = getSyncStreamConfig()
  const {
    scopeId,
    retentionMs = config.ttl * 1000, // Default 7 days in ms
  } = params
  const redisClient = redis()

  const key = getSyncStreamKey(scopeId)

  try {
    // Calculate the minimum ID to keep based on retention
    // Redis Stream IDs are timestamp-based: <timestamp>-<sequence>
    const minTimestamp = Date.now() - retentionMs
    const minId = `${minTimestamp}-0`

    // XTRIM with MINID removes entries with IDs lower than minId
    // The ~ modifier allows approximate trimming for efficiency
    const trimmed = await redisClient.xtrim(key, {
      strategy: 'MINID',
      threshold: minId,
      comparison: '~',
    })

    if (trimmed > 0) {
      logger.debug('Trimmed sync stream', {
        key,
        trimmed,
        minId,
      })
    }

    return trimmed
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)

    // Return 0 if stream doesn't exist
    if (errorMessage.includes('no such key')) {
      return 0
    }

    logger.error('Failed to trim sync stream', {
      error: errorMessage,
      key,
    })
    throw error
  }
}

/**
 * Get stream info (length, first/last entry IDs).
 *
 * Implementation note: Uses XLEN + XRANGE/XREVRANGE instead of XINFO STREAM
 * for Upstash compatibility. XINFO STREAM is not fully supported on Upstash.
 */
export const getSyncStreamInfo = async (
  scopeId: string
): Promise<{
  length: number
  firstEntry: string | null
  lastEntry: string | null
}> => {
  const redisClient = redis()

  const key = getSyncStreamKey(scopeId)

  try {
    // XLEN: Get stream length (reliable across all Redis implementations)
    const length = await redisClient.xlen(key)

    if (length === 0) {
      return {
        length: 0,
        firstEntry: null,
        lastEntry: null,
      }
    }

    // XRANGE with count 1: Get first entry
    // Using XRANGE instead of XINFO STREAM for Upstash compatibility
    const firstEntries = await redisClient.xrange(key, '-', '+', 1)
    const firstEntry = getFirstEntryIdFromUpstashResponse(
      firstEntries as UpstashXrangeResponse
    )

    // XREVRANGE with count 1: Get last entry (reverse order)
    const lastEntries = await redisClient.xrevrange(key, '+', '-', 1)
    const lastEntry = getFirstEntryIdFromUpstashResponse(
      lastEntries as UpstashXrangeResponse
    )

    return {
      length,
      firstEntry,
      lastEntry,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)

    // Return empty info if stream doesn't exist
    if (
      errorMessage.includes('no such key') ||
      errorMessage.includes('ERR no such key')
    ) {
      return {
        length: 0,
        firstEntry: null,
        lastEntry: null,
      }
    }

    logger.error('Failed to get sync stream info', {
      error: errorMessage,
      key,
    })
    throw error
  }
}
