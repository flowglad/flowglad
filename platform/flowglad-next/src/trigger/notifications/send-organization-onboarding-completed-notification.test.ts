import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { isNil } from '@/utils/core'
import { createUserWithPreferences } from './notification-test-utils'

const mockSafeSend = vi.fn().mockResolvedValue(undefined)
const mockSendOnboardingEmail = vi.fn().mockResolvedValue(undefined)

vi.mock('@/utils/email', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/email')>()
  return {
    ...actual,
    safeSend: mockSafeSend,
    sendOrganizationOnboardingCompletedNotificationEmail:
      mockSendOnboardingEmail,
  }
})

/**
 * Simulates the onboarding-completed notification trigger task logic.
 * Note: This trigger always treats events as livemode (livemode=true).
 * Account-level notifications are sent to all members (no specific preference).
 */
const simulateSendOnboardingCompletedNotification = async (
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

  // Onboarding completed is always a livemode event - send to all members
  // (no specific notification preference exists for account-level notifications)
  const eligibleRecipients = usersAndMemberships

  if (eligibleRecipients.length === 0) {
    // Note: The actual trigger still notifies Flowglad team here
    return {
      message: 'No recipients opted in for this notification',
    }
  }

  const recipientEmails = eligibleRecipients
    .map(({ user }) => user.email)
    .filter((email): email is string => !isNil(email) && email !== '')

  if (recipientEmails.length === 0) {
    // Note: The actual trigger still notifies Flowglad team here
    return {
      message: 'No valid email addresses for eligible recipients',
    }
  }

  await mockSendOnboardingEmail({
    to: recipientEmails,
  })

  return {
    message:
      'Organization onboarding completed notification sent successfully',
  }
}

describe('send-organization-onboarding-completed-notification', () => {
  let organizationId: string

  beforeEach(async () => {
    mockSafeSend.mockClear()
    mockSendOnboardingEmail.mockClear()
    const { organization } = await setupOrg()
    organizationId = organization.id
  })

  describe('recipient filtering for onboardingCompleted notifications', () => {
    it('sends notifications to all organization members regardless of notification preferences', async () => {
      // Account-level notifications like onboarding completed are sent to all members
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
        await simulateSendOnboardingCompletedNotification(
          organizationId
        )

      expect(result.message).toBe(
        'Organization onboarding completed notification sent successfully'
      )
      expect(mockSendOnboardingEmail).toHaveBeenCalledTimes(1)
      const callArg = mockSendOnboardingEmail.mock.calls[0][0]
      expect(callArg.to).toHaveLength(2)
      expect(callArg.to).toContain('user1@test.com')
      expect(callArg.to).toContain('user2@test.com')
    })

    it('returns early when no users exist in the organization', async () => {
      const { organization: emptyOrg } = await setupOrg()

      const result =
        await simulateSendOnboardingCompletedNotification(emptyOrg.id)

      expect(result.message).toBe(
        'No recipients opted in for this notification'
      )
      expect(mockSendOnboardingEmail).not.toHaveBeenCalled()
    })

    it('sends email to users with default/empty preferences', async () => {
      await createUserWithPreferences({
        organizationId,
        email: 'default-prefs@test.com',
        notificationPreferences: {},
      })

      const result =
        await simulateSendOnboardingCompletedNotification(
          organizationId
        )

      expect(result.message).toBe(
        'Organization onboarding completed notification sent successfully'
      )
      expect(mockSendOnboardingEmail).toHaveBeenCalledWith({
        to: ['default-prefs@test.com'],
      })
    })
  })
})
