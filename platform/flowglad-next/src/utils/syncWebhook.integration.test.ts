import { afterEach, beforeEach, expect, it } from 'bun:test'
import {
  CurrencyCode,
  IntervalUnit,
  InvoiceStatus,
  InvoiceType,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@db-core/enums'
import {
  cleanupRedisTestKeys,
  describeIfRedisKey,
  generateTestKeyPrefix,
  getRedisTestClient,
} from '@/test/redisIntegrationHelpers'
import type { SyncEvent, SyncEventInsert } from '@/types/sync'
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
 *
 * IMPORTANT: Sync event data contains the FULL entity state (not diffs).
 * Clients use this complete payload to replace their local copy of the entity.
 */

/**
 * Factory functions for creating realistic test payloads.
 * These match the structure of actual client-facing entity records.
 */
const createSubscriptionPayload = (
  id: string,
  overrides: {
    status?: SubscriptionStatus
    customerId?: string
    priceId?: string
  } = {}
) => ({
  id,
  customerId: overrides.customerId ?? 'cust_test123',
  organizationId: 'org_test456',
  pricingModelId: 'pm_test789',
  priceId: overrides.priceId ?? 'price_test001',
  status: overrides.status ?? SubscriptionStatus.Active,
  startDate: '2024-01-01T00:00:00.000Z',
  currentBillingPeriodStart: '2024-01-01T00:00:00.000Z',
  currentBillingPeriodEnd: '2024-02-01T00:00:00.000Z',
  interval: IntervalUnit.Month,
  intervalCount: 1,
  renews: true,
  livemode: true,
  current: true,
  name: 'Pro Plan',
  metadata: {},
  trialEnd: null,
  canceledAt: null,
  cancelScheduledAt: null,
  cancellationReason: null,
  defaultPaymentMethodId: 'pm_pay123',
  backupPaymentMethodId: null,
  billingCycleAnchorDate: '2024-01-01T00:00:00.000Z',
  isFreePlan: false,
  doNotCharge: false,
  replacedBySubscriptionId: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-15T12:00:00.000Z',
})

const createSubscriptionItemPayload = (
  id: string,
  overrides: {
    subscriptionId?: string
    quantity?: number
    unitPrice?: number
  } = {}
) => ({
  id,
  subscriptionId: overrides.subscriptionId ?? 'sub_test123',
  pricingModelId: 'pm_test789',
  priceId: 'price_test001',
  name: 'Pro Plan - Monthly',
  addedDate: '2024-01-01T00:00:00.000Z',
  unitPrice: overrides.unitPrice ?? 2999,
  quantity: overrides.quantity ?? 1,
  type: SubscriptionItemType.Static,
  metadata: {},
  expiredAt: null,
  manuallyCreated: false,
  livemode: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-15T12:00:00.000Z',
})

const createInvoicePayload = (
  id: string,
  overrides: {
    invoiceNumber?: string
    status?: InvoiceStatus
    totalAmount?: number
  } = {}
) => ({
  id,
  type: InvoiceType.Subscription,
  invoiceNumber: overrides.invoiceNumber ?? `INV-${id.slice(-6)}`,
  invoiceDate: '2024-01-01T00:00:00.000Z',
  dueDate: '2024-01-15T00:00:00.000Z',
  customerId: 'cust_test123',
  organizationId: 'org_test456',
  pricingModelId: 'pm_test789',
  subscriptionId: 'sub_test123',
  billingPeriodId: 'bp_test001',
  billingPeriodStartDate: '2024-01-01T00:00:00.000Z',
  billingPeriodEndDate: '2024-02-01T00:00:00.000Z',
  status: overrides.status ?? InvoiceStatus.Paid,
  currency: CurrencyCode.USD,
  pdfURL: null,
  receiptPdfURL: null,
  memo: null,
  bankPaymentOnly: false,
  ownerMembershipId: null,
  billingRunId: 'br_test001',
  taxRatePercentage: null,
  taxAmount: null,
  taxType: null,
  taxCountry: null,
  applicationFee: null,
  livemode: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-15T12:00:00.000Z',
})

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
    // Setup: Create a scope and append 5 subscription update events
    const scopeId = `${testKeyPrefix}_org_webhook_catchup:live`
    const streamKey = getSyncStreamKey(scopeId)
    keysToCleanup.push(streamKey)

    const sequences: string[] = []
    const subscriptionIds = [
      'sub_001',
      'sub_002',
      'sub_003',
      'sub_004',
      'sub_005',
    ]

    // Append 5 events with full subscription payloads
    // Each event represents the complete current state of the subscription
    for (let i = 0; i < 5; i++) {
      const subscriptionId = subscriptionIds[i]
      const event: SyncEventInsert = {
        namespace: 'customerSubscriptions',
        entityId: subscriptionId,
        scopeId,
        eventType: 'update',
        // Full entity payload - this is what clients use to replace their local copy
        data: createSubscriptionPayload(subscriptionId, {
          status:
            i < 3
              ? SubscriptionStatus.Active
              : SubscriptionStatus.PastDue,
          customerId: `cust_${100 + i}`,
        }),
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
    expect(catchupEvents[0].entityId).toBe('sub_004')
    expect(catchupEvents[1].entityId).toBe('sub_005')

    // Verify we received complete subscription payloads
    type SubscriptionPayload = ReturnType<
      typeof createSubscriptionPayload
    >
    const sub4Data = catchupEvents[0].data as SubscriptionPayload
    const sub5Data = catchupEvents[1].data as SubscriptionPayload

    expect(sub4Data.id).toBe('sub_004')
    expect(sub4Data.status).toBe(SubscriptionStatus.PastDue)
    expect(sub4Data.customerId).toBe('cust_103')
    expect(sub4Data.interval).toBe(IntervalUnit.Month)
    expect(sub4Data.renews).toBe(true)

    expect(sub5Data.id).toBe('sub_005')
    expect(sub5Data.status).toBe(SubscriptionStatus.PastDue)
    expect(sub5Data.customerId).toBe('cust_104')

    // Verify sequences are correct
    expect(catchupEvents[0].sequence).toBe(sequences[3])
    expect(catchupEvents[1].sequence).toBe(sequences[4])

    // Verify the webhook payload contains the latest sequence
    expect(webhookPayload.latestSequence).toBe(sequences[4])
  })

  it('webhook delivery failure does not lose events: events remain readable from stream regardless of webhook delivery status', async () => {
    // Setup: Create a scope and append subscription item events
    const scopeId = `${testKeyPrefix}_org_webhook_durable:live`
    const streamKey = getSyncStreamKey(scopeId)
    keysToCleanup.push(streamKey)

    const sequences: string[] = []
    const itemIds = ['si_001', 'si_002', 'si_003']

    // Append 3 subscription item events with full payloads
    for (let i = 0; i < 3; i++) {
      const itemId = itemIds[i]
      const event: SyncEventInsert = {
        namespace: 'subscriptionItems',
        entityId: itemId,
        scopeId,
        eventType: 'update',
        // Full entity payload representing the complete subscription item state
        data: createSubscriptionItemPayload(itemId, {
          subscriptionId: 'sub_parent123',
          quantity: i + 1,
          unitPrice: (i + 1) * 1000, // $10, $20, $30 in cents
        }),
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
    })

    // Verify the payload was created correctly (webhook would carry this)
    expect(failedWebhookPayload.latestSequence).toBe(sequences[2])

    // Even if webhook failed, merchant can still read all events from stream
    // This could happen via:
    // 1. A retry webhook that eventually succeeds
    // 2. A manual sync/poll initiated by the merchant
    // 3. The next webhook notification after more events are added
    const allEvents = await readSyncEvents({ scopeId })

    // All 3 events should still be readable
    expect(allEvents.length).toBe(3)
    expect(allEvents[0].entityId).toBe('si_001')
    expect(allEvents[1].entityId).toBe('si_002')
    expect(allEvents[2].entityId).toBe('si_003')

    // Verify complete subscription item payloads are preserved
    type SubscriptionItemPayload = ReturnType<
      typeof createSubscriptionItemPayload
    >
    const item1 = allEvents[0].data as SubscriptionItemPayload
    const item2 = allEvents[1].data as SubscriptionItemPayload
    const item3 = allEvents[2].data as SubscriptionItemPayload

    // Data integrity is preserved - quantities and prices match what was stored
    expect(item1.quantity).toBe(1)
    expect(item1.unitPrice).toBe(1000)
    expect(item1.subscriptionId).toBe('sub_parent123')
    expect(item1.type).toBe(SubscriptionItemType.Static)

    expect(item2.quantity).toBe(2)
    expect(item2.unitPrice).toBe(2000)

    expect(item3.quantity).toBe(3)
    expect(item3.unitPrice).toBe(3000)

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

    // Append 10 invoice events with full payloads
    for (let i = 0; i < 10; i++) {
      const invoiceId = `inv_${String(i).padStart(3, '0')}`
      const event: SyncEventInsert = {
        namespace: 'invoices',
        entityId: invoiceId,
        scopeId,
        eventType: 'update',
        // Full invoice payload - clients use this to replace their local copy
        data: createInvoicePayload(invoiceId, {
          invoiceNumber: `INV-2024-${String(i + 1).padStart(4, '0')}`,
          status: i < 5 ? InvoiceStatus.Paid : InvoiceStatus.Open,
        }),
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
    expect(batch1[0].entityId).toBe('inv_000')
    expect(batch1[2].entityId).toBe('inv_002')

    // Verify full invoice payloads
    type InvoicePayload = ReturnType<typeof createInvoicePayload>
    const firstInvoice = batch1[0].data as InvoicePayload
    expect(firstInvoice.invoiceNumber).toBe('INV-2024-0001')
    expect(firstInvoice.status).toBe(InvoiceStatus.Paid)
    expect(firstInvoice.type).toBe(InvoiceType.Subscription)
    expect(firstInvoice.currency).toBe(CurrencyCode.USD)

    // Use last sequence from batch1 to continue
    const batch2 = await readSyncEvents({
      scopeId,
      lastSequence: batch1[2].sequence,
      count: 3,
    })

    expect(batch2.length).toBe(3)
    expect(batch2[0].entityId).toBe('inv_003')
    expect(batch2[2].entityId).toBe('inv_005')

    // Continue from batch2
    const batch3 = await readSyncEvents({
      scopeId,
      lastSequence: batch2[2].sequence,
      count: 3,
    })

    expect(batch3.length).toBe(3)
    expect(batch3[0].entityId).toBe('inv_006')
    expect(batch3[2].entityId).toBe('inv_008')

    // Verify status transition in later invoices
    const laterInvoice = batch3[0].data as InvoicePayload
    expect(laterInvoice.status).toBe(InvoiceStatus.Open)

    // Final batch - only 1 event remaining
    const batch4 = await readSyncEvents({
      scopeId,
      lastSequence: batch3[2].sequence,
      count: 3,
    })

    expect(batch4.length).toBe(1)
    expect(batch4[0].entityId).toBe('inv_009')

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

    // Append events from different namespaces interleaved, each with full payloads
    await appendSyncEvent({
      namespace: 'customerSubscriptions',
      entityId: 'sub_mixed_1',
      scopeId,
      eventType: 'update',
      data: createSubscriptionPayload('sub_mixed_1', {
        status: SubscriptionStatus.Active,
      }),
      livemode: true,
    })

    await appendSyncEvent({
      namespace: 'subscriptionItems',
      entityId: 'si_mixed_1',
      scopeId,
      eventType: 'update',
      data: createSubscriptionItemPayload('si_mixed_1', {
        quantity: 5,
        unitPrice: 4999,
      }),
      livemode: true,
    })

    await appendSyncEvent({
      namespace: 'invoices',
      entityId: 'inv_mixed_1',
      scopeId,
      eventType: 'update',
      data: createInvoicePayload('inv_mixed_1', {
        invoiceNumber: 'INV-MIXED-001',
        status: InvoiceStatus.Paid,
      }),
      livemode: true,
    })

    await appendSyncEvent({
      namespace: 'customerSubscriptions',
      entityId: 'sub_mixed_2',
      scopeId,
      eventType: 'update',
      data: createSubscriptionPayload('sub_mixed_2', {
        status: SubscriptionStatus.Trialing,
      }),
      livemode: true,
    })

    // Read all events - they should be in insertion order
    const allEvents = await readSyncEvents({ scopeId })

    expect(allEvents.length).toBe(4)

    // Verify ordering matches insertion order (not namespace grouping)
    expect(allEvents[0].namespace).toBe('customerSubscriptions')
    expect(allEvents[0].entityId).toBe('sub_mixed_1')

    expect(allEvents[1].namespace).toBe('subscriptionItems')
    expect(allEvents[1].entityId).toBe('si_mixed_1')

    expect(allEvents[2].namespace).toBe('invoices')
    expect(allEvents[2].entityId).toBe('inv_mixed_1')

    expect(allEvents[3].namespace).toBe('customerSubscriptions')
    expect(allEvents[3].entityId).toBe('sub_mixed_2')

    // Verify each event has complete payload for its entity type
    type SubscriptionPayload = ReturnType<
      typeof createSubscriptionPayload
    >
    type SubscriptionItemPayload = ReturnType<
      typeof createSubscriptionItemPayload
    >
    type InvoicePayload = ReturnType<typeof createInvoicePayload>

    const sub1 = allEvents[0].data as SubscriptionPayload
    expect(sub1.status).toBe(SubscriptionStatus.Active)
    expect(sub1.interval).toBe(IntervalUnit.Month)

    const item1 = allEvents[1].data as SubscriptionItemPayload
    expect(item1.quantity).toBe(5)
    expect(item1.unitPrice).toBe(4999)
    expect(item1.type).toBe(SubscriptionItemType.Static)

    const inv1 = allEvents[2].data as InvoicePayload
    expect(inv1.invoiceNumber).toBe('INV-MIXED-001')
    expect(inv1.status).toBe(InvoiceStatus.Paid)
    expect(inv1.currency).toBe(CurrencyCode.USD)

    const sub2 = allEvents[3].data as SubscriptionPayload
    expect(sub2.status).toBe(SubscriptionStatus.Trialing)

    // Client can filter by namespace if needed
    const subscriptionEvents = allEvents.filter(
      (e: SyncEvent) => e.namespace === 'customerSubscriptions'
    )
    expect(subscriptionEvents.length).toBe(2)
    expect(subscriptionEvents[0].entityId).toBe('sub_mixed_1')
    expect(subscriptionEvents[1].entityId).toBe('sub_mixed_2')
  })

  it('reading from stream does NOT consume events: same events are returned on subsequent reads', async () => {
    // This verifies that Redis Streams are durable, NOT a queue.
    // Reading events does not remove them - they remain available for:
    // - Re-reading by the same merchant (e.g., after a crash/restart)
    // - Multiple instances/workers of the merchant's application
    // - Auditing and debugging
    const scopeId = `${testKeyPrefix}_org_stream_durability:live`
    const streamKey = getSyncStreamKey(scopeId)
    keysToCleanup.push(streamKey)

    // Append 3 subscription events
    const sequences: string[] = []
    for (let i = 0; i < 3; i++) {
      const subscriptionId = `sub_durable_${i}`
      const result = await appendSyncEvent({
        namespace: 'customerSubscriptions',
        entityId: subscriptionId,
        scopeId,
        eventType: 'update',
        data: createSubscriptionPayload(subscriptionId, {
          status: SubscriptionStatus.Active,
        }),
        livemode: true,
      })
      sequences.push(result.sequence)
    }

    // First read - merchant catches up
    const firstRead = await readSyncEvents({ scopeId })
    expect(firstRead.length).toBe(3)
    expect(firstRead.map((e: SyncEvent) => e.entityId)).toEqual([
      'sub_durable_0',
      'sub_durable_1',
      'sub_durable_2',
    ])

    // Second read - same merchant reads again (e.g., after restart)
    // Events should still be there
    const secondRead = await readSyncEvents({ scopeId })
    expect(secondRead.length).toBe(3)
    expect(secondRead.map((e: SyncEvent) => e.entityId)).toEqual([
      'sub_durable_0',
      'sub_durable_1',
      'sub_durable_2',
    ])

    // Third read - verify exact same sequences
    const thirdRead = await readSyncEvents({ scopeId })
    expect(thirdRead.map((e: SyncEvent) => e.sequence)).toEqual(
      sequences
    )

    // Payloads are identical across reads
    type SubscriptionPayload = ReturnType<
      typeof createSubscriptionPayload
    >
    const payload1 = firstRead[0].data as SubscriptionPayload
    const payload3 = thirdRead[0].data as SubscriptionPayload
    expect(payload1.id).toBe(payload3.id)
    expect(payload1.status).toBe(payload3.status)
    expect(payload1.customerId).toBe(payload3.customerId)
  })

  it('reading with cursor does not affect earlier events: all events remain accessible from stream start', async () => {
    // Verify that using lastSequence cursor only affects the read window,
    // not the actual stream contents. Earlier events remain accessible.
    const scopeId = `${testKeyPrefix}_org_cursor_nondestructive:live`
    const streamKey = getSyncStreamKey(scopeId)
    keysToCleanup.push(streamKey)

    // Append 5 events
    const sequences: string[] = []
    for (let i = 0; i < 5; i++) {
      const invoiceId = `inv_cursor_${i}`
      const result = await appendSyncEvent({
        namespace: 'invoices',
        entityId: invoiceId,
        scopeId,
        eventType: 'update',
        data: createInvoicePayload(invoiceId, {
          invoiceNumber: `INV-CURSOR-${i}`,
          status: InvoiceStatus.Paid,
        }),
        livemode: true,
      })
      sequences.push(result.sequence)
    }

    // Merchant reads starting from event 2 (skipping events 0, 1)
    const cursoredRead = await readSyncEvents({
      scopeId,
      lastSequence: sequences[1], // Read after event 1
    })
    expect(cursoredRead.length).toBe(3) // Events 2, 3, 4
    expect(cursoredRead.map((e: SyncEvent) => e.entityId)).toEqual([
      'inv_cursor_2',
      'inv_cursor_3',
      'inv_cursor_4',
    ])

    // Verify events 0 and 1 are still accessible from stream start
    const fromStartRead = await readSyncEvents({ scopeId })
    expect(fromStartRead.length).toBe(5) // All 5 events
    expect(fromStartRead.map((e: SyncEvent) => e.entityId)).toEqual([
      'inv_cursor_0',
      'inv_cursor_1',
      'inv_cursor_2',
      'inv_cursor_3',
      'inv_cursor_4',
    ])

    // Even after multiple cursored reads, stream start remains intact
    await readSyncEvents({ scopeId, lastSequence: sequences[3] }) // Skip to event 4
    await readSyncEvents({ scopeId, lastSequence: sequences[2] }) // Different cursor

    const finalCheck = await readSyncEvents({ scopeId })
    expect(finalCheck.length).toBe(5)
    expect(finalCheck[0].entityId).toBe('inv_cursor_0')
    expect(finalCheck[0].sequence).toBe(sequences[0])
  })

  it('multiple independent readers can read the same events from stream', async () => {
    // This simulates multiple webhook handlers or SDK instances
    // reading from the same scope. Each reader maintains independent
    // cursor state, but the stream contents are shared.
    const scopeId = `${testKeyPrefix}_org_multi_reader:live`
    const streamKey = getSyncStreamKey(scopeId)
    keysToCleanup.push(streamKey)

    // Append 4 subscription item events
    const sequences: string[] = []
    for (let i = 0; i < 4; i++) {
      const itemId = `si_multi_${i}`
      const result = await appendSyncEvent({
        namespace: 'subscriptionItems',
        entityId: itemId,
        scopeId,
        eventType: 'update',
        data: createSubscriptionItemPayload(itemId, {
          quantity: i + 1,
          unitPrice: (i + 1) * 1000,
        }),
        livemode: true,
      })
      sequences.push(result.sequence)
    }

    // Simulate Reader A: reads all events
    const readerA_events = await readSyncEvents({ scopeId })
    expect(readerA_events.length).toBe(4)

    // Simulate Reader B: also reads all events (independent reader)
    const readerB_events = await readSyncEvents({ scopeId })
    expect(readerB_events.length).toBe(4)

    // Both readers see identical data
    expect(readerA_events.map((e: SyncEvent) => e.sequence)).toEqual(
      readerB_events.map((e: SyncEvent) => e.sequence)
    )
    expect(readerA_events.map((e: SyncEvent) => e.entityId)).toEqual(
      readerB_events.map((e: SyncEvent) => e.entityId)
    )

    // Reader A advances their cursor
    const readerA_cursor = readerA_events[1].sequence // After event 1
    const readerA_catchup = await readSyncEvents({
      scopeId,
      lastSequence: readerA_cursor,
    })
    expect(readerA_catchup.length).toBe(2) // Events 2, 3

    // Reader B still has access to all events (independent cursor)
    const readerB_allEvents = await readSyncEvents({ scopeId })
    expect(readerB_allEvents.length).toBe(4)

    // Reader B can use a different cursor position
    const readerB_cursor = readerB_events[0].sequence // After event 0
    const readerB_catchup = await readSyncEvents({
      scopeId,
      lastSequence: readerB_cursor,
    })
    expect(readerB_catchup.length).toBe(3) // Events 1, 2, 3

    // Final verification: stream still has all events
    const finalRead = await readSyncEvents({ scopeId })
    expect(finalRead.length).toBe(4)
    type SubscriptionItemPayload = ReturnType<
      typeof createSubscriptionItemPayload
    >
    const lastItem = finalRead[3].data as SubscriptionItemPayload
    expect(lastItem.quantity).toBe(4)
    expect(lastItem.unitPrice).toBe(4000)
  })

  it('stream state after partial read: unread events remain, read events are preserved', async () => {
    // Simulates a merchant that reads in batches, then fails.
    // Verifies that both read and unread events remain in the stream.
    const scopeId = `${testKeyPrefix}_org_partial_read:live`
    const streamKey = getSyncStreamKey(scopeId)
    keysToCleanup.push(streamKey)

    // Append 6 events
    const sequences: string[] = []
    for (let i = 0; i < 6; i++) {
      const subscriptionId = `sub_partial_${i}`
      const result = await appendSyncEvent({
        namespace: 'customerSubscriptions',
        entityId: subscriptionId,
        scopeId,
        eventType: 'update',
        data: createSubscriptionPayload(subscriptionId, {
          status:
            i % 2 === 0
              ? SubscriptionStatus.Active
              : SubscriptionStatus.Canceled,
        }),
        livemode: true,
      })
      sequences.push(result.sequence)
    }

    // Merchant reads first 3 events
    const batch1 = await readSyncEvents({
      scopeId,
      count: 3,
    })
    expect(batch1.length).toBe(3)
    expect(batch1.map((e: SyncEvent) => e.entityId)).toEqual([
      'sub_partial_0',
      'sub_partial_1',
      'sub_partial_2',
    ])

    // Simulate: merchant processes batch1, saves cursor, then crashes
    const savedCursor = batch1[2].sequence

    // After recovery, merchant can:
    // 1. Continue from saved cursor
    const resumedRead = await readSyncEvents({
      scopeId,
      lastSequence: savedCursor,
    })
    expect(resumedRead.length).toBe(3)
    expect(resumedRead.map((e: SyncEvent) => e.entityId)).toEqual([
      'sub_partial_3',
      'sub_partial_4',
      'sub_partial_5',
    ])

    // 2. Re-read from start if needed (e.g., for verification)
    const fullReread = await readSyncEvents({ scopeId })
    expect(fullReread.length).toBe(6)

    // 3. Re-read the batch they already processed
    const reprocessBatch = await readSyncEvents({
      scopeId,
      count: 3,
    })
    expect(reprocessBatch.length).toBe(3)
    expect(reprocessBatch.map((e: SyncEvent) => e.entityId)).toEqual([
      'sub_partial_0',
      'sub_partial_1',
      'sub_partial_2',
    ])

    // Verify the full stream state is intact
    type SubscriptionPayload = ReturnType<
      typeof createSubscriptionPayload
    >
    const allEvents = await readSyncEvents({ scopeId })
    expect(allEvents.length).toBe(6)

    // Check alternating statuses are preserved
    expect((allEvents[0].data as SubscriptionPayload).status).toBe(
      SubscriptionStatus.Active
    )
    expect((allEvents[1].data as SubscriptionPayload).status).toBe(
      SubscriptionStatus.Canceled
    )
    expect((allEvents[2].data as SubscriptionPayload).status).toBe(
      SubscriptionStatus.Active
    )
    expect((allEvents[3].data as SubscriptionPayload).status).toBe(
      SubscriptionStatus.Canceled
    )
    expect((allEvents[4].data as SubscriptionPayload).status).toBe(
      SubscriptionStatus.Active
    )
    expect((allEvents[5].data as SubscriptionPayload).status).toBe(
      SubscriptionStatus.Canceled
    )
  })
})
