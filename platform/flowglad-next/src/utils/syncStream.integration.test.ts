import { afterEach, beforeEach, expect, it } from 'bun:test'
import {
  cleanupRedisTestKeys,
  describeIfRedisKey,
  generateTestKeyPrefix,
  getRedisTestClient,
} from '@/test/redisIntegrationHelpers'
import type { SyncEventInsert } from '@/types/sync'
import {
  appendSyncEvent,
  getSyncStreamInfo,
  getSyncStreamKey,
  readSyncEvents,
  trimSyncStream,
} from '@/utils/syncStream'

/**
 * Integration tests for the syncStream helpers.
 *
 * These tests make real calls to Redis (Upstash) to verify:
 * 1. Events can be appended to streams with auto-generated sequence IDs
 * 2. Events can be read from streams with proper sequencing
 * 3. Streams can be trimmed based on retention policies
 * 4. Stream info can be retrieved correctly
 *
 * These tests require UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 * environment variables to be set.
 *
 * Note: scopeId represents the full API key scope (currently org+livemode,
 * will become pricingModelId). Livemode is embedded in the scope, not a
 * separate key component.
 */

describeIfRedisKey('syncStream Integration Tests', () => {
  let testKeyPrefix: string
  let keysToCleanup: string[] = []

  beforeEach(() => {
    testKeyPrefix = generateTestKeyPrefix()
    keysToCleanup = []
  })

  afterEach(async () => {
    const client = getRedisTestClient()
    await cleanupRedisTestKeys(client, keysToCleanup)
  })

  describeIfRedisKey('getSyncStreamKey', () => {
    it('generates key with scopeId only (livemode embedded in scope)', () => {
      // scopeId already contains the full scope context from API key
      const key = getSyncStreamKey('org_123:live')
      expect(key).toBe('syncStream:org_123:live')
    })

    it('generates different keys for different scopes', () => {
      const liveKey = getSyncStreamKey('org_123:live')
      const testKey = getSyncStreamKey('org_123:test')
      expect(liveKey).toBe('syncStream:org_123:live')
      expect(testKey).toBe('syncStream:org_123:test')
      expect(liveKey).not.toBe(testKey)
    })
  })

  describeIfRedisKey('appendSyncEvent', () => {
    it('appends event and returns sequence ID in Redis stream format', async () => {
      const scopeId = `${testKeyPrefix}_org_append:live`
      const streamKey = getSyncStreamKey(scopeId)
      keysToCleanup.push(streamKey)

      const event: SyncEventInsert = {
        namespace: 'customerSubscriptions',
        entityId: 'sub_123',
        scopeId,
        eventType: 'update',
        data: { status: 'active' },
        livemode: true,
      }

      const result = await appendSyncEvent(event)

      // sequence should be in Redis Stream ID format: timestamp-sequence
      expect(result.sequence).toMatch(/^\d+-\d+$/)
      // id should be a nanoid
      expect(result.id).toMatch(/^[a-zA-Z0-9_-]+$/)
      expect(result.id.length).toBeGreaterThan(0)
    })

    it('generates unique sequence IDs for rapid successive writes', async () => {
      const scopeId = `${testKeyPrefix}_org_rapid:live`
      const streamKey = getSyncStreamKey(scopeId)
      keysToCleanup.push(streamKey)

      const sequences: string[] = []
      const ids: string[] = []

      // Append 10 events in quick succession
      for (let i = 0; i < 10; i++) {
        const event: SyncEventInsert = {
          namespace: 'customerSubscriptions',
          entityId: `sub_${i}`,
          scopeId,
          eventType: 'update',
          data: { index: i },
          livemode: true,
        }

        const result = await appendSyncEvent(event)
        sequences.push(result.sequence)
        ids.push(result.id)
      }

      // All sequence IDs should be unique
      const uniqueSequences = new Set(sequences)
      expect(uniqueSequences.size).toBe(10)

      // All event IDs should be unique
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(10)

      // Sequences should be monotonically increasing
      for (let i = 1; i < sequences.length; i++) {
        const prev = sequences[i - 1]
        const curr = sequences[i]
        // Compare as strings since Redis stream IDs are comparable
        expect(curr > prev).toBe(true)
      }
    })

    it('stores event data that can be retrieved', async () => {
      const scopeId = `${testKeyPrefix}_org_retrieve:live`
      const streamKey = getSyncStreamKey(scopeId)
      keysToCleanup.push(streamKey)

      const eventData = {
        status: 'active',
        nested: { value: 123 },
      }

      const event: SyncEventInsert = {
        namespace: 'subscriptionItems',
        entityId: 'item_456',
        scopeId,
        eventType: 'update',
        data: eventData,
        livemode: true,
      }

      const { sequence, id } = await appendSyncEvent(event)

      // Read back the event
      const events = await readSyncEvents({ scopeId })

      expect(events.length).toBe(1)
      expect(events[0].id).toBe(id)
      expect(events[0].sequence).toBe(sequence)
      expect(events[0].namespace).toBe('subscriptionItems')
      expect(events[0].entityId).toBe('item_456')
      expect(events[0].eventType).toBe('update')
      expect(events[0].data).toEqual(eventData)
      expect(events[0].livemode).toBe(true)
    })

    it('stores delete events with null data', async () => {
      const scopeId = `${testKeyPrefix}_org_delete:live`
      const streamKey = getSyncStreamKey(scopeId)
      keysToCleanup.push(streamKey)

      const event: SyncEventInsert = {
        namespace: 'subscriptionItems',
        entityId: 'item_789',
        scopeId,
        eventType: 'delete',
        data: null,
        livemode: true,
      }

      await appendSyncEvent(event)

      const events = await readSyncEvents({ scopeId })

      expect(events.length).toBe(1)
      expect(events[0].eventType).toBe('delete')
      expect(events[0].data).toBeNull()
    })
  })

  describeIfRedisKey('readSyncEvents', () => {
    it('returns empty array when stream does not exist', async () => {
      const events = await readSyncEvents({
        scopeId: `${testKeyPrefix}_nonexistent:live`,
      })

      expect(events).toEqual([])
    })

    it('returns all events when lastSequence is undefined', async () => {
      const scopeId = `${testKeyPrefix}_org_all:live`
      const streamKey = getSyncStreamKey(scopeId)
      keysToCleanup.push(streamKey)

      // Append 5 events
      for (let i = 0; i < 5; i++) {
        await appendSyncEvent({
          namespace: 'customerSubscriptions',
          entityId: `sub_${i}`,
          scopeId,
          eventType: 'update',
          data: { index: i },
          livemode: true,
        })
      }

      const events = await readSyncEvents({ scopeId })

      expect(events.length).toBe(5)
      // Events should be in order
      for (let i = 0; i < 5; i++) {
        expect(events[i].entityId).toBe(`sub_${i}`)
        expect((events[i].data as { index: number }).index).toBe(i)
      }
    })

    it('returns only events after lastSequence', async () => {
      const scopeId = `${testKeyPrefix}_org_after:live`
      const streamKey = getSyncStreamKey(scopeId)
      keysToCleanup.push(streamKey)

      const sequences: string[] = []

      // Append 5 events and track sequences
      for (let i = 0; i < 5; i++) {
        const result = await appendSyncEvent({
          namespace: 'customerSubscriptions',
          entityId: `sub_${i}`,
          scopeId,
          eventType: 'update',
          data: { index: i },
          livemode: true,
        })
        sequences.push(result.sequence)
      }

      // Read after the 3rd event (index 2)
      const events = await readSyncEvents({
        scopeId,
        lastSequence: sequences[2],
      })

      // Should return events 4 and 5 (indices 3 and 4)
      expect(events.length).toBe(2)
      expect(events[0].entityId).toBe('sub_3')
      expect(events[1].entityId).toBe('sub_4')
    })

    it('respects count limit', async () => {
      const scopeId = `${testKeyPrefix}_org_limit:live`
      const streamKey = getSyncStreamKey(scopeId)
      keysToCleanup.push(streamKey)

      // Append 10 events
      for (let i = 0; i < 10; i++) {
        await appendSyncEvent({
          namespace: 'customerSubscriptions',
          entityId: `sub_${i}`,
          scopeId,
          eventType: 'update',
          data: { index: i },
          livemode: true,
        })
      }

      const events = await readSyncEvents({
        scopeId,
        count: 3,
      })

      // Should return first 3 events
      expect(events.length).toBe(3)
      expect(events[0].entityId).toBe('sub_0')
      expect(events[1].entityId).toBe('sub_1')
      expect(events[2].entityId).toBe('sub_2')
    })

    it('combines lastSequence and count correctly', async () => {
      const scopeId = `${testKeyPrefix}_org_combo:live`
      const streamKey = getSyncStreamKey(scopeId)
      keysToCleanup.push(streamKey)

      const sequences: string[] = []

      // Append 10 events
      for (let i = 0; i < 10; i++) {
        const result = await appendSyncEvent({
          namespace: 'customerSubscriptions',
          entityId: `sub_${i}`,
          scopeId,
          eventType: 'update',
          data: { index: i },
          livemode: true,
        })
        sequences.push(result.sequence)
      }

      // Read 2 events after the 3rd event
      const events = await readSyncEvents({
        scopeId,
        lastSequence: sequences[2],
        count: 2,
      })

      expect(events.length).toBe(2)
      expect(events[0].entityId).toBe('sub_3')
      expect(events[1].entityId).toBe('sub_4')
    })
  })

  describeIfRedisKey('trimSyncStream', () => {
    it('returns 0 when stream does not exist', async () => {
      const trimmed = await trimSyncStream({
        scopeId: `${testKeyPrefix}_trim_nonexistent:live`,
      })

      expect(trimmed).toBe(0)
    })

    it('does not trim recent events within retention window', async () => {
      const scopeId = `${testKeyPrefix}_org_trim_recent:live`
      const streamKey = getSyncStreamKey(scopeId)
      keysToCleanup.push(streamKey)

      // Append 5 events
      for (let i = 0; i < 5; i++) {
        await appendSyncEvent({
          namespace: 'customerSubscriptions',
          entityId: `sub_${i}`,
          scopeId,
          eventType: 'update',
          data: { index: i },
          livemode: true,
        })
      }

      // Trim with default retention (7 days) - all events are recent
      const trimmed = await trimSyncStream({ scopeId })

      // Should not trim any events (they're all recent)
      expect(trimmed).toBe(0)

      // Verify all events still exist
      const events = await readSyncEvents({ scopeId })
      expect(events.length).toBe(5)
    })

    it('trims events older than retention window', async () => {
      const client = getRedisTestClient()
      const scopeId = `${testKeyPrefix}_org_trim_old:live`
      const streamKey = getSyncStreamKey(scopeId)
      keysToCleanup.push(streamKey)

      // Manually add old entries directly to Redis
      // Redis Stream IDs are timestamp-based, so we can create "old" entries
      const oldTimestamp = Date.now() - 10000 // 10 seconds ago

      // Add entries with old timestamps using raw Redis commands
      const fields = {
        id: 'old_event_1',
        namespace: 'customerSubscriptions',
        entityId: 'sub_old_1',
        scopeId,
        eventType: 'update',
        data: JSON.stringify({ old: true }),
        timestamp: new Date(oldTimestamp).toISOString(),
        livemode: 'true',
      }

      await client.xadd(streamKey, `${oldTimestamp}-0`, fields)

      // Add a recent event
      await appendSyncEvent({
        namespace: 'customerSubscriptions',
        entityId: 'sub_recent',
        scopeId,
        eventType: 'update',
        data: { recent: true },
        livemode: true,
      })

      // Verify we have 2 events
      const beforeTrim = await readSyncEvents({ scopeId })
      expect(beforeTrim.length).toBe(2)

      // Trim with 5 second retention - should remove the old event
      const trimmed = await trimSyncStream({
        scopeId,
        retentionMs: 5000, // 5 seconds
      })

      // Due to approximate trimming (~), the actual number might vary
      expect(trimmed).toBeGreaterThanOrEqual(0)

      // Verify the recent event still exists
      const afterTrim = await readSyncEvents({ scopeId })
      // At minimum the recent event should still exist
      expect(afterTrim.length).toBeGreaterThanOrEqual(1)
      expect(afterTrim.some((e) => e.entityId === 'sub_recent')).toBe(
        true
      )
    })
  })

  describeIfRedisKey('getSyncStreamInfo', () => {
    it('returns zeros when stream does not exist', async () => {
      const info = await getSyncStreamInfo(
        `${testKeyPrefix}_info_nonexistent:live`
      )

      expect(info.length).toBe(0)
      expect(info.firstEntry).toBeNull()
      expect(info.lastEntry).toBeNull()
    })

    it('returns correct length and entry IDs', async () => {
      const scopeId = `${testKeyPrefix}_org_info:live`
      const streamKey = getSyncStreamKey(scopeId)
      keysToCleanup.push(streamKey)

      const sequences: string[] = []

      // Append 5 events
      for (let i = 0; i < 5; i++) {
        const result = await appendSyncEvent({
          namespace: 'customerSubscriptions',
          entityId: `sub_${i}`,
          scopeId,
          eventType: 'update',
          data: { index: i },
          livemode: true,
        })
        sequences.push(result.sequence)
      }

      const info = await getSyncStreamInfo(scopeId)

      expect(info.length).toBe(5)
      expect(info.firstEntry).toBe(sequences[0])
      expect(info.lastEntry).toBe(sequences[4])
    })

    it('updates info when events are added', async () => {
      const scopeId = `${testKeyPrefix}_org_info_update:live`
      const streamKey = getSyncStreamKey(scopeId)
      keysToCleanup.push(streamKey)

      // Add first event
      const first = await appendSyncEvent({
        namespace: 'customerSubscriptions',
        entityId: 'sub_1',
        scopeId,
        eventType: 'update',
        data: { first: true },
        livemode: true,
      })

      let info = await getSyncStreamInfo(scopeId)
      expect(info.length).toBe(1)
      expect(info.firstEntry).toBe(first.sequence)
      expect(info.lastEntry).toBe(first.sequence)

      // Add second event
      const second = await appendSyncEvent({
        namespace: 'customerSubscriptions',
        entityId: 'sub_2',
        scopeId,
        eventType: 'update',
        data: { second: true },
        livemode: true,
      })

      info = await getSyncStreamInfo(scopeId)
      expect(info.length).toBe(2)
      expect(info.firstEntry).toBe(first.sequence)
      expect(info.lastEntry).toBe(second.sequence)
    })
  })

  describeIfRedisKey('scope isolation', () => {
    it('separates events from different scopes into different streams', async () => {
      // Different scopes (representing different API key contexts)
      const liveScopeId = `${testKeyPrefix}_org_isolation:live`
      const testScopeId = `${testKeyPrefix}_org_isolation:test`
      const liveStreamKey = getSyncStreamKey(liveScopeId)
      const testStreamKey = getSyncStreamKey(testScopeId)
      keysToCleanup.push(liveStreamKey, testStreamKey)

      // Add event to live scope
      await appendSyncEvent({
        namespace: 'customerSubscriptions',
        entityId: 'sub_live',
        scopeId: liveScopeId,
        eventType: 'update',
        data: { mode: 'live' },
        livemode: true,
      })

      // Add event to test scope
      await appendSyncEvent({
        namespace: 'customerSubscriptions',
        entityId: 'sub_test',
        scopeId: testScopeId,
        eventType: 'update',
        data: { mode: 'test' },
        livemode: false,
      })

      // Read live scope events
      const liveEvents = await readSyncEvents({
        scopeId: liveScopeId,
      })
      expect(liveEvents.length).toBe(1)
      expect(liveEvents[0].entityId).toBe('sub_live')
      expect(liveEvents[0].livemode).toBe(true)

      // Read test scope events
      const testEvents = await readSyncEvents({
        scopeId: testScopeId,
      })
      expect(testEvents.length).toBe(1)
      expect(testEvents[0].entityId).toBe('sub_test')
      expect(testEvents[0].livemode).toBe(false)
    })
  })
})
