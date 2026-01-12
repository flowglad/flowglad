import { beforeEach, describe, expect, it } from 'vitest'
import { setupMemberships, setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import {
  getMembershipNotificationPreferences,
  insertMembership,
  selectMembershipById,
  selectMemberships,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { insertUser } from '@/db/tableMethods/userMethods'
import core from '@/utils/core'

describe('memberships schema', () => {
  let organization: Organization.Record

  beforeEach(async () => {
    const setup = await setupOrg()
    organization = setup.organization
  })

  describe('notificationPreferences', () => {
    it('defaults to empty object for new memberships and getMembershipNotificationPreferences returns expected defaults', async () => {
      // setup: create a new membership without specifying notificationPreferences
      const membership = await adminTransaction(
        async ({ transaction }) => {
          const nanoid = core.nanoid()
          const user = await insertUser(
            {
              email: `test+${nanoid}@test.com`,
              name: `Test ${nanoid}`,
              id: core.nanoid(),
            },
            transaction
          )
          return insertMembership(
            {
              organizationId: organization.id,
              userId: user.id,
              focused: true,
              livemode: true,
            },
            transaction
          )
        }
      )

      // expectation: notificationPreferences column value is {}
      expect(membership.notificationPreferences).toEqual({})

      // expectation: getMembershipNotificationPreferences returns testModeNotifications = false
      const prefs = getMembershipNotificationPreferences(membership)
      expect(prefs.testModeNotifications).toBe(false)

      // expectation: getMembershipNotificationPreferences returns all 8 notification types as expected
      expect(prefs.subscriptionCreated).toBe(true)
      expect(prefs.subscriptionAdjusted).toBe(true)
      expect(prefs.subscriptionCanceled).toBe(true)
      expect(prefs.subscriptionCancellationScheduled).toBe(true)
      expect(prefs.paymentFailed).toBe(true)
      expect(prefs.onboardingCompleted).toBe(true)
      expect(prefs.payoutsEnabled).toBe(true)
    })

    it('merges stored preferences with defaults correctly', async () => {
      // setup: create membership with { testModeNotifications: true, subscriptionCreated: false }
      const membership = await adminTransaction(
        async ({ transaction }) => {
          const nanoid = core.nanoid()
          const user = await insertUser(
            {
              email: `test+${nanoid}@test.com`,
              name: `Test ${nanoid}`,
              id: core.nanoid(),
            },
            transaction
          )
          return insertMembership(
            {
              organizationId: organization.id,
              userId: user.id,
              focused: true,
              livemode: true,
              notificationPreferences: {
                testModeNotifications: true,
                subscriptionCreated: false,
              },
            },
            transaction
          )
        }
      )

      const prefs = getMembershipNotificationPreferences(membership)

      // expectation: getMembershipNotificationPreferences returns testModeNotifications = true
      expect(prefs.testModeNotifications).toBe(true)

      // expectation: getMembershipNotificationPreferences returns subscriptionCreated = false
      expect(prefs.subscriptionCreated).toBe(false)

      // expectation: all other notification type preferences return true (defaults)
      expect(prefs.subscriptionAdjusted).toBe(true)
      expect(prefs.subscriptionCanceled).toBe(true)
      expect(prefs.subscriptionCancellationScheduled).toBe(true)
      expect(prefs.paymentFailed).toBe(true)
      expect(prefs.onboardingCompleted).toBe(true)
      expect(prefs.payoutsEnabled).toBe(true)
    })

    it('allows updating notification preferences', async () => {
      // setup: create a membership and then update its preferences
      const membership = await setupMemberships({
        organizationId: organization.id,
      })

      // update preferences
      const updatedMembership = await adminTransaction(
        async ({ transaction }) => {
          return updateMembership(
            {
              id: membership.id,
              notificationPreferences: {
                testModeNotifications: true,
                subscriptionCreated: false,
                paymentFailed: false,
              },
            },
            transaction
          )
        }
      )

      // verify stored preferences
      expect(updatedMembership.notificationPreferences).toEqual({
        testModeNotifications: true,
        subscriptionCreated: false,
        paymentFailed: false,
      })

      // verify merged preferences
      const prefs =
        getMembershipNotificationPreferences(updatedMembership)
      expect(prefs.testModeNotifications).toBe(true)
      expect(prefs.subscriptionCreated).toBe(false)
      expect(prefs.paymentFailed).toBe(false)
      // defaults still apply for unset preferences
      expect(prefs.subscriptionAdjusted).toBe(true)
      expect(prefs.subscriptionCanceled).toBe(true)
      expect(prefs.subscriptionCancellationScheduled).toBe(true)
      expect(prefs.onboardingCompleted).toBe(true)
      expect(prefs.payoutsEnabled).toBe(true)
    })

    it('persists preferences when re-fetched from database', async () => {
      // setup: create membership with specific preferences
      const membership = await adminTransaction(
        async ({ transaction }) => {
          const nanoid = core.nanoid()
          const user = await insertUser(
            {
              email: `test+${nanoid}@test.com`,
              name: `Test ${nanoid}`,
              id: core.nanoid(),
            },
            transaction
          )
          return insertMembership(
            {
              organizationId: organization.id,
              userId: user.id,
              focused: true,
              livemode: true,
              notificationPreferences: {
                testModeNotifications: true,
                subscriptionCanceled: false,
              },
            },
            transaction
          )
        }
      )

      // re-fetch from database
      const refetchedMembership = await adminTransaction(
        async ({ transaction }) => {
          return selectMembershipById(membership.id, transaction)
        }
      )

      // verify preferences persisted correctly
      expect(refetchedMembership?.notificationPreferences).toEqual({
        testModeNotifications: true,
        subscriptionCanceled: false,
      })

      const prefs = getMembershipNotificationPreferences(
        refetchedMembership!
      )
      expect(prefs.testModeNotifications).toBe(true)
      expect(prefs.subscriptionCanceled).toBe(false)
      expect(prefs.subscriptionCreated).toBe(true)
    })
  })

  describe('DEFAULT_NOTIFICATION_PREFERENCES', () => {
    it('has testModeNotifications set to false', () => {
      expect(
        DEFAULT_NOTIFICATION_PREFERENCES.testModeNotifications
      ).toBe(false)
    })

    it('has all notification types set to true', () => {
      expect(
        DEFAULT_NOTIFICATION_PREFERENCES.subscriptionCreated
      ).toBe(true)
      expect(
        DEFAULT_NOTIFICATION_PREFERENCES.subscriptionAdjusted
      ).toBe(true)
      expect(
        DEFAULT_NOTIFICATION_PREFERENCES.subscriptionCanceled
      ).toBe(true)
      expect(
        DEFAULT_NOTIFICATION_PREFERENCES.subscriptionCancellationScheduled
      ).toBe(true)
      expect(DEFAULT_NOTIFICATION_PREFERENCES.paymentFailed).toBe(
        true
      )
      expect(
        DEFAULT_NOTIFICATION_PREFERENCES.onboardingCompleted
      ).toBe(true)
      expect(DEFAULT_NOTIFICATION_PREFERENCES.payoutsEnabled).toBe(
        true
      )
    })

    it('has exactly 8 notification preference keys', () => {
      const keys = Object.keys(DEFAULT_NOTIFICATION_PREFERENCES)
      expect(keys).toHaveLength(8)
      expect(keys).toContain('testModeNotifications')
      expect(keys).toContain('subscriptionCreated')
      expect(keys).toContain('subscriptionAdjusted')
      expect(keys).toContain('subscriptionCanceled')
      expect(keys).toContain('subscriptionCancellationScheduled')
      expect(keys).toContain('paymentFailed')
      expect(keys).toContain('onboardingCompleted')
      expect(keys).toContain('payoutsEnabled')
    })
  })
})
