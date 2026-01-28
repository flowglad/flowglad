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
  getSyncStreamKey,
  readSyncEvents,
} from '@/utils/syncStream'
import {
  buildScopeId,
  createSyncEventsAvailablePayload,
} from '@/utils/syncWebhook'

/**
 * Integration tests for the webhook + stream read sync pattern.
 *
 * These tests verify the primary sync mechanism described in the design:
 * 1. Events are durably stored in Redis Streams
 * 2. Webhooks deliver lightweight notifications with latestSequence
 * 3. Merchants read from the stream to catch up on missed events
 * 4. Stream durability ensures events are never lost, even if webhooks fail
 *
 * This pattern is designed for serverless environments where:
 * - SDK cannot maintain persistent connections
 * - Webhooks wake up serverless functions
 * - Functions read from stream to sync state
 */

describeIfRedisKey('syncWebhook integration', () => {
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

  it('webhook triggers stream read and catches up on missed events: given 5 events appended and webhook with lastSequence after event 2, reading stream returns events 3, 4, 5', async () => {
    // Setup: Create a scope and append 5 events
    const scopeId = `${testKeyPrefix}_org_webhook_catchup:live`
    const streamKey = getSyncStreamKey(scopeId)
    keysToCleanup.push(streamKey)

    const sequences: string[] = []

    // Append 5 events to the stream
    for (let i = 0; i < 5; i++) {
      const event: SyncEventInsert = {
        namespace: 'customerSubscriptions',
        entityId: `sub_${i}`,
        scopeId,
        eventType: 'update',
        data: { index: i, status: 'active' },
        livemode: true,
      }

      const result = await appendSyncEvent(event)
      sequences.push(result.sequence)
    }

    // Verify all 5 events were appended
    expect(sequences.length).toBe(5)

    // Simulate webhook notification: merchant receives webhook with lastSequence
    // pointing to the 3rd event (index 2), meaning they've seen events 0, 1, 2
    const webhookPayload = createSyncEventsAvailablePayload({
      scopeId,
      latestSequence: sequences[4], // Latest sequence in stream
      eventCount: 5,
    })

    // Merchant's lastSequence from their local state is sequences[2] (event index 2)
    // They want to catch up on events they missed (indices 3 and 4)
    const merchantLastSequence = sequences[2]

    // Merchant reads from stream starting AFTER their last known sequence
    // This simulates what the SDK does when triggered by a webhook
    const catchupEvents = await readSyncEvents({
      scopeId,
      lastSequence: merchantLastSequence,
    })

    // Should return exactly 2 events: indices 3 and 4
    expect(catchupEvents.length).toBe(2)
    expect(catchupEvents[0].entityId).toBe('sub_3')
    expect((catchupEvents[0].data as { index: number }).index).toBe(3)
    expect(catchupEvents[1].entityId).toBe('sub_4')
    expect((catchupEvents[1].data as { index: number }).index).toBe(4)

    // Verify sequences are correct
    expect(catchupEvents[0].sequence).toBe(sequences[3])
    expect(catchupEvents[1].sequence).toBe(sequences[4])

    // Verify the webhook payload contains the latest sequence
    expect(webhookPayload.latestSequence).toBe(sequences[4])
  })

  it('webhook delivery failure does not lose events: events remain readable from stream regardless of webhook delivery status', async () => {
    // Setup: Create a scope and append events
    const scopeId = `${testKeyPrefix}_org_webhook_durable:live`
    const streamKey = getSyncStreamKey(scopeId)
    keysToCleanup.push(streamKey)

    const sequences: string[] = []

    // Append 3 events to the stream
    for (let i = 0; i < 3; i++) {
      const event: SyncEventInsert = {
        namespace: 'subscriptionItems',
        entityId: `item_${i}`,
        scopeId,
        eventType: 'update',
        data: { quantity: i + 1 },
        livemode: true,
      }

      const result = await appendSyncEvent(event)
      sequences.push(result.sequence)
    }

    // Simulate webhook delivery failure: the webhook with these details
    // would fail to deliver to the merchant's endpoint
    // (We don't actually send webhooks in this test - we're testing that
    // the stream remains intact regardless of webhook status)
    const failedWebhookPayload = createSyncEventsAvailablePayload({
      scopeId,
      latestSequence: sequences[2],
      eventCount: 3,
    })

    // Verify the payload was created correctly (webhook would carry this)
    expect(failedWebhookPayload.eventCount).toBe(3)
    expect(failedWebhookPayload.latestSequence).toBe(sequences[2])

    // Even if webhook failed, merchant can still read all events from stream
    // This could happen via:
    // 1. A retry webhook that eventually succeeds
    // 2. A manual sync/poll initiated by the merchant
    // 3. The next webhook notification after more events are added
    const allEvents = await readSyncEvents({ scopeId })

    // All 3 events should still be readable
    expect(allEvents.length).toBe(3)
    expect(allEvents[0].entityId).toBe('item_0')
    expect(allEvents[1].entityId).toBe('item_1')
    expect(allEvents[2].entityId).toBe('item_2')

    // Data integrity is preserved
    expect((allEvents[0].data as { quantity: number }).quantity).toBe(
      1
    )
    expect((allEvents[1].data as { quantity: number }).quantity).toBe(
      2
    )
    expect((allEvents[2].data as { quantity: number }).quantity).toBe(
      3
    )

    // Sequences are monotonically increasing
    for (let i = 1; i < allEvents.length; i++) {
      expect(allEvents[i].sequence > allEvents[i - 1].sequence).toBe(
        true
      )
    }
  })

  it('merchant can incrementally catch up using multiple read calls with cursor', async () => {
    // This test verifies the pattern where a merchant falls behind
    // and needs multiple reads to catch up (simulating pagination)
    const scopeId = `${testKeyPrefix}_org_webhook_incremental:live`
    const streamKey = getSyncStreamKey(scopeId)
    keysToCleanup.push(streamKey)

    const sequences: string[] = []

    // Append 10 events to the stream
    for (let i = 0; i < 10; i++) {
      const event: SyncEventInsert = {
        namespace: 'invoices',
        entityId: `inv_${i}`,
        scopeId,
        eventType: 'update',
        data: { amount: (i + 1) * 100 },
        livemode: true,
      }

      const result = await appendSyncEvent(event)
      sequences.push(result.sequence)
    }

    // Merchant starts with no events (first sync)
    // Read first batch of 3
    const batch1 = await readSyncEvents({
      scopeId,
      count: 3,
    })

    expect(batch1.length).toBe(3)
    expect(batch1[0].entityId).toBe('inv_0')
    expect(batch1[2].entityId).toBe('inv_2')

    // Use last sequence from batch1 to continue
    const batch2 = await readSyncEvents({
      scopeId,
      lastSequence: batch1[2].sequence,
      count: 3,
    })

    expect(batch2.length).toBe(3)
    expect(batch2[0].entityId).toBe('inv_3')
    expect(batch2[2].entityId).toBe('inv_5')

    // Continue from batch2
    const batch3 = await readSyncEvents({
      scopeId,
      lastSequence: batch2[2].sequence,
      count: 3,
    })

    expect(batch3.length).toBe(3)
    expect(batch3[0].entityId).toBe('inv_6')
    expect(batch3[2].entityId).toBe('inv_8')

    // Final batch - only 1 event remaining
    const batch4 = await readSyncEvents({
      scopeId,
      lastSequence: batch3[2].sequence,
      count: 3,
    })

    expect(batch4.length).toBe(1)
    expect(batch4[0].entityId).toBe('inv_9')

    // One more read returns empty - merchant is caught up
    const emptyBatch = await readSyncEvents({
      scopeId,
      lastSequence: batch4[0].sequence,
      count: 3,
    })

    expect(emptyBatch.length).toBe(0)
  })

  it('buildScopeId correctly formats scope for stream operations', () => {
    // Test that buildScopeId produces the correct format used by stream operations
    const liveScopeId = buildScopeId('org_123', true)
    const testScopeId = buildScopeId('org_123', false)

    expect(liveScopeId).toBe('org_123:live')
    expect(testScopeId).toBe('org_123:test')

    // Verify these can be used to generate valid stream keys
    const liveKey = getSyncStreamKey(liveScopeId)
    const testKey = getSyncStreamKey(testScopeId)

    expect(liveKey).toBe('syncStream:org_123:live')
    expect(testKey).toBe('syncStream:org_123:test')
  })

  it('events from different namespaces in same scope are stored together and can be read in order', async () => {
    // This verifies the design decision: store all namespaces, filter on read
    const scopeId = `${testKeyPrefix}_org_webhook_mixed:live`
    const streamKey = getSyncStreamKey(scopeId)
    keysToCleanup.push(streamKey)

    // Append events from different namespaces interleaved
    await appendSyncEvent({
      namespace: 'customerSubscriptions',
      entityId: 'sub_1',
      scopeId,
      eventType: 'update',
      data: { status: 'active' },
      livemode: true,
    })

    await appendSyncEvent({
      namespace: 'subscriptionItems',
      entityId: 'item_1',
      scopeId,
      eventType: 'update',
      data: { quantity: 5 },
      livemode: true,
    })

    await appendSyncEvent({
      namespace: 'invoices',
      entityId: 'inv_1',
      scopeId,
      eventType: 'update',
      data: { amount: 1000 },
      livemode: true,
    })

    await appendSyncEvent({
      namespace: 'customerSubscriptions',
      entityId: 'sub_2',
      scopeId,
      eventType: 'update',
      data: { status: 'trialing' },
      livemode: true,
    })

    // Read all events - they should be in insertion order
    const allEvents = await readSyncEvents({ scopeId })

    expect(allEvents.length).toBe(4)

    // Verify ordering matches insertion order (not namespace grouping)
    expect(allEvents[0].namespace).toBe('customerSubscriptions')
    expect(allEvents[0].entityId).toBe('sub_1')

    expect(allEvents[1].namespace).toBe('subscriptionItems')
    expect(allEvents[1].entityId).toBe('item_1')

    expect(allEvents[2].namespace).toBe('invoices')
    expect(allEvents[2].entityId).toBe('inv_1')

    expect(allEvents[3].namespace).toBe('customerSubscriptions')
    expect(allEvents[3].entityId).toBe('sub_2')

    // Client can filter by namespace if needed
    const subscriptionEvents = allEvents.filter(
      (e) => e.namespace === 'customerSubscriptions'
    )
    expect(subscriptionEvents.length).toBe(2)
    expect(subscriptionEvents[0].entityId).toBe('sub_1')
    expect(subscriptionEvents[1].entityId).toBe('sub_2')
  })
})
