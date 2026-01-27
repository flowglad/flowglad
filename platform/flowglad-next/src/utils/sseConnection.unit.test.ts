import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { SyncEvent } from '@/types/sync'
import {
  createSyncEventStream,
  formatSSEError,
  formatSSEEvent,
  formatSSEHeartbeat,
  type SyncStreamProvider,
} from './sseConnection'

/**
 * Helper to create a valid SyncEvent for testing.
 */
const createTestEvent = (
  overrides: Partial<SyncEvent> = {}
): SyncEvent => ({
  id: 'evt_test_123',
  namespace: 'customerSubscriptions',
  entityId: 'cus_456',
  scopeId: 'org_789',
  eventType: 'update',
  data: { customerId: 'cus_456', status: 'active' },
  sequence: '1706745600000-0',
  timestamp: '2024-02-01T00:00:00.000Z',
  livemode: true,
  ...overrides,
})

/**
 * Helper to read all chunks from a stream until it closes or times out.
 */
const readStreamChunks = async (
  stream: ReadableStream<Uint8Array>,
  options: { timeout?: number; maxChunks?: number } = {}
): Promise<string[]> => {
  const { timeout = 1000, maxChunks = 100 } = options
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []

  const timeoutPromise = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), timeout)
  )

  try {
    while (chunks.length < maxChunks) {
      const readPromise = reader.read()
      const result = await Promise.race([readPromise, timeoutPromise])

      if (result === 'timeout') {
        break
      }

      if (result.done) {
        break
      }

      chunks.push(decoder.decode(result.value))
    }
  } finally {
    reader.releaseLock()
  }

  return chunks
}

/**
 * Create a mock SyncStreamProvider for testing.
 * Returns all events that have sequence > lastSequence in a single call,
 * simulating how a real Redis stream would return events.
 */
const createMockProvider = (
  events: SyncEvent[] = []
): SyncStreamProvider & {
  calls: Array<[string, boolean, string]>
} => {
  const calls: Array<[string, boolean, string]> = []
  const returnedSequences = new Set<string>()

  return {
    calls,
    readEvents: async (
      scopeId: string,
      livemode: boolean,
      lastSequence: string
    ) => {
      calls.push([scopeId, livemode, lastSequence])

      // Return events that have sequence > lastSequence and haven't been returned yet
      const filteredEvents = events.filter((event) => {
        if (returnedSequences.has(event.sequence)) return false
        if (lastSequence === '0') return true
        return event.sequence > lastSequence
      })

      // Mark events as returned
      for (const event of filteredEvents) {
        returnedSequences.add(event.sequence)
      }

      return filteredEvents
    },
  }
}

