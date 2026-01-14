import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { isNil } from '@/utils/core'
import { createUserWithPreferences } from './notification-test-utils'

const mockSendPayoutsEnabledEmail = vi
  .fn()
  .mockResolvedValue(undefined)

vi.mock('@/utils/email', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/email')>()
  return {
    ...actual,
    sendOrganizationPayoutsEnabledNotificationEmail:
      mockSendPayoutsEnabledEmail,
  }
})

/**
 * Simulates the payouts-enabled notification trigger task logic.
 * Note: This trigger always treats events as livemode (livemode=true).
 * Account-level notifications are sent to all members (no specific preference).
 */
const simulateSendPayoutsEnabledNotification = async (
  organizationId: string
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

  // Payouts enabled is always a livemode event - send to all members
  // (no specific notification preference exists for account-level notifications)
  const eligibleRecipients = usersAndMemberships

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

  await mockSendPayoutsEnabledEmail({
    to: recipientEmails,
  })

  return {
    message:
      'Organization payouts enabled notification sent successfully',
  }
}

describe('send-organization-payouts-enabled-notification', () => {
  let organizationId: string

  beforeEach(async () => {
    mockSendPayoutsEnabledEmail.mockClear()
    const { organization } = await setupOrg()
    organizationId = organization.id
  })

  describe('recipient filtering for payoutsEnabled notifications', () => {
    it('sends notifications to all organization members regardless of notification preferences', async () => {
      // Account-level notifications like payouts enabled are sent to all members
      await createUserWithPreferences({
        organizationId,
        email: 'user1@test.com',
        notificationPreferences: {
          testModeNotifications: false,
          subscriptionCreated: false,
        },
      })

      await createUserWithPreferences({
        organizationId,
        email: 'user2@test.com',
        notificationPreferences: {
          testModeNotifications: true,
          subscriptionCreated: true,
        },
      })

      const result =
        await simulateSendPayoutsEnabledNotification(organizationId)

      expect(result.message).toBe(
        'Organization payouts enabled notification sent successfully'
      )
      expect(mockSendPayoutsEnabledEmail).toHaveBeenCalledTimes(1)
      const callArg = mockSendPayoutsEnabledEmail.mock.calls[0][0]
      expect(callArg.to).toHaveLength(2)
      expect(callArg.to).toContain('user1@test.com')
      expect(callArg.to).toContain('user2@test.com')
    })

    it('returns early when no users exist in the organization', async () => {
      const { organization: emptyOrg } = await setupOrg()

      const result = await simulateSendPayoutsEnabledNotification(
        emptyOrg.id
      )

      expect(result.message).toBe(
        'No recipients opted in for this notification'
      )
      expect(mockSendPayoutsEnabledEmail).not.toHaveBeenCalled()
    })

    it('sends email to users with default/empty preferences', async () => {
      await createUserWithPreferences({
        organizationId,
        email: 'default-prefs@test.com',
        notificationPreferences: {},
      })

      const result =
        await simulateSendPayoutsEnabledNotification(organizationId)

      expect(result.message).toBe(
        'Organization payouts enabled notification sent successfully'
      )
      expect(mockSendPayoutsEnabledEmail).toHaveBeenCalledWith({
        to: ['default-prefs@test.com'],
      })
    })
  })
})
