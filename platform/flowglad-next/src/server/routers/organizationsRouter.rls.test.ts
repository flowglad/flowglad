import { beforeEach, describe, expect, it } from 'bun:test'
import type { Membership } from '@db-core/schema/memberships'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '@db-core/schema/memberships'
import type { Organization } from '@db-core/schema/organizations'
import type { User } from '@db-core/schema/users'
import { TRPCError } from '@trpc/server'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
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

const createCallerWithoutOrg = (
  apiKeyToken: string,
  user: User.Record
) => {
  return organizationsRouter.createCaller({
    organizationId: undefined,
    organization: undefined,
    apiKey: apiKeyToken,
    livemode: true,
    environment: 'live' as const,
    isApi: true,
    path: '',
    user,
    session: null,
  } as unknown as TRPCApiContext)
}

describe('organizationsRouter - notification preferences', () => {
  let organization: Organization.Record
  let user: User.Record
  let membership: Membership.Record
  let apiKeyToken: string

  beforeEach(async () => {
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
    it('returns default notification preferences when none are set', async () => {
      const caller = createCaller(organization, apiKeyToken, user)

      const result = await caller.getNotificationPreferences()

      expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
      expect(result.testModeNotifications).toBe(true)
      expect(result.subscriptionCreated).toBe(true)
      expect(result.subscriptionAdjusted).toBe(true)
      expect(result.subscriptionCanceled).toBe(true)
      expect(result.subscriptionCancellationScheduled).toBe(true)
      expect(result.paymentFailed).toBe(true)
      expect(result.paymentSuccessful).toBe(true)
    })

    it('returns stored notification preferences merged with defaults', async () => {
      await adminTransaction(async ({ transaction }) => {
        const [membershipRecord] = await selectMemberships(
          { userId: user.id, organizationId: organization.id },
          transaction
        )
        await updateMembership(
          {
            id: membershipRecord.id,
            notificationPreferences: {
              testModeNotifications: true,
              subscriptionCreated: false,
            } as Partial<NotificationPreferences>,
          },
          transaction
        )
      })

      const caller = createCaller(organization, apiKeyToken, user)
      const result = await caller.getNotificationPreferences()

      expect(result.testModeNotifications).toBe(true)
      expect(result.subscriptionCreated).toBe(false)
      expect(result.subscriptionAdjusted).toBe(true)
      expect(result.subscriptionCanceled).toBe(true)
      expect(result.paymentFailed).toBe(true)
      expect(result.paymentSuccessful).toBe(true)
    })

    it('throws BAD_REQUEST when organizationId is missing', async () => {
      const callerWithoutOrg = createCallerWithoutOrg(
        apiKeyToken,
        user
      )

      const error = await callerWithoutOrg
        .getNotificationPreferences()
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('BAD_REQUEST')
      expect(error.message).toBe('organizationId is required')
    })

    it('throws NOT_FOUND when membership does not exist', async () => {
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
      const error = await caller
        .getNotificationPreferences()
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('NOT_FOUND')
      expect(error.message).toBe('Membership not found')
    })
  })

  describe('updateNotificationPreferences', () => {
    it('updates notification preferences and returns normalized result', async () => {
      const caller = createCaller(organization, apiKeyToken, user)

      const result = await caller.updateNotificationPreferences({
        preferences: {
          testModeNotifications: true,
          subscriptionCreated: false,
        },
      })

      expect(result.preferences.testModeNotifications).toBe(true)
      expect(result.preferences.subscriptionCreated).toBe(false)
      expect(result.preferences.subscriptionAdjusted).toBe(true)
      expect(result.preferences.subscriptionCanceled).toBe(true)
      expect(result.preferences.paymentFailed).toBe(true)
      expect(result.preferences.paymentSuccessful).toBe(true)

      const getResult = await caller.getNotificationPreferences()
      expect(getResult).toEqual(result.preferences)
    })

    it('merges partial updates with existing preferences', async () => {
      const caller = createCaller(organization, apiKeyToken, user)

      await caller.updateNotificationPreferences({
        preferences: {
          testModeNotifications: true,
          subscriptionCreated: false,
        },
      })

      const result = await caller.updateNotificationPreferences({
        preferences: {
          paymentFailed: false,
        },
      })

      expect(result.preferences.testModeNotifications).toBe(true)
      expect(result.preferences.subscriptionCreated).toBe(false)
      expect(result.preferences.paymentFailed).toBe(false)
      expect(result.preferences.subscriptionAdjusted).toBe(true)
    })

    it('returns all notification preference fields with defaults', async () => {
      const caller = createCaller(organization, apiKeyToken, user)

      const result = await caller.updateNotificationPreferences({
        preferences: {
          testModeNotifications: true,
        },
      })

      const expectedKeys = [
        'testModeNotifications',
        'subscriptionCreated',
        'subscriptionAdjusted',
        'subscriptionCanceled',
        'subscriptionCancellationScheduled',
        'paymentFailed',
        'paymentSuccessful',
      ]

      for (const key of expectedKeys) {
        expect(result.preferences).toHaveProperty(key)
      }
    })

    it('throws BAD_REQUEST when organizationId is missing', async () => {
      const callerWithoutOrg = createCallerWithoutOrg(
        apiKeyToken,
        user
      )

      const error = await callerWithoutOrg
        .updateNotificationPreferences({
          preferences: { testModeNotifications: true },
        })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('BAD_REQUEST')
      expect(error.message).toBe('organizationId is required')
    })

    it('throws NOT_FOUND when membership does not exist', async () => {
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
      const error = await caller
        .updateNotificationPreferences({
          preferences: { testModeNotifications: true },
        })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('NOT_FOUND')
      expect(error.message).toBe('Membership not found')
    })

    it('handles updates with all preferences disabled', async () => {
      const caller = createCaller(organization, apiKeyToken, user)

      const result = await caller.updateNotificationPreferences({
        preferences: {
          testModeNotifications: false,
          subscriptionCreated: false,
          subscriptionAdjusted: false,
          subscriptionCanceled: false,
          subscriptionCancellationScheduled: false,
          paymentFailed: false,
          paymentSuccessful: false,
        },
      })

      for (const value of Object.values(result.preferences)) {
        expect(value).toBe(false)
      }
    })

    it('handles updates with all preferences enabled', async () => {
      const caller = createCaller(organization, apiKeyToken, user)

      const result = await caller.updateNotificationPreferences({
        preferences: {
          testModeNotifications: true,
          subscriptionCreated: true,
          subscriptionAdjusted: true,
          subscriptionCanceled: true,
          subscriptionCancellationScheduled: true,
          paymentFailed: true,
          paymentSuccessful: true,
        },
      })

      for (const value of Object.values(result.preferences)) {
        expect(value).toBe(true)
      }
    })
  })
})
