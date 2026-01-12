import { beforeEach, describe, expect, it } from 'vitest'
import { setupMemberships, setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type Membership,
  type NotificationPreferences,
} from '@/db/schema/memberships'
import {
  getMembershipNotificationPreferences,
  selectMembershipById,
  updateMembership,
} from './membershipMethods'

describe('memberships notificationPreferences', () => {
  let organizationId: string
  let membership: Membership.Record

  beforeEach(async () => {
    const { organization } = await setupOrg()
    organizationId = organization.id
    membership = await setupMemberships({ organizationId })
  })

  describe('getMembershipNotificationPreferences', () => {
    it('defaults to empty object for new memberships and getMembershipNotificationPreferences returns expected defaults', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Fetch the fresh membership to verify the column value
        const freshMembership = await selectMembershipById(
          membership.id,
          transaction
        )

        // The notificationPreferences column should be an empty object by default
        expect(freshMembership.notificationPreferences).toEqual({})

        // getMembershipNotificationPreferences should return testModeNotifications = false
        const prefs =
          getMembershipNotificationPreferences(freshMembership)
        expect(prefs.testModeNotifications).toBe(false)

        // getMembershipNotificationPreferences should return all 8 notification types as true (except testModeNotifications)
        expect(prefs.subscriptionCreated).toBe(true)
        expect(prefs.subscriptionAdjusted).toBe(true)
        expect(prefs.subscriptionCanceled).toBe(true)
        expect(prefs.subscriptionCancellationScheduled).toBe(true)
        expect(prefs.paymentFailed).toBe(true)
        expect(prefs.onboardingCompleted).toBe(true)
        expect(prefs.payoutsEnabled).toBe(true)

        // Verify the full shape matches defaults
        expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
      })
    })

    it('merges stored preferences with defaults correctly', async () => {
      // Update membership with partial preferences
      const partialPrefs: Partial<NotificationPreferences> = {
        testModeNotifications: true,
        subscriptionCreated: false,
      }

      await adminTransaction(async ({ transaction }) => {
        await updateMembership(
          {
            id: membership.id,
            notificationPreferences: partialPrefs,
          },
          transaction
        )

        // Fetch the updated membership
        const updatedMembership = await selectMembershipById(
          membership.id,
          transaction
        )

        // The stored preferences should have only the values we set
        expect(updatedMembership.notificationPreferences).toEqual(
          partialPrefs
        )

        // getMembershipNotificationPreferences should merge with defaults
        const prefs =
          getMembershipNotificationPreferences(updatedMembership)

        // testModeNotifications should be true (from stored value)
        expect(prefs.testModeNotifications).toBe(true)

        // subscriptionCreated should be false (from stored value)
        expect(prefs.subscriptionCreated).toBe(false)

        // All other 6 notification type preferences should return true (from defaults)
        expect(prefs.subscriptionAdjusted).toBe(true)
        expect(prefs.subscriptionCanceled).toBe(true)
        expect(prefs.subscriptionCancellationScheduled).toBe(true)
        expect(prefs.paymentFailed).toBe(true)
        expect(prefs.onboardingCompleted).toBe(true)
        expect(prefs.payoutsEnabled).toBe(true)
      })
    })

    it('returns all defaults when membership has empty preferences', async () => {
      await adminTransaction(async ({ transaction }) => {
        const freshMembership = await selectMembershipById(
          membership.id,
          transaction
        )

        // Verify preferences are empty
        expect(freshMembership.notificationPreferences).toEqual({})

        const prefs =
          getMembershipNotificationPreferences(freshMembership)

        // testModeNotifications should be false (default)
        expect(prefs.testModeNotifications).toBe(false)

        // All 7 notification type preferences should be true (defaults)
        expect(prefs.subscriptionCreated).toBe(true)
        expect(prefs.subscriptionAdjusted).toBe(true)
        expect(prefs.subscriptionCanceled).toBe(true)
        expect(prefs.subscriptionCancellationScheduled).toBe(true)
        expect(prefs.paymentFailed).toBe(true)
        expect(prefs.onboardingCompleted).toBe(true)
        expect(prefs.payoutsEnabled).toBe(true)
      })
    })

    it('returns stored preference value when set, defaults for unset', async () => {
      const partialPrefs: Partial<NotificationPreferences> = {
        testModeNotifications: true,
        subscriptionCreated: false,
        paymentFailed: false,
      }

      await adminTransaction(async ({ transaction }) => {
        await updateMembership(
          {
            id: membership.id,
            notificationPreferences: partialPrefs,
          },
          transaction
        )

        const updatedMembership = await selectMembershipById(
          membership.id,
          transaction
        )

        const prefs =
          getMembershipNotificationPreferences(updatedMembership)

        // Values we explicitly set
        expect(prefs.testModeNotifications).toBe(true)
        expect(prefs.subscriptionCreated).toBe(false)
        expect(prefs.paymentFailed).toBe(false)

        // All 5 other notification types should be true (defaults)
        expect(prefs.subscriptionAdjusted).toBe(true)
        expect(prefs.subscriptionCanceled).toBe(true)
        expect(prefs.subscriptionCancellationScheduled).toBe(true)
        expect(prefs.onboardingCompleted).toBe(true)
        expect(prefs.payoutsEnabled).toBe(true)
      })
    })
  })
})
