import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { isNil } from '@/utils/core'
import { filterEligibleRecipients } from '@/utils/notifications'
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

  // Onboarding completed is always a livemode event
  const eligibleRecipients = filterEligibleRecipients(
    usersAndMemberships,
    'onboardingCompleted',
    true // always livemode
  )

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
    it('always treats events as livemode, so testModeNotifications setting is ignored', async () => {
      // Both users should receive notification regardless of testModeNotifications
      // because onboarding completed is always a livemode event
      await createUserWithPreferences({
        organizationId,
        email: 'testmode-disabled@test.com',
        notificationPreferences: {
          testModeNotifications: false,
          onboardingCompleted: true,
        },
      })

      await createUserWithPreferences({
        organizationId,
        email: 'testmode-enabled@test.com',
        notificationPreferences: {
          testModeNotifications: true,
          onboardingCompleted: true,
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
      expect(callArg.to).toContain('testmode-disabled@test.com')
      expect(callArg.to).toContain('testmode-enabled@test.com')
    })

    it('sends email only to users with onboardingCompleted=true', async () => {
      await createUserWithPreferences({
        organizationId,
        email: 'opted-in@test.com',
        notificationPreferences: {
          onboardingCompleted: true,
        },
      })

      await createUserWithPreferences({
        organizationId,
        email: 'opted-out@test.com',
        notificationPreferences: {
          onboardingCompleted: false,
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
      expect(mockSendOnboardingEmail).toHaveBeenCalledWith({
        to: ['opted-in@test.com'],
      })
    })

    it('returns early when all users have onboardingCompleted disabled', async () => {
      await createUserWithPreferences({
        organizationId,
        email: 'user@test.com',
        notificationPreferences: {
          onboardingCompleted: false,
        },
      })

      const result =
        await simulateSendOnboardingCompletedNotification(
          organizationId
        )

      expect(result.message).toBe(
        'No recipients opted in for this notification'
      )
      expect(mockSendOnboardingEmail).not.toHaveBeenCalled()
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

    it('uses default preferences (onboardingCompleted=true) for users with empty preferences', async () => {
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
