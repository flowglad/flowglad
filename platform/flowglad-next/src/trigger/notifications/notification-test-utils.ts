import { adminTransaction } from '@/db/adminTransaction'
import type { Membership } from '@/db/schema/memberships'
import type { User } from '@/db/schema/users'
import { insertMembership } from '@/db/tableMethods/membershipMethods'
import { insertUser } from '@/db/tableMethods/userMethods'
import { core, isNil } from '@/utils/core'
import {
  filterEligibleRecipients,
  type NotificationPreferenceKey,
} from '@/utils/notifications'

/**
 * Helper to create user and membership with specific notification preferences for testing.
 */
export const createUserWithPreferences = async (params: {
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
        notificationPreferences: params.notificationPreferences ?? {},
      },
      transaction
    )

    return { user, membership }
  })
}

/**
 * Result type for simulated notification sends.
 */
export interface NotificationResult {
  message: string
  recipientEmails?: string[]
}

/**
 * Simulates the core notification filtering and email extraction logic
 * that all notification triggers share. This mirrors the actual trigger task logic
 * without requiring the trigger.dev runtime.
 *
 * @param usersAndMemberships - The users and memberships to filter
 * @param preferenceKey - The notification preference key to check
 * @param livemode - Whether this is a livemode event
 * @param mockSafeSend - The mock function to call when sending emails
 * @returns The result message and optionally the recipient emails
 */
export const simulateNotificationSend = async (
  usersAndMemberships: Array<{
    user: User.Record
    membership: Membership.Record
  }>,
  preferenceKey: NotificationPreferenceKey,
  livemode: boolean,
  mockSafeSend: ReturnType<typeof import('vitest').vi.fn>
): Promise<NotificationResult> => {
  const eligibleRecipients = filterEligibleRecipients(
    usersAndMemberships,
    preferenceKey,
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
    message: 'Notification sent successfully',
    recipientEmails,
  }
}
