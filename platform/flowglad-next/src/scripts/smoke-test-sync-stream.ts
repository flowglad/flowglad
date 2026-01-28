/**
 * Smoke test script for Redis Streams sync event infrastructure.
 *
 * Verifies that events can be pushed to Redis Streams and read back.
 * Run with: bun run sync:smoke-test
 *
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.
 */

import { redis } from '@/utils/redis'
import {
  appendSyncEvent,
  getSyncStreamInfo,
  getSyncStreamKey,
  readSyncEvents,
} from '@/utils/syncStream'

const TEST_SCOPE_ID = `smoke_test_${Date.now()}`

async function main() {
  console.log('🔥 Sync Stream Smoke Test\n')

  // Check Redis connection
  console.log('1. Checking Redis connection...')
  try {
    const client = redis()
    await client.ping()
    console.log('   ✅ Redis connected\n')
  } catch (error) {
    console.error(
      '   ❌ Redis connection failed:',
      error instanceof Error ? error.message : error
    )
    process.exit(1)
  }

  // Push a test event
  console.log('2. Pushing test event...')
  const streamKey = getSyncStreamKey(TEST_SCOPE_ID)
  console.log(`   Stream key: ${streamKey}`)

  try {
    const result = await appendSyncEvent({
      namespace: 'customerSubscriptions',
      entityId: 'smoke_test_entity',
      scopeId: TEST_SCOPE_ID,
      eventType: 'update',
      data: {
        test: true,
        timestamp: new Date().toISOString(),
      },
      livemode: false,
    })
    console.log(
      `   ✅ Event pushed with sequence: ${result.sequence}`
    )
    console.log(`   Event ID: ${result.id}\n`)
  } catch (error) {
    console.error(
      '   ❌ Failed to push event:',
      error instanceof Error ? error.message : error
    )
    process.exit(1)
  }

  // Verify event was written
  console.log('3. Verifying event in stream...')
  try {
    const info = await getSyncStreamInfo(TEST_SCOPE_ID)
    console.log(`   Stream length: ${info.length}`)
    console.log(`   First entry: ${info.firstEntry}`)
    console.log(`   Last entry: ${info.lastEntry}`)

    if (info.length === 0) {
      console.error('   ❌ Stream is empty after push')
      process.exit(1)
    }
    console.log('   ✅ Event verified in stream\n')
  } catch (error) {
    console.error(
      '   ❌ Failed to get stream info:',
      error instanceof Error ? error.message : error
    )
    process.exit(1)
  }

  // Read back the event
  console.log('4. Reading event back...')
  try {
    const events = await readSyncEvents({ scopeId: TEST_SCOPE_ID })
    if (events.length === 0) {
      console.error('   ❌ No events returned')
      process.exit(1)
    }

    const event = events[0]
    console.log(`   Namespace: ${event.namespace}`)
    console.log(`   Entity ID: ${event.entityId}`)
    console.log(`   Event type: ${event.eventType}`)
    console.log(`   Livemode: ${event.livemode}`)
    console.log(`   Data: ${JSON.stringify(event.data)}`)
    console.log('   ✅ Event read successfully\n')
  } catch (error) {
    console.error(
      '   ❌ Failed to read event:',
      error instanceof Error ? error.message : error
    )
    process.exit(1)
  }

  // Cleanup test stream
  console.log('5. Cleaning up test stream...')
  try {
    const client = redis()
    await client.del(streamKey)
    console.log('   ✅ Test stream deleted\n')
  } catch (error) {
    console.error(
      '   ⚠️  Failed to cleanup (non-fatal):',
      error instanceof Error ? error.message : error
    )
  }

  console.log('✅ Smoke test passed!')
}

main().catch((error) => {
  console.error('Smoke test failed:', error)
  process.exit(1)
})
