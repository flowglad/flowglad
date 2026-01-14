import { beforeEach, describe, expect, it } from 'vitest'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type {
  Membership,
  NotificationPreferences,
} from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import type { User } from '@/db/schema/users'
import {
  selectMemberships,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import type { TRPCApiContext } from '@/server/trpcContext'
import { organizationsRouter } from './organizationsRouter'

const createCaller = (
  organization: Organization.Record,
  apiKeyToken: string,
  user: User.Record,
  livemode: boolean = true
) => {
  return organizationsRouter.createCaller({
    organizationId: organization.id,
    organization,
    apiKey: apiKeyToken,
    livemode,
    environment: livemode ? ('live' as const) : ('test' as const),
    isApi: true,
    path: '',
    user,
    session: null,
  } as unknown as TRPCApiContext)
}

describe('organizationsRouter notification preferences', () => {
  let organization: Organization.Record
  let user: User.Record
  let membership: Membership.Record
  let apiKeyToken: string

  beforeEach(async () => {
    // Setup organization with API key
    const orgSetup = await setupOrg()
    organization = orgSetup.organization

    const userApiKeySetup = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    if (!userApiKeySetup.apiKey.token) {
      throw new Error('API key token not found after setup')
    }
    apiKeyToken = userApiKeySetup.apiKey.token
    user = userApiKeySetup.user

    // Get the membership that was created
    const memberships = await adminTransaction(
      async ({ transaction }) => {
        return selectMemberships(
          { userId: user.id, organizationId: organization.id },
          transaction
        )
      }
    )
    membership = memberships[0]
  })

  describe('getNotificationPreferences', () => {
    it('throws NOT_FOUND when user has no membership in the organization', async () => {
      // Setup a second organization to get a user without membership in the first org
      const secondOrgSetup = await setupOrg()
      const secondUserSetup = await setupUserAndApiKey({
        organizationId: secondOrgSetup.organization.id,
        livemode: true,
      })

      if (!secondUserSetup.apiKey.token) {
        throw new Error('Second user API key token not found')
      }

      // Create caller with secondUser's API key but targeting the first organization
      // This user has no membership in the first organization
      const caller = createCaller(
        organization,
        secondUserSetup.apiKey.token,
        secondUserSetup.user
      )

      await expect(
        caller.getNotificationPreferences()
      ).rejects.toThrow('Membership not found')
    })

    it('returns default preferences for new membership', async () => {
      const caller = createCaller(organization, apiKeyToken, user)

      const result = await caller.getNotificationPreferences()

      // Default values
      expect(result.testModeNotifications).toBe(true)
      expect(result.subscriptionCreated).toBe(true)
      expect(result.subscriptionAdjusted).toBe(true)
      expect(result.subscriptionCanceled).toBe(true)
      expect(result.subscriptionCancellationScheduled).toBe(true)
      expect(result.paymentFailed).toBe(true)
      expect(result.paymentSuccessful).toBe(true)
    })

    it('returns stored preferences merged with defaults', async () => {
      // Update membership with partial preferences
      await adminTransaction(async ({ transaction }) => {
        await updateMembership(
          {
            id: membership.id,
            notificationPreferences: {
              testModeNotifications: true,
              subscriptionCreated: false,
            },
          },
          transaction
        )
      })

      const caller = createCaller(organization, apiKeyToken, user)

      const result = await caller.getNotificationPreferences()

      // Set values
      expect(result.testModeNotifications).toBe(true)
      expect(result.subscriptionCreated).toBe(false)

      // Default values for unset preferences
      expect(result.subscriptionAdjusted).toBe(true)
      expect(result.subscriptionCanceled).toBe(true)
      expect(result.subscriptionCancellationScheduled).toBe(true)
      expect(result.paymentFailed).toBe(true)
      expect(result.paymentSuccessful).toBe(true)
    })
  })

  describe('updateNotificationPreferences', () => {
    it('throws NOT_FOUND when user has no membership in the organization', async () => {
      // Setup a second organization to get a user without membership in the first org
      const secondOrgSetup = await setupOrg()
      const secondUserSetup = await setupUserAndApiKey({
        organizationId: secondOrgSetup.organization.id,
        livemode: true,
      })

      if (!secondUserSetup.apiKey.token) {
        throw new Error('Second user API key token not found')
      }

      // Create caller with secondUser's API key but targeting the first organization
      const caller = createCaller(
        organization,
        secondUserSetup.apiKey.token,
        secondUserSetup.user
      )

      await expect(
        caller.updateNotificationPreferences({
          preferences: { testModeNotifications: true },
        })
      ).rejects.toThrow('Membership not found')
    })

    it('updates specified preferences while preserving unspecified ones', async () => {
      // First set some initial preferences
      const adminUpdatedMembership = await adminTransaction(
        async ({ transaction }) => {
          return updateMembership(
            {
              id: membership.id,
              notificationPreferences: {
                subscriptionCreated: false,
              },
            },
            transaction
          )
        }
      )

      const caller = createCaller(organization, apiKeyToken, user)

      // Update with new preferences
      const result = await caller.updateNotificationPreferences({
        preferences: {
          testModeNotifications: true,
          paymentFailed: false,
        },
      })

      // New values should be set
      expect(result.preferences.testModeNotifications).toBe(true)
      expect(result.preferences.paymentFailed).toBe(false)

      // Previously set value should be preserved
      expect(result.preferences.subscriptionCreated).toBe(false)

      // Verify the preferences were actually persisted
      const getResult = await caller.getNotificationPreferences()
      expect(getResult.testModeNotifications).toBe(true)
      expect(getResult.paymentFailed).toBe(false)
      expect(getResult.subscriptionCreated).toBe(false)
    })

    it('can update all preferences at once', async () => {
      const caller = createCaller(organization, apiKeyToken, user)

      const newPreferences: Partial<NotificationPreferences> = {
        testModeNotifications: true,
        subscriptionCreated: false,
        subscriptionAdjusted: false,
        subscriptionCanceled: false,
        subscriptionCancellationScheduled: false,
        paymentFailed: false,
        paymentSuccessful: false,
      }

      const result = await caller.updateNotificationPreferences({
        preferences: newPreferences,
      })

      expect(result.preferences).toMatchObject(newPreferences)

      // Verify persistence
      const getResult = await caller.getNotificationPreferences()
      expect(getResult.testModeNotifications).toBe(true)
      expect(getResult.subscriptionCreated).toBe(false)
      expect(getResult.subscriptionAdjusted).toBe(false)
      expect(getResult.subscriptionCanceled).toBe(false)
      expect(getResult.subscriptionCancellationScheduled).toBe(false)
      expect(getResult.paymentFailed).toBe(false)
      expect(getResult.paymentSuccessful).toBe(false)
    })

    it('handles toggling preferences back and forth', async () => {
      const caller = createCaller(organization, apiKeyToken, user)

      // Toggle testModeNotifications on
      await caller.updateNotificationPreferences({
        preferences: { testModeNotifications: true },
      })

      let result = await caller.getNotificationPreferences()
      expect(result.testModeNotifications).toBe(true)

      // Toggle it back off
      await caller.updateNotificationPreferences({
        preferences: { testModeNotifications: false },
      })

      result = await caller.getNotificationPreferences()
      expect(result.testModeNotifications).toBe(false)
    })
  })
})
