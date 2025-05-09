import { describe, expect, test } from 'vitest'
import { constructSubscriptionCreatedEventHash } from './eventHelpers'

describe('constructSubscriptionCreatedEventHash', () => {
  test('generates same hash for subscriptions with same id', () => {
    const sub1 = {
      id: 'sub_123',
      livemode: true,
    } as const

    const sub2 = {
      id: 'sub_123',
      livemode: true,
    } as const

    const hash1 = constructSubscriptionCreatedEventHash(sub1)
    const hash2 = constructSubscriptionCreatedEventHash(sub2)

    expect(hash1).toBe(hash2)
  })

  test('generates different hashes for different subscription ids', () => {
    const sub1 = {
      id: 'sub_123',
      livemode: true,
    } as const

    const sub2 = {
      id: 'sub_456',
      livemode: true,
    } as const

    const hash1 = constructSubscriptionCreatedEventHash(sub1)
    const hash2 = constructSubscriptionCreatedEventHash(sub2)

    expect(hash1).not.toBe(hash2)
  })
})