describe('sseConnection', () => {
  describe('formatSSEEvent', () => {
    it('formats event with correct SSE structure including event type, id, and JSON data', () => {
      const event = createTestEvent({
        id: 'evt_format_test',
        namespace: 'invoices',
        entityId: 'inv_123',
        data: { amount: 1000, currency: 'usd' },
      })

      const result = formatSSEEvent(event)

      // Verify structure
      expect(result).toStartWith('event: sync\n')
      expect(result).toContain('id: evt_format_test\n')
      expect(result).toContain('data: ')
      expect(result).toEndWith('\n\n')

      // Verify JSON is valid and contains event data
      const dataLine = result
        .split('\n')
        .find((line) => line.startsWith('data: '))
      expect(typeof dataLine).toBe('string')
      const jsonStr = dataLine!.replace('data: ', '')
      const parsed = JSON.parse(jsonStr)
      expect(parsed.id).toBe('evt_format_test')
      expect(parsed.namespace).toBe('invoices')
      expect(parsed.entityId).toBe('inv_123')
      expect(parsed.data).toEqual({ amount: 1000, currency: 'usd' })
    })

    it('formats delete event with null data correctly', () => {
      const event: SyncEvent = {
        id: 'evt_delete_123',
        namespace: 'customerSubscriptions',
        entityId: 'cus_456',
        scopeId: 'org_789',
        eventType: 'delete',
        data: null,
        sequence: '1706745600001-0',
        timestamp: '2024-02-01T00:00:01.000Z',
        livemode: false,
      }

      const result = formatSSEEvent(event)

      expect(result).toContain('id: evt_delete_123\n')
      const dataLine = result
        .split('\n')
        .find((line) => line.startsWith('data: '))
      const parsed = JSON.parse(dataLine!.replace('data: ', ''))
      expect(parsed.eventType).toBe('delete')
      expect(parsed.data).toBeNull()
    })

    it('escapes special characters in JSON data correctly', () => {
      const event = createTestEvent({
        id: 'evt_special',
        data: {
          name: 'Test "quoted" value',
          path: 'some\\path',
          newline: 'line1\nline2',
        },
      })

      const result = formatSSEEvent(event)

      // Verify the output is valid and can be parsed
      const dataLine = result
        .split('\n')
        .find((line) => line.startsWith('data: '))
      const parsed = JSON.parse(dataLine!.replace('data: ', ''))
      expect(parsed.data.name).toBe('Test "quoted" value')
      expect(parsed.data.path).toBe('some\\path')
      expect(parsed.data.newline).toBe('line1\nline2')
    })
  })

  describe('formatSSEHeartbeat', () => {
    it('returns SSE comment format with colon prefix', () => {
      const result = formatSSEHeartbeat()

      expect(result).toBe(': heartbeat\n\n')
    })

    it('produces output that starts with colon (SSE comment marker)', () => {
      const result = formatSSEHeartbeat()

      expect(result).toStartWith(':')
    })

    it('produces output that ends with double newline (SSE message terminator)', () => {
      const result = formatSSEHeartbeat()

      expect(result).toEndWith('\n\n')
    })
  })

  describe('formatSSEError', () => {
    it('formats error with event type error and JSON message', () => {
      const error = new Error('Connection timeout')

      const result = formatSSEError(error)

      expect(result).toBe(
        'event: error\ndata: {"message":"Connection timeout"}\n\n'
      )
    })

    it('escapes special characters in error messages', () => {
      const error = new Error('Error with "quotes" and \\backslash')

      const result = formatSSEError(error)

      expect(result).toContain('event: error\n')
      const dataLine = result
        .split('\n')
        .find((line) => line.startsWith('data: '))
      const parsed = JSON.parse(dataLine!.replace('data: ', ''))
      expect(parsed.message).toBe(
        'Error with "quotes" and \\backslash'
      )
    })

    it('handles empty error message', () => {
      const error = new Error('')

      const result = formatSSEError(error)

      expect(result).toBe('event: error\ndata: {"message":""}\n\n')
    })
  })

  describe('createSyncEventStream', () => {
    let abortController: AbortController

    beforeEach(() => {
      abortController = new AbortController()
    })

    afterEach(() => {
      // Ensure stream is aborted after each test
      if (!abortController.signal.aborted) {
        abortController.abort()
      }
    })

    it('replays missed events on connection when lastSequence is before available events', async () => {
      const events = [
        createTestEvent({
          id: 'evt_1',
          sequence: '1706745600001-0',
        }),
        createTestEvent({
          id: 'evt_2',
          sequence: '1706745600002-0',
        }),
        createTestEvent({
          id: 'evt_3',
          sequence: '1706745600003-0',
        }),
      ]

      const provider = createMockProvider(events)

      const stream = createSyncEventStream(
        {
          scopeId: 'org_test',
          livemode: true,
          lastSequence: '0',
          pollIntervalMs: 10,
        },
        abortController.signal,
        provider
      )

      // Read chunks with short timeout
      const chunks = await readStreamChunks(stream, {
        timeout: 100,
        maxChunks: 10,
      })

      // Should have received all 3 events
      const eventChunks = chunks.filter((c) =>
        c.startsWith('event: sync')
      )
      expect(eventChunks.length).toBe(3)

      // Verify event IDs
      expect(eventChunks[0]).toContain('id: evt_1')
      expect(eventChunks[1]).toContain('id: evt_2')
      expect(eventChunks[2]).toContain('id: evt_3')

      abortController.abort()
    })

    it('sends heartbeat after interval with no events', async () => {
      // Provider that returns no events
      const provider = createMockProvider([])

      const stream = createSyncEventStream(
        {
          scopeId: 'org_test',
          livemode: true,
          heartbeatIntervalMs: 50, // Short interval for testing
          pollIntervalMs: 200,
        },
        abortController.signal,
        provider
      )

      // Read chunks, expecting heartbeat
      const chunks = await readStreamChunks(stream, {
        timeout: 150,
        maxChunks: 5,
      })

      // Should have at least one heartbeat
      const heartbeatChunks = chunks.filter((c) =>
        c.startsWith(': heartbeat')
      )
      expect(heartbeatChunks.length).toBeGreaterThanOrEqual(1)

      abortController.abort()
    })

    it('stops streaming when abort signal fires', async () => {
      const events = [
        createTestEvent({
          id: 'evt_1',
          sequence: '1706745600001-0',
        }),
      ]

      const provider = createMockProvider(events)

      const stream = createSyncEventStream(
        {
          scopeId: 'org_test',
          livemode: true,
          pollIntervalMs: 10,
        },
        abortController.signal,
        provider
      )

      const reader = stream.getReader()

      // Read first event
      const firstResult = await reader.read()
      expect(firstResult.done).toBe(false)

      // Abort the stream
      abortController.abort()

      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Next read should indicate done
      const nextResult = await reader.read()
      expect(nextResult.done).toBe(true)

      reader.releaseLock()
    })

    it('filters events by namespace when namespaces filter is provided', async () => {
      const events = [
        createTestEvent({
          id: 'evt_subs',
          namespace: 'customerSubscriptions',
          sequence: '1706745600001-0',
        }),
        createTestEvent({
          id: 'evt_invoice',
          namespace: 'invoices',
          sequence: '1706745600002-0',
        }),
        createTestEvent({
          id: 'evt_payment',
          namespace: 'paymentMethods',
          sequence: '1706745600003-0',
        }),
      ]

      const provider = createMockProvider(events)

      const stream = createSyncEventStream(
        {
          scopeId: 'org_test',
          livemode: true,
          namespaces: ['invoices', 'paymentMethods'],
          pollIntervalMs: 10,
        },
        abortController.signal,
        provider
      )

      const chunks = await readStreamChunks(stream, {
        timeout: 150,
        maxChunks: 10,
      })

      // Should only have filtered events (invoices and paymentMethods)
      const eventChunks = chunks.filter((c) =>
        c.startsWith('event: sync')
      )

      // evt_subs should be filtered out
      const hasSubscriptionEvent = eventChunks.some((c) =>
        c.includes('evt_subs')
      )
      expect(hasSubscriptionEvent).toBe(false)

      // evt_invoice and evt_payment should be present
      const hasInvoiceEvent = eventChunks.some((c) =>
        c.includes('evt_invoice')
      )
      const hasPaymentEvent = eventChunks.some((c) =>
        c.includes('evt_payment')
      )
      expect(hasInvoiceEvent).toBe(true)
      expect(hasPaymentEvent).toBe(true)

      abortController.abort()
    })

    it('passes correct parameters to provider.readEvents', async () => {
      const provider = createMockProvider([])

      const stream = createSyncEventStream(
        {
          scopeId: 'org_specific',
          livemode: false,
          lastSequence: '1234567890-5',
          pollIntervalMs: 10,
        },
        abortController.signal,
        provider
      )

      // Read to trigger at least one poll
      await readStreamChunks(stream, { timeout: 50, maxChunks: 1 })

      // Verify provider was called with correct params
      expect(provider.calls.length).toBeGreaterThanOrEqual(1)
      expect(provider.calls[0]).toEqual([
        'org_specific',
        false,
        '1234567890-5',
      ])

      abortController.abort()
    })

    it('continues polling after provider returns empty results', async () => {
      const provider = createMockProvider([])

      const stream = createSyncEventStream(
        {
          scopeId: 'org_test',
          livemode: true,
          pollIntervalMs: 20,
        },
        abortController.signal,
        provider
      )

      // Let it poll multiple times
      await readStreamChunks(stream, { timeout: 100, maxChunks: 10 })

      // Should have made multiple calls
      expect(provider.calls.length).toBeGreaterThanOrEqual(2)

      abortController.abort()
    })

    it('sends all events without namespace filter when namespaces is undefined', async () => {
      const events = [
        createTestEvent({
          id: 'evt_subs',
          namespace: 'customerSubscriptions',
          sequence: '1706745600001-0',
        }),
        createTestEvent({
          id: 'evt_invoice',
          namespace: 'invoices',
          sequence: '1706745600002-0',
        }),
      ]

      const provider = createMockProvider(events)

      const stream = createSyncEventStream(
        {
          scopeId: 'org_test',
          livemode: true,
          // namespaces is undefined - no filter
          pollIntervalMs: 10,
        },
        abortController.signal,
        provider
      )

      const chunks = await readStreamChunks(stream, {
        timeout: 100,
        maxChunks: 10,
      })

      const eventChunks = chunks.filter((c) =>
        c.startsWith('event: sync')
      )

      // Both events should be present
      expect(eventChunks.length).toBe(2)
      expect(eventChunks.some((c) => c.includes('evt_subs'))).toBe(
        true
      )
      expect(eventChunks.some((c) => c.includes('evt_invoice'))).toBe(
        true
      )

      abortController.abort()
    })

    it('updates currentSequence as events are processed', async () => {
      const events = [
        createTestEvent({
          id: 'evt_1',
          sequence: '1706745600001-0',
        }),
        createTestEvent({
          id: 'evt_2',
          sequence: '1706745600002-0',
        }),
      ]

      const provider = createMockProvider(events)

      const stream = createSyncEventStream(
        {
          scopeId: 'org_test',
          livemode: true,
          lastSequence: '0',
          pollIntervalMs: 10,
        },
        abortController.signal,
        provider
      )

      // Read enough to get both events
      await readStreamChunks(stream, { timeout: 150, maxChunks: 10 })

      // Verify that subsequent calls use updated sequence
      // First call should use '0', subsequent calls should use latest sequence
      expect(provider.calls[0][2]).toBe('0')

      // After processing events, sequence should be updated
      // Later calls should have the updated sequence
      const laterCalls = provider.calls.slice(2)
      if (laterCalls.length > 0) {
        const lastCall = laterCalls[laterCalls.length - 1]
        // Should be the sequence of the last processed event
        expect(lastCall[2]).toBe('1706745600002-0')
      }

      abortController.abort()
    })

    it('sends error event when provider throws and continues polling', async () => {
      let callCount = 0
      const errorProvider: SyncStreamProvider = {
        readEvents: async () => {
          callCount++
          if (callCount === 1) {
            throw new Error('Redis connection failed')
          }
          return []
        },
      }

      const stream = createSyncEventStream(
        {
          scopeId: 'org_test',
          livemode: true,
          pollIntervalMs: 20,
        },
        abortController.signal,
        errorProvider
      )

      const chunks = await readStreamChunks(stream, {
        timeout: 100,
        maxChunks: 10,
      })

      // Should have error event
      const errorChunks = chunks.filter((c) =>
        c.startsWith('event: error')
      )
      expect(errorChunks.length).toBeGreaterThanOrEqual(1)
      expect(errorChunks[0]).toContain('Redis connection failed')

      // Should continue polling after error
      expect(callCount).toBeGreaterThanOrEqual(2)

      abortController.abort()
    })

    it('uses default intervals when not specified in config', async () => {
      const provider = createMockProvider([])

      // Create stream with minimal config (no intervals specified)
      const stream = createSyncEventStream(
        {
          scopeId: 'org_test',
          livemode: true,
        },
        abortController.signal,
        provider
      )

      // Just verify stream was created successfully
      const reader = stream.getReader()
      expect(typeof reader.read).toBe('function')
      reader.releaseLock()

      abortController.abort()
    })
  })
})
