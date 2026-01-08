import { beforeEach, describe, expect, it } from 'vitest'
import { setupOrg } from '@/../seedDatabase'
import { EventNoun, FlowgladEventType } from '@/types'
import { hashData } from '@/utils/backendCore'
import { CacheDependency } from '@/utils/cache'
import { comprehensiveAdminTransaction } from './adminTransaction'
import type { Event } from './schema/events'
import type { Organization } from './schema/organizations'

describe('comprehensiveAdminTransaction', () => {
  let testOrg: Organization.Record

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    testOrg = orgSetup.organization
  })

  it('returns result when cacheInvalidations are provided', async () => {
    const customerId = 'cust_admin_test_123'
    const subscriptionId = 'sub_admin_test_456'

    const cacheInvalidations = [
      CacheDependency.customer(customerId),
      CacheDependency.subscription(subscriptionId),
    ]

    const result = await comprehensiveAdminTransaction(async () => ({
      result: 'admin_transaction_completed',
      cacheInvalidations,
    }))

    expect(result).toBe('admin_transaction_completed')
  })

  it('returns result when cacheInvalidations field is omitted', async () => {
    const result = await comprehensiveAdminTransaction(async () => ({
      result: 'no_invalidations',
    }))

    expect(result).toBe('no_invalidations')
  })

  it('returns result when cacheInvalidations array is empty', async () => {
    const result = await comprehensiveAdminTransaction(async () => ({
      result: 'empty_array',
      cacheInvalidations: [],
    }))

    expect(result).toBe('empty_array')
  })

  it('propagates errors from transaction callback', async () => {
    await expect(
      comprehensiveAdminTransaction(async () => {
        throw new Error('Admin transaction rolled back')
      })
    ).rejects.toThrow('Admin transaction rolled back')
  })

  it('returns result when transaction includes both events and cacheInvalidations', async () => {
    const mockEvents: Event.Insert[] = [
      {
        type: FlowgladEventType.PaymentSucceeded,
        livemode: true,
        payload: {
          object: EventNoun.Payment,
          id: 'test_admin_event_cache',
          customer: {
            id: 'test_customer_id',
            externalId: 'test_external_id',
          },
        },
        organizationId: testOrg.id,
        metadata: {},
        hash: hashData(`${testOrg.id}-admin-cache-test`),
        occurredAt: Date.now(),
        submittedAt: Date.now(),
        processedAt: null,
      },
    ]

    const result = await comprehensiveAdminTransaction(async () => ({
      result: 'combined_admin_output',
      eventsToInsert: mockEvents,
      cacheInvalidations: [
        CacheDependency.customer('cust_admin_combined'),
      ],
    }))

    expect(result).toBe('combined_admin_output')
  })
})
