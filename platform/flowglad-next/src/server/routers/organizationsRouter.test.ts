import { TRPCError } from '@trpc/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Membership } from '@/db/schema/memberships'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import type { User } from '@/db/schema/users'
import {
  insertMembership,
  selectMemberships,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { insertUser } from '@/db/tableMethods/userMethods'
import type { TRPCContext } from '@/server/trpcContext'
import { organizationsRouter } from './organizationsRouter'

const createCaller = (
  organization: Organization.Record,
  user: User.Record
) => {
  const context: TRPCContext = {
    organizationId: organization.id,
    organization,
    user,
    livemode: true,
    environment: 'live' as const,
    isApi: false,
    path: '',
    apiKey: undefined,
  }
  return organizationsRouter.createCaller(context)
}

const createCallerWithoutOrg = (user: User.Record) => {
  const context: TRPCContext = {
    organizationId: undefined,
    organization: undefined,
    user,
    livemode: true,
    environment: 'live' as const,
    isApi: false,
    path: '',
    apiKey: undefined,
  }
  return organizationsRouter.createCaller(context)
}

describe('organizationsRouter - notification preferences', () => {
  let organization: Organization.Record
  let user: User.Record
  let membership: Membership.Record

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    organization = orgSetup.organization

    await adminTransaction(async ({ transaction }) => {
      const nanoid = Date.now().toString()
      user = await insertUser(
        {
          id: `user-${nanoid}`,
          email: `test-${nanoid}@example.com`,
          name: 'Test User',
          betterAuthId: `auth-${nanoid}`,
        },
        transaction
      )

      membership = await insertMembership(
        {
          organizationId: organization.id,
          userId: user.id,
          focused: true,
          livemode: true,
        },
        transaction
      )
    })
  })

  describe('getNotificationPreferences', () => {
    it('returns default notification preferences when none are set', async () => {
      const caller = createCaller(organization, user)

      const result = await caller.getNotificationPreferences()

      expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
      expect(result.testModeNotifications).toBe(false)
      expect(result.subscriptionCreated).toBe(true)
      expect(result.subscriptionAdjusted).toBe(true)
      expect(result.subscriptionCanceled).toBe(true)
      expect(result.subscriptionCancellationScheduled).toBe(true)
      expect(result.paymentFailed).toBe(true)
      expect(result.onboardingCompleted).toBe(true)
      expect(result.payoutsEnabled).toBe(true)
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

      const caller = createCaller(organization, user)
      const result = await caller.getNotificationPreferences()

      expect(result.testModeNotifications).toBe(true)
      expect(result.subscriptionCreated).toBe(false)
      expect(result.subscriptionAdjusted).toBe(true)
      expect(result.subscriptionCanceled).toBe(true)
      expect(result.paymentFailed).toBe(true)
    })

    it('throws BAD_REQUEST when organizationId is missing', async () => {
      const callerWithoutOrg = createCallerWithoutOrg(user)

      const error = await callerWithoutOrg
        .getNotificationPreferences()
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('BAD_REQUEST')
      expect(error.message).toBe('organizationId is required')
    })

    it('throws NOT_FOUND when membership does not exist', async () => {
      const nanoid = Date.now().toString()
      const userWithoutMembership = await adminTransaction(
        async ({ transaction }) => {
          return insertUser(
            {
              id: `user-no-membership-${nanoid}`,
              email: `no-membership-${nanoid}@example.com`,
              name: 'User Without Membership',
              betterAuthId: `auth-no-membership-${nanoid}`,
            },
            transaction
          )
        }
      )

      const caller = createCaller(organization, userWithoutMembership)
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
      const caller = createCaller(organization, user)

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

      const getResult = await caller.getNotificationPreferences()
      expect(getResult).toEqual(result.preferences)
    })

    it('merges partial updates with existing preferences', async () => {
      const caller = createCaller(organization, user)

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
      const caller = createCaller(organization, user)

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
        'onboardingCompleted',
        'payoutsEnabled',
      ]

      for (const key of expectedKeys) {
        expect(result.preferences).toHaveProperty(key)
      }
    })

    it('throws BAD_REQUEST when organizationId is missing', async () => {
      const callerWithoutOrg = createCallerWithoutOrg(user)

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
      const nanoid = Date.now().toString()
      const userWithoutMembership = await adminTransaction(
        async ({ transaction }) => {
          return insertUser(
            {
              id: `user-no-membership-${nanoid}`,
              email: `no-membership-${nanoid}@example.com`,
              name: 'User Without Membership',
              betterAuthId: `auth-no-membership-${nanoid}`,
            },
            transaction
          )
        }
      )

      const caller = createCaller(organization, userWithoutMembership)
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
      const caller = createCaller(organization, user)

      const result = await caller.updateNotificationPreferences({
        preferences: {
          testModeNotifications: false,
          subscriptionCreated: false,
          subscriptionAdjusted: false,
          subscriptionCanceled: false,
          subscriptionCancellationScheduled: false,
          paymentFailed: false,
          onboardingCompleted: false,
          payoutsEnabled: false,
        },
      })

      for (const value of Object.values(result.preferences)) {
        expect(value).toBe(false)
      }
    })

    it('handles updates with all preferences enabled', async () => {
      const caller = createCaller(organization, user)

      const result = await caller.updateNotificationPreferences({
        preferences: {
          testModeNotifications: true,
          subscriptionCreated: true,
          subscriptionAdjusted: true,
          subscriptionCanceled: true,
          subscriptionCancellationScheduled: true,
          paymentFailed: true,
          onboardingCompleted: true,
          payoutsEnabled: true,
        },
      })

      for (const value of Object.values(result.preferences)) {
        expect(value).toBe(true)
      }
    })
  })
})
