import { describe, expect, it } from 'vitest'
import type { Membership } from '@/db/schema/memberships'
import {
  filterEligibleRecipients,
  type UserAndMembership,
} from './notifications'

/**
 * Creates a mock membership with the given notification preferences.
 */
const createMockMembership = (
  notificationPreferences: Record<string, unknown> = {}
): Membership.Record => {
  return {
    id: `memb_${Math.random().toString(36).slice(2)}`,
    userId: `user_${Math.random().toString(36).slice(2)}`,
    organizationId: `org_${Math.random().toString(36).slice(2)}`,
    focused: true,
    livemode: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    position: 1,
    createdByCommit: null,
    updatedByCommit: null,
    notificationPreferences,
  } as Membership.Record
}

/**
 * Creates a mock user and membership pair.
 */
const createMockUserAndMembership = (
  email: string | null,
  notificationPreferences: Record<string, unknown> = {}
): UserAndMembership => ({
  user: { email },
  membership: createMockMembership(notificationPreferences),
})

describe('filterEligibleRecipients', () => {
  it('returns only users whose notification type preference is true for livemode events', () => {
    const users: UserAndMembership[] = [
      createMockUserAndMembership('user1@test.com', {
        subscriptionCreated: true,
      }),
      createMockUserAndMembership('user2@test.com', {
        subscriptionCreated: true,
      }),
      createMockUserAndMembership('user3@test.com', {
        subscriptionCreated: false,
      }),
    ]

    const result = filterEligibleRecipients(
      users,
      'subscriptionCreated',
      true
    )

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.user.email)).toEqual([
      'user1@test.com',
      'user2@test.com',
    ])
  })

  it('excludes users with testModeNotifications=false for testmode events even if notification type is enabled', () => {
    const users: UserAndMembership[] = [
      // User A: testModeNotifications = true, subscriptionCreated = true
      createMockUserAndMembership('userA@test.com', {
        testModeNotifications: true,
        subscriptionCreated: true,
      }),
      // User B: testModeNotifications = false, subscriptionCreated = true
      createMockUserAndMembership('userB@test.com', {
        testModeNotifications: false,
        subscriptionCreated: true,
      }),
    ]

    const result = filterEligibleRecipients(
      users,
      'subscriptionCreated',
      false // livemode = false (test mode)
    )

    expect(result).toHaveLength(1)
    expect(result[0].user.email).toBe('userA@test.com')
  })

  it('includes users with empty preferences for livemode events (defaults to notification type enabled)', () => {
    const users: UserAndMembership[] = [
      // User with empty notificationPreferences
      createMockUserAndMembership('user@test.com', {}),
    ]

    const result = filterEligibleRecipients(
      users,
      'subscriptionCreated',
      true // livemode
    )

    expect(result).toHaveLength(1)
    expect(result[0].user.email).toBe('user@test.com')
  })

  it('excludes users with empty preferences for testmode events (defaults to testModeNotifications=false)', () => {
    const users: UserAndMembership[] = [
      // User with empty notificationPreferences
      createMockUserAndMembership('user@test.com', {}),
    ]

    const result = filterEligibleRecipients(
      users,
      'subscriptionCreated',
      false // testmode
    )

    expect(result).toHaveLength(0)
  })

  it('handles multiple notification types correctly', () => {
    const users: UserAndMembership[] = [
      createMockUserAndMembership('user1@test.com', {
        paymentFailed: true,
        subscriptionCreated: false,
      }),
      createMockUserAndMembership('user2@test.com', {
        paymentFailed: false,
        subscriptionCreated: true,
      }),
    ]

    // Filter by paymentFailed
    const paymentFailedResults = filterEligibleRecipients(
      users,
      'paymentFailed',
      true
    )
    expect(paymentFailedResults).toHaveLength(1)
    expect(paymentFailedResults[0].user.email).toBe('user1@test.com')

    // Filter by subscriptionCreated
    const subscriptionCreatedResults = filterEligibleRecipients(
      users,
      'subscriptionCreated',
      true
    )
    expect(subscriptionCreatedResults).toHaveLength(1)
    expect(subscriptionCreatedResults[0].user.email).toBe(
      'user2@test.com'
    )
  })

  it('handles all notification preference types', () => {
    const preferenceKeys = [
      'subscriptionCreated',
      'subscriptionAdjusted',
      'subscriptionCanceled',
      'subscriptionCancellationScheduled',
      'paymentFailed',
      'onboardingCompleted',
      'payoutsEnabled',
    ] as const

    for (const key of preferenceKeys) {
      const userWithPrefEnabled = createMockUserAndMembership(
        'enabled@test.com',
        { [key]: true }
      )
      const userWithPrefDisabled = createMockUserAndMembership(
        'disabled@test.com',
        { [key]: false }
      )

      const result = filterEligibleRecipients(
        [userWithPrefEnabled, userWithPrefDisabled],
        key,
        true
      )

      expect(result).toHaveLength(1)
      expect(result[0].user.email).toBe('enabled@test.com')
    }
  })

  it('returns empty array when all users are filtered out', () => {
    const users: UserAndMembership[] = [
      createMockUserAndMembership('user1@test.com', {
        subscriptionCreated: false,
      }),
      createMockUserAndMembership('user2@test.com', {
        subscriptionCreated: false,
      }),
    ]

    const result = filterEligibleRecipients(
      users,
      'subscriptionCreated',
      true
    )

    expect(result).toHaveLength(0)
  })

  it('returns empty array when given empty input', () => {
    const result = filterEligibleRecipients(
      [],
      'subscriptionCreated',
      true
    )
    expect(result).toHaveLength(0)
  })
})
