import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { isNil } from '@/utils/core'
import { filterEligibleRecipients } from '@/utils/notifications'
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

  // Payouts enabled is always a livemode event
  const eligibleRecipients = filterEligibleRecipients(
    usersAndMemberships,
    'payoutsEnabled',
    true // always livemode
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
    it('always treats events as livemode, so testModeNotifications setting is ignored', async () => {
      // Both users should receive notification regardless of testModeNotifications
      // because payouts enabled is always a livemode event
      await createUserWithPreferences({
        organizationId,
        email: 'testmode-disabled@test.com',
        notificationPreferences: {
          testModeNotifications: false,
          payoutsEnabled: true,
        },
      })

      await createUserWithPreferences({
        organizationId,
        email: 'testmode-enabled@test.com',
        notificationPreferences: {
          testModeNotifications: true,
          payoutsEnabled: true,
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
      expect(callArg.to).toContain('testmode-disabled@test.com')
      expect(callArg.to).toContain('testmode-enabled@test.com')
    })

    it('sends email only to users with payoutsEnabled=true', async () => {
      await createUserWithPreferences({
        organizationId,
        email: 'opted-in@test.com',
        notificationPreferences: {
          payoutsEnabled: true,
        },
      })

      await createUserWithPreferences({
        organizationId,
        email: 'opted-out@test.com',
        notificationPreferences: {
          payoutsEnabled: false,
        },
      })

      const result =
        await simulateSendPayoutsEnabledNotification(organizationId)

      expect(result.message).toBe(
        'Organization payouts enabled notification sent successfully'
      )
      expect(mockSendPayoutsEnabledEmail).toHaveBeenCalledTimes(1)
      expect(mockSendPayoutsEnabledEmail).toHaveBeenCalledWith({
        to: ['opted-in@test.com'],
      })
    })

    it('returns early when all users have payoutsEnabled disabled', async () => {
      await createUserWithPreferences({
        organizationId,
        email: 'user@test.com',
        notificationPreferences: {
          payoutsEnabled: false,
        },
      })

      const result =
        await simulateSendPayoutsEnabledNotification(organizationId)

      expect(result.message).toBe(
        'No recipients opted in for this notification'
      )
      expect(mockSendPayoutsEnabledEmail).not.toHaveBeenCalled()
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

    it('uses default preferences (payoutsEnabled=true) for users with empty preferences', async () => {
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
