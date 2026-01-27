import type { SyncEvent, SyncNamespace } from '@/types/sync'

/**
 * Configuration for creating an SSE connection stream.
 */
export interface SSEConnectionConfig {
  /** Scope identifier from API key (currently orgId, will become pricingModelId) */
  scopeId: string
  /** Whether this is livemode data (from API key environment) */
  livemode: boolean
  /** Last sequence received by client, for replay */
  lastSequence?: string
  /** Optional filter for specific namespaces, all namespaces sent if omitted */
  namespaces?: SyncNamespace[]
  /** Heartbeat interval in milliseconds (default 30000) */
  heartbeatIntervalMs?: number
  /** Polling interval in milliseconds (default 5000) */
  pollIntervalMs?: number
}

/**
 * Interface for the sync stream provider.
 * This abstraction allows the SSE connection to be tested independently
 * of the Redis stream implementation (Patch 2).
 */
export interface SyncStreamProvider {
  /**
   * Read events from the stream starting after the given sequence.
   * @param scopeId - Scope identifier for the stream
   * @param livemode - Whether to read from livemode or testmode stream
   * @param lastSequence - Read events after this sequence (exclusive), or '0' for all
   * @returns Array of events, or empty array if none available
   */
  readEvents(
    scopeId: string,
    livemode: boolean,
    lastSequence: string
  ): Promise<SyncEvent[]>
}

/** Default heartbeat interval: 30 seconds */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000

/** Default polling interval: 5 seconds */
const DEFAULT_POLL_INTERVAL_MS = 5000

/**
 * Format a SyncEvent as an SSE message string.
 *
 * SSE format:
 * ```
 * event: sync
 * id: {event.id}
 * data: {json}
 *
 * ```
 *
 * @param event - The sync event to format
 * @returns SSE-formatted string
 */
export const formatSSEEvent = (event: SyncEvent): string => {
  const json = JSON.stringify(event)
  return `event: sync\nid: ${event.id}\ndata: ${json}\n\n`
}

/**
 * Format a heartbeat as an SSE comment.
 *
 * SSE comments start with a colon and are ignored by clients
 * but keep the connection alive.
 *
 * @returns SSE comment string `: heartbeat\n\n`
 */
export const formatSSEHeartbeat = (): string => {
  return `: heartbeat\n\n`
}

/**
 * Format an error as an SSE event.
 *
 * SSE format:
 * ```
 * event: error
 * data: {"message":"..."}
 *
 * ```
 *
 * @param error - The error to format
 * @returns SSE-formatted error string
 */
export const formatSSEError = (error: Error): string => {
  const data = JSON.stringify({ message: error.message })
  return `event: error\ndata: ${data}\n\n`
}

/**
 * Text encoder for converting strings to Uint8Array.
 */
const encoder = new TextEncoder()

/**
 * Filter events by namespace if namespaces filter is provided.
 *
 * @param events - Events to filter
 * @param namespaces - Optional namespace filter
 * @returns Filtered events, or all events if no filter provided
 */
const filterEventsByNamespace = (
  events: SyncEvent[],
  namespaces?: SyncNamespace[]
): SyncEvent[] => {
  if (!namespaces || namespaces.length === 0) {
    return events
  }
  const namespaceSet = new Set(namespaces)
  return events.filter((event) => namespaceSet.has(event.namespace))
}

/**
 * Create an SSE readable stream for sync events.
 *
 * The stream:
 * 1. First replays any missed events since `lastSequence`
 * 2. Then enters a polling loop (5s interval) for new events
 * 3. Sends heartbeat every 30 seconds (configurable)
 * 4. Filters by `namespaces` if provided
 * 5. Stops cleanly when `signal` is aborted
 *
 * @param config - Connection configuration
 * @param signal - AbortSignal to stop the stream
 * @param provider - Sync stream provider for reading events
 * @returns ReadableStream of SSE-formatted Uint8Array chunks
 */
export const createSyncEventStream = (
  config: SSEConnectionConfig,
  signal: AbortSignal,
  provider: SyncStreamProvider
): ReadableStream<Uint8Array> => {
  const {
    scopeId,
    livemode,
    lastSequence = '0',
    namespaces,
    heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  } = config

  let currentSequence = lastSequence
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null
  let pollTimeout: ReturnType<typeof setTimeout> | null = null
  let isClosed = false

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // Set up abort handler
      const onAbort = () => {
        isClosed = true
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval)
          heartbeatInterval = null
        }
        if (pollTimeout) {
          clearTimeout(pollTimeout)
          pollTimeout = null
        }
        controller.close()
      }

      signal.addEventListener('abort', onAbort, { once: true })

      // Set up heartbeat interval
      heartbeatInterval = setInterval(() => {
        if (!isClosed) {
          try {
            controller.enqueue(encoder.encode(formatSSEHeartbeat()))
          } catch {
            // Stream may be closed, ignore
          }
        }
      }, heartbeatIntervalMs)

      // Polling function
      const poll = async () => {
        if (isClosed || signal.aborted) {
          return
        }

        try {
          const events = await provider.readEvents(
            scopeId,
            livemode,
            currentSequence
          )

          const filteredEvents = filterEventsByNamespace(
            events,
            namespaces
          )

          for (const event of filteredEvents) {
            if (isClosed) break
            controller.enqueue(encoder.encode(formatSSEEvent(event)))
            currentSequence = event.sequence
          }

          // Schedule next poll
          if (!isClosed && !signal.aborted) {
            pollTimeout = setTimeout(poll, pollIntervalMs)
          }
        } catch (error) {
          if (!isClosed) {
            controller.enqueue(
              encoder.encode(
                formatSSEError(
                  error instanceof Error
                    ? error
                    : new Error('Unknown error')
                )
              )
            )
            // Continue polling despite errors
            if (!signal.aborted) {
              pollTimeout = setTimeout(poll, pollIntervalMs)
            }
          }
        }
      }

      // Start initial poll (which handles replay of missed events)
      poll()
    },

    cancel() {
      isClosed = true
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = null
      }
      if (pollTimeout) {
        clearTimeout(pollTimeout)
        pollTimeout = null
      }
    },
  })
}
