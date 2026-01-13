import type {
  Membership,
  NotificationPreferences,
} from '@/db/schema/memberships'
import type { User } from '@/db/schema/users'
import { getMembershipNotificationPreferences } from '@/db/tableMethods/membershipMethods'

/**
 * Notification preference keys that control whether a user receives a specific type of notification.
 * Excludes `testModeNotifications` which is handled separately.
 */
export type NotificationPreferenceKey = keyof Omit<
  NotificationPreferences,
  'testModeNotifications'
>

/**
 * A user paired with their membership record.
 * Used for filtering notification recipients based on their preferences.
 */
export interface UserAndMembership {
  user: User.Record
  membership: Membership.Record
}

/**
 * Filters users who are eligible to receive a specific notification type.
 *
 * This function handles both:
 * 1. Test mode filtering: Users with `testModeNotifications: false` are excluded for non-livemode events
 * 2. Notification type filtering: Users with the specific notification preference disabled are excluded
 *
 * @param usersAndMemberships - Array of user and membership pairs to filter
 * @param preferenceKey - The notification preference key to check (e.g., 'subscriptionCreated')
 * @param livemode - Whether the event is in livemode (true) or testmode (false)
 * @returns Array of users who should receive the notification
 */
export const filterEligibleRecipients = (
  usersAndMemberships: UserAndMembership[],
  preferenceKey: NotificationPreferenceKey,
  livemode: boolean
): UserAndMembership[] => {
  return usersAndMemberships.filter(({ membership }) => {
    const prefs = getMembershipNotificationPreferences(membership)
    // For testmode events, exclude users who have testModeNotifications disabled
    if (!livemode && !prefs.testModeNotifications) {
      return false
    }
    // Check if the user has the specific notification type enabled
    return prefs[preferenceKey]
  })
}
