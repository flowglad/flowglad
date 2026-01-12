import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { isNil } from '@/utils/core'
import { filterEligibleRecipients } from '@/utils/notifications'
import { createUserWithPreferences } from './notification-test-utils'

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
 * Simulates the subscription-adjusted notification trigger task logic.
 */
const simulateSendSubscriptionAdjustedNotification = async (
  organizationId: string,
  livemode: boolean
): Promise<{ message: string }> => {
  const { usersAndMemberships } = await adminTransaction(
    async ({ transaction }) => {
      const usersAndMemberships =
        await selectMembershipsAndUsersByMembershipWhere(
          { organizationId },
          transaction
        )
      return { usersAndMemberships }
    }
  )

  const eligibleRecipients = filterEligibleRecipients(
    usersAndMemberships,
    'subscriptionAdjusted',
    livemode
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
      'Organization subscription adjusted notification sent successfully',
  }
}

describe('send-organization-subscription-adjusted-notification', () => {
  let organizationId: string

  beforeEach(async () => {
    mockSafeSend.mockClear()
    const { organization } = await setupOrg()
    organizationId = organization.id
  })

  describe('recipient filtering for subscriptionAdjusted notifications', () => {
    it('sends email only to users with subscriptionAdjusted=true and testModeNotifications=true for testmode events', async () => {
      await createUserWithPreferences({
        organizationId,
        email: 'opted-in@test.com',
        notificationPreferences: {
          testModeNotifications: true,
          subscriptionAdjusted: true,
        },
      })

      await createUserWithPreferences({
        organizationId,
        email: 'testmode-disabled@test.com',
        notificationPreferences: {
          testModeNotifications: false,
          subscriptionAdjusted: true,
        },
      })

      const result =
        await simulateSendSubscriptionAdjustedNotification(
          organizationId,
          false
        )

      expect(result.message).toBe(
        'Organization subscription adjusted notification sent successfully'
      )
      expect(mockSafeSend).toHaveBeenCalledTimes(1)
      expect(mockSafeSend).toHaveBeenCalledWith({
        to: ['opted-in@test.com'],
      })
    })

    it('sends email to all users with subscriptionAdjusted=true for livemode events regardless of testModeNotifications', async () => {
      await createUserWithPreferences({
        organizationId,
        email: 'user-a@test.com',
        notificationPreferences: {
          testModeNotifications: false,
          subscriptionAdjusted: true,
        },
      })

      await createUserWithPreferences({
        organizationId,
        email: 'user-b@test.com',
        notificationPreferences: {
          testModeNotifications: true,
          subscriptionAdjusted: true,
        },
      })

      const result =
        await simulateSendSubscriptionAdjustedNotification(
          organizationId,
          true
        )

      expect(result.message).toBe(
        'Organization subscription adjusted notification sent successfully'
      )
      expect(mockSafeSend).toHaveBeenCalledTimes(1)
      const callArg = mockSafeSend.mock.calls[0][0]
      expect(callArg.to).toHaveLength(2)
      expect(callArg.to).toContain('user-a@test.com')
      expect(callArg.to).toContain('user-b@test.com')
    })

    it('does not call safeSend when all users have subscriptionAdjusted disabled', async () => {
      await createUserWithPreferences({
        organizationId,
        email: 'user@test.com',
        notificationPreferences: {
          subscriptionAdjusted: false,
        },
      })

      const result =
        await simulateSendSubscriptionAdjustedNotification(
          organizationId,
          true
        )

      expect(result.message).toBe(
        'No recipients opted in for this notification'
      )
      expect(mockSafeSend).not.toHaveBeenCalled()
    })

    it('does not call safeSend when no users exist in the organization', async () => {
      const { organization: emptyOrg } = await setupOrg()

      const result =
        await simulateSendSubscriptionAdjustedNotification(
          emptyOrg.id,
          true
        )

      expect(result.message).toBe(
        'No recipients opted in for this notification'
      )
      expect(mockSafeSend).not.toHaveBeenCalled()
    })

    it('uses default preferences (subscriptionAdjusted=true) for users with empty preferences in livemode', async () => {
      await createUserWithPreferences({
        organizationId,
        email: 'default-prefs@test.com',
        notificationPreferences: {},
      })

      const result =
        await simulateSendSubscriptionAdjustedNotification(
          organizationId,
          true
        )

      expect(result.message).toBe(
        'Organization subscription adjusted notification sent successfully'
      )
      expect(mockSafeSend).toHaveBeenCalledWith({
        to: ['default-prefs@test.com'],
      })
    })
  })
})
