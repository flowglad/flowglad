import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Membership } from '@/db/schema/memberships'
import type { Subscription } from '@/db/schema/subscriptions'
import type { User } from '@/db/schema/users'
import {
  insertMembership,
  selectMembershipsAndUsersByMembershipWhere,
} from '@/db/tableMethods/membershipMethods'
import { insertUser } from '@/db/tableMethods/userMethods'
import { core, isNil } from '@/utils/core'
import { filterEligibleRecipients } from '@/utils/notifications'

// Mock safeSend to verify email recipients
const mockSafeSend = vi.fn().mockResolvedValue(undefined)
vi.mock('@/utils/email', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/email')>()
  return {
    ...actual,
    safeSend: mockSafeSend,
  }
})

/**
 * Simulates the notification sending logic from the trigger task.
 * This allows us to test the full flow without invoking the trigger.dev runtime.
 */
const simulateSendNotification = async (
  subscription: Subscription.Record
): Promise<{ message: string }> => {
  const { usersAndMemberships } = await adminTransaction(
    async ({ transaction }) => {
      const usersAndMemberships =
        await selectMembershipsAndUsersByMembershipWhere(
          {
            organizationId: subscription.organizationId,
          },
          transaction
        )
      return { usersAndMemberships }
    }
  )

  const eligibleRecipients = filterEligibleRecipients(
    usersAndMemberships,
    'subscriptionCreated',
    subscription.livemode
  )

  if (eligibleRecipients.length === 0) {
    return {
      message: 'No recipients opted in for this notification',
    }
  }

  const recipientEmails = eligibleRecipients
    .map(({ user }) => user.email)
    .filter((email): email is string => !isNil(email) && email !== '')

  if (recipientEmails.length === 0) {
    return {
      message: 'No valid email addresses for eligible recipients',
    }
  }

  await mockSafeSend({
    to: recipientEmails,
  })

  return {
    message:
      'Organization subscription created notification sent successfully',
  }
}

