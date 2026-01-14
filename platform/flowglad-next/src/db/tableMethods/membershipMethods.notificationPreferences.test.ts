import { beforeEach, describe, expect, it } from 'vitest'
import { setupMemberships, setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type Membership,
  type NotificationPreferences,
  notificationPreferencesSchema,
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
    it('returns expected defaults for new memberships via getMembershipNotificationPreferences', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Fetch the fresh membership
        const freshMembership = await selectMembershipById(
          membership.id,
          transaction
        )

        // getMembershipNotificationPreferences should return testModeNotifications = true (default)
        const prefs =
          getMembershipNotificationPreferences(freshMembership)
        expect(prefs.testModeNotifications).toBe(true)

        // getMembershipNotificationPreferences should return all 5 notification types as true
        expect(prefs.subscriptionCreated).toBe(true)
        expect(prefs.subscriptionAdjusted).toBe(true)
        expect(prefs.subscriptionCanceled).toBe(true)
        expect(prefs.subscriptionCancellationScheduled).toBe(true)
        expect(prefs.paymentFailed).toBe(true)

        // Verify the full shape matches defaults
        expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
      })
    })

    it('persists updated preferences and getMembershipNotificationPreferences returns them correctly', async () => {
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

        // getMembershipNotificationPreferences should return the updated values
        const prefs =
          getMembershipNotificationPreferences(updatedMembership)

        // testModeNotifications should be true (from stored value)
        expect(prefs.testModeNotifications).toBe(true)

        // subscriptionCreated should be false (from stored value)
        expect(prefs.subscriptionCreated).toBe(false)

        // All other 4 notification type preferences should return true (from defaults)
        expect(prefs.subscriptionAdjusted).toBe(true)
        expect(prefs.subscriptionCanceled).toBe(true)
        expect(prefs.subscriptionCancellationScheduled).toBe(true)
        expect(prefs.paymentFailed).toBe(true)
      })
    })

    it('returns all defaults for a fresh membership', async () => {
      await adminTransaction(async ({ transaction }) => {
        const freshMembership = await selectMembershipById(
          membership.id,
          transaction
        )

        const prefs =
          getMembershipNotificationPreferences(freshMembership)

        // testModeNotifications should be true (default)
        expect(prefs.testModeNotifications).toBe(true)

        // All 5 notification type preferences should be true (defaults)
        expect(prefs.subscriptionCreated).toBe(true)
        expect(prefs.subscriptionAdjusted).toBe(true)
        expect(prefs.subscriptionCanceled).toBe(true)
        expect(prefs.subscriptionCancellationScheduled).toBe(true)
        expect(prefs.paymentFailed).toBe(true)
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

        // All 3 other notification types should be true (defaults)
        expect(prefs.subscriptionAdjusted).toBe(true)
        expect(prefs.subscriptionCanceled).toBe(true)
        expect(prefs.subscriptionCancellationScheduled).toBe(true)
      })
    })

    it('rejects null values for notification preference fields via Zod validation', () => {
      const invalidPrefs = {
        subscriptionCreated: null,
      }

      expect(() =>
        notificationPreferencesSchema.partial().parse(invalidPrefs)
      ).toThrow()
    })
  })

  describe('notificationPreferencesSchema', () => {
    it('successfully parses an empty object and returns all defaults', () => {
      const result = notificationPreferencesSchema.parse({})

      expect(result.testModeNotifications).toBe(true)
      expect(result.subscriptionCreated).toBe(true)
      expect(result.subscriptionAdjusted).toBe(true)
      expect(result.subscriptionCanceled).toBe(true)
      expect(result.subscriptionCancellationScheduled).toBe(true)
      expect(result.paymentFailed).toBe(true)
    })

    it('DEFAULT_NOTIFICATION_PREFERENCES equals notificationPreferencesSchema.parse({})', () => {
      const parsedDefaults = notificationPreferencesSchema.parse({})
      expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual(parsedDefaults)
    })
  })
})
