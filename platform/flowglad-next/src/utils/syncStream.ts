import type { SyncEvent, SyncEventInsert } from '@/types/sync'
import { syncEventSchema } from '@/types/sync'
import { nanoid } from '@/utils/core'
import { logger } from '@/utils/logger'
import {
  getSyncStreamConfig,
  RedisKeyNamespace,
  redis,
} from '@/utils/redis'

/**
 * Get the Redis Stream key for a scope's sync events.
 * Scope is determined by API key (currently org+livemode, will become pricingModelId).
 * Livemode is already embedded in the API key scope, so we don't need to key by it separately.
 */
export const getSyncStreamKey = (scopeId: string): string => {
  return `${RedisKeyNamespace.SyncStream}:${scopeId}`
}

/**
 * Append a sync event to the scope's stream.
 * Returns the sequence ID assigned by Redis.
 */
export const appendSyncEvent = async (
  event: SyncEventInsert
): Promise<{ sequence: string; id: string }> => {
  const redisClient = redis()
  const config = getSyncStreamConfig()

  const key = getSyncStreamKey(event.scopeId)

  const id = nanoid()
  const timestamp = new Date().toISOString()

  // Prepare the event fields for Redis Stream
  // Redis Streams store field-value pairs, so we serialize the event data
  const fields: Record<string, string> = {
    id,
    namespace: event.namespace,
    entityId: event.entityId,
    scopeId: event.scopeId,
    eventType: event.eventType,
    data: JSON.stringify(event.data),
    timestamp,
    livemode: String(event.livemode),
  }

  try {
    // Use XADD with * for auto-generated ID and MAXLEN for trimming
    // The ~ modifier allows Redis to trim more efficiently (approximately)
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
 * Parse a Redis Stream entry into a SyncEvent.
 */
const parseStreamEntry = (
  entry: [string, Record<string, string>]
): SyncEvent | null => {
  const [sequence, fields] = entry

  try {
    const event = {
      id: fields.id,
      namespace: fields.namespace,
      entityId: fields.entityId,
      scopeId: fields.scopeId,
      eventType: fields.eventType,
      data: JSON.parse(fields.data),
      sequence,
      timestamp: fields.timestamp,
      livemode: fields.livemode === 'true',
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
 * Read events from stream starting after lastSequence.
 * Returns up to `count` events. If lastSequence is undefined, starts from beginning.
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
    // Use XRANGE to read events
    // If lastSequence is provided, start after that sequence (exclusive)
    // Otherwise, start from the beginning ('-')
    const start = lastSequence
      ? `(${lastSequence}` // '(' prefix makes it exclusive
      : '-'
    const end = '+'

    const entries = await redisClient.xrange(key, start, end, count)

    if (!entries || entries.length === 0) {
      return []
    }

    const events: SyncEvent[] = []
    for (const entry of entries) {
      const event = parseStreamEntry(
        entry as [string, Record<string, string>]
      )
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
 * Uses XTRIM with MINID strategy to remove events older than retention window.
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
    // XINFO STREAM returns detailed information about the stream
    const info = await redisClient.xinfo('STREAM', key)

    if (!info) {
      return {
        length: 0,
        firstEntry: null,
        lastEntry: null,
      }
    }

    // xinfo returns an object with various fields
    // Type assertion since Upstash returns a typed object
    const streamInfo = info as {
      length?: number
      'first-entry'?: [string, Record<string, string>] | null
      'last-entry'?: [string, Record<string, string>] | null
    }

    return {
      length: streamInfo.length ?? 0,
      firstEntry: streamInfo['first-entry']?.[0] ?? null,
      lastEntry: streamInfo['last-entry']?.[0] ?? null,
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