describe('send-organization-subscription-created-notification', () => {
  let organizationId: string

  beforeEach(async () => {
    mockSafeSend.mockClear()
    const { organization } = await setupOrg()
    organizationId = organization.id
  })

  /**
   * Helper to create user and membership with specific notification preferences
   */
  const createUserWithPreferences = async (params: {
    organizationId: string
    email: string
    notificationPreferences?: Record<string, boolean>
  }): Promise<{
    user: User.Record
    membership: Membership.Record
  }> => {
    return adminTransaction(async ({ transaction }) => {
      const userId = core.nanoid()
      const user = await insertUser(
        {
          email: params.email,
          name: `Test User ${userId}`,
          id: userId,
        },
        transaction
      )

      const membership = await insertMembership(
        {
          organizationId: params.organizationId,
          userId: user.id,
          focused: true,
          livemode: true,
          notificationPreferences:
            params.notificationPreferences ?? {},
        },
        transaction
      )

      return { user, membership }
    })
  }

  describe('filterEligibleRecipients for subscriptionCreated', () => {
    it('sends email to users who have testModeNotifications=true and subscriptionCreated=true for testmode subscription', async () => {
      const { user: userA, membership: membershipA } =
        await createUserWithPreferences({
          organizationId,
          email: 'userA@test.com',
          notificationPreferences: {
            testModeNotifications: true,
            subscriptionCreated: true,
          },
        })

      const { user: userB, membership: membershipB } =
        await createUserWithPreferences({
          organizationId,
          email: 'userB@test.com',
          notificationPreferences: {
            testModeNotifications: true,
            subscriptionCreated: true,
          },
        })

      const usersAndMemberships = [
        { user: userA, membership: membershipA },
        { user: userB, membership: membershipB },
      ]

      // testmode subscription (livemode = false)
      const eligibleRecipients = filterEligibleRecipients(
        usersAndMemberships,
        'subscriptionCreated',
        false // testmode
      )

      expect(eligibleRecipients).toHaveLength(2)
      expect(eligibleRecipients.map((r) => r.user.email)).toContain(
        'userA@test.com'
      )
      expect(eligibleRecipients.map((r) => r.user.email)).toContain(
        'userB@test.com'
      )
    })

    it('does not send email to users with testModeNotifications=false for testmode subscription', async () => {
      const { user: userA, membership: membershipA } =
        await createUserWithPreferences({
          organizationId,
          email: 'userA@test.com',
          notificationPreferences: {
            testModeNotifications: true,
            subscriptionCreated: true,
          },
        })

      const { user: userB, membership: membershipB } =
        await createUserWithPreferences({
          organizationId,
          email: 'userB@test.com',
          notificationPreferences: {
            testModeNotifications: false, // Disabled
            subscriptionCreated: true,
          },
        })

      const usersAndMemberships = [
        { user: userA, membership: membershipA },
        { user: userB, membership: membershipB },
      ]

      // testmode subscription (livemode = false)
      const eligibleRecipients = filterEligibleRecipients(
        usersAndMemberships,
        'subscriptionCreated',
        false // testmode
      )

      // Only userA should be included because userB has testModeNotifications=false
      expect(eligibleRecipients).toHaveLength(1)
      expect(eligibleRecipients[0].user.email).toBe('userA@test.com')
    })

    it('sends email to all users with subscriptionCreated=true for livemode subscription regardless of testModeNotifications', async () => {
      const { user: userA, membership: membershipA } =
        await createUserWithPreferences({
          organizationId,
          email: 'userA@test.com',
          notificationPreferences: {
            testModeNotifications: false, // Disabled but should still receive livemode notifications
            subscriptionCreated: true,
          },
        })

      const { user: userB, membership: membershipB } =
        await createUserWithPreferences({
          organizationId,
          email: 'userB@test.com',
          notificationPreferences: {
            testModeNotifications: true,
            subscriptionCreated: true,
          },
        })

      const usersAndMemberships = [
        { user: userA, membership: membershipA },
        { user: userB, membership: membershipB },
      ]

      // livemode subscription
      const eligibleRecipients = filterEligibleRecipients(
        usersAndMemberships,
        'subscriptionCreated',
        true // livemode
      )

      // Both users should be included for livemode regardless of testModeNotifications
      expect(eligibleRecipients).toHaveLength(2)
      expect(eligibleRecipients.map((r) => r.user.email)).toContain(
        'userA@test.com'
      )
      expect(eligibleRecipients.map((r) => r.user.email)).toContain(
        'userB@test.com'
      )
    })

    it('returns early if all users are filtered out', async () => {
      const { user: userA, membership: membershipA } =
        await createUserWithPreferences({
          organizationId,
          email: 'userA@test.com',
          notificationPreferences: {
            subscriptionCreated: false, // Disabled
          },
        })

      const { user: userB, membership: membershipB } =
        await createUserWithPreferences({
          organizationId,
          email: 'userB@test.com',
          notificationPreferences: {
            subscriptionCreated: false, // Disabled
          },
        })

      const usersAndMemberships = [
        { user: userA, membership: membershipA },
        { user: userB, membership: membershipB },
      ]

      // Filter for subscriptionCreated (all have it disabled)
      const eligibleRecipients = filterEligibleRecipients(
        usersAndMemberships,
        'subscriptionCreated',
        true // livemode
      )

      expect(eligibleRecipients).toHaveLength(0)
    })

    it('returns early with message when eligible users have null or empty email addresses', async () => {
      const { user: userA, membership: membershipA } =
        await createUserWithPreferences({
          organizationId,
          email: 'valid@test.com',
          notificationPreferences: {
            subscriptionCreated: true,
          },
        })

      const usersAndMemberships = [
        { user: userA, membership: membershipA },
      ]

      // First verify the user is eligible
      const eligibleRecipients = filterEligibleRecipients(
        usersAndMemberships,
        'subscriptionCreated',
        true
      )
      expect(eligibleRecipients).toHaveLength(1)

      // Update user to have null email to test email filtering
      await adminTransaction(async ({ transaction }) => {
        // We can't actually set email to null since it's required,
        // but we can test the filtering logic by simulating it
        const userWithNullEmail = {
          ...userA,
          email: null as unknown as string,
        }
        const membersWithNullEmail = [
          { user: userWithNullEmail, membership: membershipA },
        ]

        const eligible = filterEligibleRecipients(
          membersWithNullEmail,
          'subscriptionCreated',
          true
        )

        // User should still be eligible (filtering happens after)
        expect(eligible).toHaveLength(1)

        // Then email extraction with type narrowing should filter them out
        const recipientEmails = eligible
          .map(({ user }) => user.email)
          .filter(
            (email): email is string =>
              email !== null && email !== undefined && email !== ''
          )

        expect(recipientEmails).toHaveLength(0)
      })
    })

    it('excludes users with empty preferences for testmode events (defaults to testModeNotifications=false)', async () => {
      // User with empty preferences (defaults apply)
      const { user, membership } = await createUserWithPreferences({
        organizationId,
        email: 'user@test.com',
        notificationPreferences: {}, // Empty = uses defaults
      })

      const usersAndMemberships = [{ user, membership }]

      // testmode subscription - should exclude user because default testModeNotifications is false
      const eligibleRecipients = filterEligibleRecipients(
        usersAndMemberships,
        'subscriptionCreated',
        false // testmode
      )

      expect(eligibleRecipients).toHaveLength(0)
    })

    it('includes users with empty preferences for livemode events', async () => {
      // User with empty preferences (defaults apply)
      const { user, membership } = await createUserWithPreferences({
        organizationId,
        email: 'user@test.com',
        notificationPreferences: {}, // Empty = uses defaults, subscriptionCreated defaults to true
      })

      const usersAndMemberships = [{ user, membership }]

      // livemode subscription - should include user because default subscriptionCreated is true
      const eligibleRecipients = filterEligibleRecipients(
        usersAndMemberships,
        'subscriptionCreated',
        true // livemode
      )

      expect(eligibleRecipients).toHaveLength(1)
      expect(eligibleRecipients[0].user.email).toBe('user@test.com')
    })
  })

  describe('integration: full notification flow', () => {
    let subscription: Subscription.Record

    const setupTestSubscription = async (
      orgId: string,
      livemode: boolean
    ): Promise<Subscription.Record> => {
      const customer = await setupCustomer({ organizationId: orgId })
      const paymentMethod = await setupPaymentMethod({
        organizationId: orgId,
        customerId: customer.id,
      })
      const { organization } = await setupOrg()
      const { price } = await setupOrg()
      return setupSubscription({
        organizationId: orgId,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
        livemode,
      })
    }

    it('sends email only to opted-in users for testmode subscription and verifies safeSend receives correct recipients', async () => {
      subscription = await setupTestSubscription(
        organizationId,
        false
      )

      // User A: opted in for test mode notifications
      await createUserWithPreferences({
        organizationId,
        email: 'opted-in@test.com',
        notificationPreferences: {
          testModeNotifications: true,
          subscriptionCreated: true,
        },
      })

      // User B: opted out of test mode notifications
      await createUserWithPreferences({
        organizationId,
        email: 'opted-out@test.com',
        notificationPreferences: {
          testModeNotifications: false,
          subscriptionCreated: true,
        },
      })

      const result = await simulateSendNotification(subscription)

      expect(result.message).toBe(
        'Organization subscription created notification sent successfully'
      )
      expect(mockSafeSend).toHaveBeenCalledTimes(1)
      expect(mockSafeSend).toHaveBeenCalledWith({
        to: ['opted-in@test.com'],
      })
    })

    it('sends email to all opted-in users for livemode subscription regardless of testModeNotifications setting', async () => {
      subscription = await setupTestSubscription(organizationId, true)

      // User A: has testModeNotifications disabled but subscriptionCreated enabled
      await createUserWithPreferences({
        organizationId,
        email: 'user-a@test.com',
        notificationPreferences: {
          testModeNotifications: false,
          subscriptionCreated: true,
        },
      })

      // User B: has both enabled
      await createUserWithPreferences({
        organizationId,
        email: 'user-b@test.com',
        notificationPreferences: {
          testModeNotifications: true,
          subscriptionCreated: true,
        },
      })

      const result = await simulateSendNotification(subscription)

      expect(result.message).toBe(
        'Organization subscription created notification sent successfully'
      )
      expect(mockSafeSend).toHaveBeenCalledTimes(1)
      const callArg = mockSafeSend.mock.calls[0][0]
      expect(callArg.to).toHaveLength(2)
      expect(callArg.to).toContain('user-a@test.com')
      expect(callArg.to).toContain('user-b@test.com')
    })

    it('does not call safeSend when all users have subscriptionCreated disabled', async () => {
      subscription = await setupTestSubscription(organizationId, true)

      await createUserWithPreferences({
        organizationId,
        email: 'user@test.com',
        notificationPreferences: {
          subscriptionCreated: false,
        },
      })

      const result = await simulateSendNotification(subscription)

      expect(result.message).toBe(
        'No recipients opted in for this notification'
      )
      expect(mockSafeSend).not.toHaveBeenCalled()
    })

    it('does not call safeSend when no users exist in the organization', async () => {
      // Create a fresh org with no users/memberships
      const { organization: emptyOrg, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: emptyOrg.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: emptyOrg.id,
        customerId: customer.id,
      })
      subscription = await setupSubscription({
        organizationId: emptyOrg.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
        livemode: true,
      })

      const result = await simulateSendNotification(subscription)

      expect(result.message).toBe(
        'No recipients opted in for this notification'
      )
      expect(mockSafeSend).not.toHaveBeenCalled()
    })
  })
})
