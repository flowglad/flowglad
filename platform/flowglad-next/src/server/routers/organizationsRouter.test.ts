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
  return organizationsRouter.createCaller({
    organizationId: organization.id,
    organization,
    user,
    livemode: true,
    environment: 'live' as const,
    isApi: false,
    path: '',
    apiKey: undefined,
    session: {
      user: { id: user.betterAuthId! },
    } as any,
  } as TRPCContext)
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
    it('should return default notification preferences when none are set', async () => {
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

    it('should return stored notification preferences merged with defaults', async () => {
      // Set custom preferences
      await adminTransaction(async ({ transaction }) => {
        const [membership] = await selectMemberships(
          { userId: user.id, organizationId: organization.id },
          transaction
        )
        await updateMembership(
          {
            id: membership.id,
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
      // Other fields should have defaults
      expect(result.subscriptionAdjusted).toBe(true)
      expect(result.subscriptionCanceled).toBe(true)
      expect(result.paymentFailed).toBe(true)
    })

    it('should throw BAD_REQUEST when organizationId is missing', async () => {
      const callerWithoutOrg = organizationsRouter.createCaller({
        organizationId: undefined,
        organization: undefined,
        user,
        livemode: true,
        environment: 'live' as const,
        isApi: false,
        path: '',
        apiKey: undefined,
        session: {
          user: { id: user.betterAuthId! },
        } as any,
      } as TRPCContext)

      const error = await callerWithoutOrg
        .getNotificationPreferences()
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('BAD_REQUEST')
      expect(error.message).toBe('organizationId is required')
    })

    it('should throw NOT_FOUND when membership does not exist', async () => {
      // Create a user without any membership
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
    it('should update notification preferences and return normalized result', async () => {
      const caller = createCaller(organization, user)

      const result = await caller.updateNotificationPreferences({
        preferences: {
          testModeNotifications: true,
          subscriptionCreated: false,
        },
      })

      expect(result.preferences.testModeNotifications).toBe(true)
      expect(result.preferences.subscriptionCreated).toBe(false)
      // Other fields should have defaults
      expect(result.preferences.subscriptionAdjusted).toBe(true)
      expect(result.preferences.subscriptionCanceled).toBe(true)
      expect(result.preferences.paymentFailed).toBe(true)

      // Verify preferences were persisted
      const getResult = await caller.getNotificationPreferences()
      expect(getResult).toEqual(result.preferences)
    })

    it('should merge partial updates with existing preferences', async () => {
      const caller = createCaller(organization, user)

      // First update
      await caller.updateNotificationPreferences({
        preferences: {
          testModeNotifications: true,
          subscriptionCreated: false,
        },
      })

      // Second update (partial)
      const result = await caller.updateNotificationPreferences({
        preferences: {
          paymentFailed: false,
        },
      })

      expect(result.preferences.testModeNotifications).toBe(true)
      expect(result.preferences.subscriptionCreated).toBe(false)
      expect(result.preferences.paymentFailed).toBe(false)
      // Other fields should still have defaults
      expect(result.preferences.subscriptionAdjusted).toBe(true)
    })

    it('should return all notification preference fields with defaults', async () => {
      const caller = createCaller(organization, user)

      const result = await caller.updateNotificationPreferences({
        preferences: {
          testModeNotifications: true,
        },
      })

      // Verify all fields are present (normalized with defaults)
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

    it('should throw BAD_REQUEST when organizationId is missing', async () => {
      const callerWithoutOrg = organizationsRouter.createCaller({
        organizationId: undefined,
        organization: undefined,
        user,
        livemode: true,
        environment: 'live' as const,
        isApi: false,
        path: '',
        apiKey: undefined,
        session: {
          user: { id: user.betterAuthId! },
        } as any,
      } as TRPCContext)

      const error = await callerWithoutOrg
        .updateNotificationPreferences({
          preferences: { testModeNotifications: true },
        })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('BAD_REQUEST')
      expect(error.message).toBe('organizationId is required')
    })

    it('should throw NOT_FOUND when membership does not exist', async () => {
      // Create a user without any membership
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

    it('should handle updates with all preferences disabled', async () => {
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

      // All should be false
      for (const value of Object.values(result.preferences)) {
        expect(value).toBe(false)
      }
    })

    it('should handle updates with all preferences enabled', async () => {
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

      // All should be true
      for (const value of Object.values(result.preferences)) {
        expect(value).toBe(true)
      }
    })
  })
})
