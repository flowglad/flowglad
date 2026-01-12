import type {
  Membership,
  NotificationPreferences,
} from '@/db/schema/memberships'
import { getMembershipNotificationPreferences } from '@/db/tableMethods/membershipMethods'

/**
 * Keys for notification type preferences, excluding the testModeNotifications toggle.
 */
export type NotificationPreferenceKey = keyof Omit<
  NotificationPreferences,
  'testModeNotifications'
>

/**
 * Structure representing a user with their membership record.
 * Used for filtering eligible notification recipients.
 */
export interface UserAndMembership {
  user: { email: string | null }
  membership: Membership.Record
}

/**
 * Filters a list of users/memberships to find those eligible to receive a notification.
 *
 * Eligibility criteria:
 * 1. For test mode events (livemode=false): user must have testModeNotifications=true
 * 2. User must have the specific notification type preference enabled
 *
 * @param usersAndMemberships - Array of user and membership pairs to filter
 * @param preferenceKey - The notification type preference key to check
 * @param livemode - Whether this is a live mode event (true) or test mode event (false)
 * @returns Filtered array of users eligible to receive the notification
 */
export const filterEligibleRecipients = (
  usersAndMemberships: UserAndMembership[],
  preferenceKey: NotificationPreferenceKey,
  livemode: boolean
): UserAndMembership[] => {
  return usersAndMemberships.filter(({ membership }) => {
    const prefs = getMembershipNotificationPreferences(membership)
    if (!livemode && !prefs.testModeNotifications) {
      return false
    }
    return prefs[preferenceKey]
  })
}
