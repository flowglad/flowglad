import { describe, expect, it } from 'vitest'
import {
  type Membership,
  type NotificationPreferences,
} from '@/db/schema/memberships'
import type { User } from '@/db/schema/users'
import { filterEligibleRecipients } from './notifications'

// Helper to create a mock user
const createMockUser = (
  overrides: Partial<User.Record> = {}
): User.Record => ({
  id: `user_${Math.random().toString(36).slice(2)}`,
  email: 'test@example.com',
  name: 'Test User',
  clerkId: null,
  betterAuthId: null,
  stackAuthId: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  createdByCommit: null,
  updatedByCommit: null,
  position: 0,
  ...overrides,
})

// Helper to create a mock membership
const createMockMembership = (
  overrides: Partial<Membership.Record> = {},
  notificationPreferences: Partial<NotificationPreferences> = {}
): Membership.Record => ({
  id: `memb_${Math.random().toString(36).slice(2)}`,
  userId: `user_${Math.random().toString(36).slice(2)}`,
  organizationId: `org_${Math.random().toString(36).slice(2)}`,
  focused: true,
  livemode: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  createdByCommit: null,
  updatedByCommit: null,
  position: 0,
  notificationPreferences,
  ...overrides,
})

describe('filterEligibleRecipients', () => {
  it('returns only users whose notification type preference is true for livemode events', () => {
    // Setup: 3 users - 2 have subscriptionCreated: true (default), 1 has subscriptionCreated: false
    const userA = createMockUser({
      id: 'user_a',
      email: 'a@test.com',
    })
    const membershipA = createMockMembership(
      { userId: 'user_a' },
      {} // Empty = defaults, subscriptionCreated defaults to true
    )

    const userB = createMockUser({
      id: 'user_b',
      email: 'b@test.com',
    })
    const membershipB = createMockMembership(
      { userId: 'user_b' },
      { subscriptionCreated: true }
    )

    const userC = createMockUser({
      id: 'user_c',
      email: 'c@test.com',
    })
    const membershipC = createMockMembership(
      { userId: 'user_c' },
      { subscriptionCreated: false }
    )

    const usersAndMemberships = [
      { user: userA, membership: membershipA },
      { user: userB, membership: membershipB },
      { user: userC, membership: membershipC },
    ]

    // Action: filter for subscriptionCreated in livemode
    const result = filterEligibleRecipients(
      usersAndMemberships,
      'subscriptionCreated',
      true
    )

    // Expectation: returns the 2 users with preference enabled (A and B)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.user.id)).toContain('user_a')
    expect(result.map((r) => r.user.id)).toContain('user_b')
    expect(result.map((r) => r.user.id)).not.toContain('user_c')
  })

  it('excludes users with testModeNotifications=false for testmode events even if notification type is enabled', () => {
    const userA = createMockUser({
      id: 'user_a',
      email: 'a@test.com',
    })
    const membershipA = createMockMembership(
      { userId: 'user_a' },
      { testModeNotifications: true, subscriptionCreated: true }
    )

    const userB = createMockUser({
      id: 'user_b',
      email: 'b@test.com',
    })
    const membershipB = createMockMembership(
      { userId: 'user_b' },
      { testModeNotifications: false, subscriptionCreated: true }
    )

    const usersAndMemberships = [
      { user: userA, membership: membershipA },
      { user: userB, membership: membershipB },
    ]

    const result = filterEligibleRecipients(
      usersAndMemberships,
      'subscriptionCreated',
      false
    )

    expect(result).toHaveLength(1)
    expect(result[0].user.id).toBe('user_a')
  })

  it('includes users with empty preferences for livemode events', () => {
    const user = createMockUser({ id: 'user_a', email: 'a@test.com' })
    const membership = createMockMembership({ userId: 'user_a' }, {})

    const usersAndMemberships = [{ user, membership }]

    const result = filterEligibleRecipients(
      usersAndMemberships,
      'subscriptionCreated',
      true
    )

    expect(result).toHaveLength(1)
    expect(result[0].user.id).toBe('user_a')
  })

  it('includes users with empty preferences for testmode events (testModeNotifications defaults to true)', () => {
    const user = createMockUser({ id: 'user_a', email: 'a@test.com' })
    const membership = createMockMembership({ userId: 'user_a' }, {})

    const usersAndMemberships = [{ user, membership }]

    const result = filterEligibleRecipients(
      usersAndMemberships,
      'subscriptionCreated',
      false
    )

    expect(result).toHaveLength(1)
    expect(result[0].user.id).toBe('user_a')
  })

  it('correctly filters for different notification types', () => {
    const user = createMockUser({ id: 'user_a', email: 'a@test.com' })
    const membership = createMockMembership(
      { userId: 'user_a' },
      {
        subscriptionCreated: true,
        subscriptionCanceled: false,
        paymentFailed: true,
      }
    )

    const usersAndMemberships = [{ user, membership }]

    expect(
      filterEligibleRecipients(
        usersAndMemberships,
        'subscriptionCreated',
        true
      )
    ).toHaveLength(1)

    expect(
      filterEligibleRecipients(
        usersAndMemberships,
        'subscriptionCanceled',
        true
      )
    ).toHaveLength(0)

    expect(
      filterEligibleRecipients(
        usersAndMemberships,
        'paymentFailed',
        true
      )
    ).toHaveLength(1)

    expect(
      filterEligibleRecipients(
        usersAndMemberships,
        'subscriptionAdjusted',
        true
      )
    ).toHaveLength(1)
  })

  it('handles mixed scenarios with multiple users and different preferences', () => {
    const userA = createMockUser({ id: 'user_a' })
    const membershipA = createMockMembership(
      { userId: 'user_a' },
      { testModeNotifications: true, paymentFailed: true }
    )

    const userB = createMockUser({ id: 'user_b' })
    const membershipB = createMockMembership(
      { userId: 'user_b' },
      { testModeNotifications: false, paymentFailed: true }
    )

    const userC = createMockUser({ id: 'user_c' })
    const membershipC = createMockMembership(
      { userId: 'user_c' },
      { testModeNotifications: true, paymentFailed: false }
    )

    const userD = createMockUser({ id: 'user_d' })
    const membershipD = createMockMembership({ userId: 'user_d' }, {})

    const usersAndMemberships = [
      { user: userA, membership: membershipA },
      { user: userB, membership: membershipB },
      { user: userC, membership: membershipC },
      { user: userD, membership: membershipD },
    ]

    const livemodeResult = filterEligibleRecipients(
      usersAndMemberships,
      'paymentFailed',
      true
    )
    expect(livemodeResult).toHaveLength(3)
    expect(livemodeResult.map((r) => r.user.id)).toContain('user_a')
    expect(livemodeResult.map((r) => r.user.id)).toContain('user_b')
    expect(livemodeResult.map((r) => r.user.id)).toContain('user_d')

    const testmodeResult = filterEligibleRecipients(
      usersAndMemberships,
      'paymentFailed',
      false
    )
    // userA has testModeNotifications: true, paymentFailed: true -> included
    // userB has testModeNotifications: false, paymentFailed: true -> excluded
    // userC has testModeNotifications: true, paymentFailed: false -> excluded
    // userD has empty prefs (defaults: testModeNotifications: true, paymentFailed: true) -> included
    expect(testmodeResult).toHaveLength(2)
    expect(testmodeResult.map((r) => r.user.id)).toContain('user_a')
    expect(testmodeResult.map((r) => r.user.id)).toContain('user_d')
  })
})
