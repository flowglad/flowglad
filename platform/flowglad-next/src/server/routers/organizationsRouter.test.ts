import { TRPCError } from '@trpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMemberships, setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Membership } from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import type { User } from '@/db/schema/users'
import {
  selectMemberships,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { insertUser } from '@/db/tableMethods/userMethods'
import { organizationsRouter } from '@/server/routers/organizationsRouter'
import type { TRPCContext } from '@/server/trpcContext'
import { getSession } from '@/utils/auth'
import core from '@/utils/core'

vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
  cookies: vi.fn(() => ({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  })),
}))

vi.mock('@/utils/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
  getSession: vi.fn(),
}))

const createAuthedContext = async (params: {
  organization: Organization.Record
  user: User.Record
  membership?: Membership.Record
  livemode?: boolean
}) => {
  const { organization, user, membership } = params
  const livemode = params.livemode ?? true

  vi.mocked(getSession).mockResolvedValue({
    user: {
      id: user.betterAuthId ?? `ba_${user.id}`,
      email: user.email,
    },
  } as unknown as Awaited<ReturnType<typeof getSession>>)

  const ctx: TRPCContext = {
    user,
    path: '',
    environment: livemode ? 'live' : 'test',
    livemode,
    organizationId: organization.id,
    organization,
    isApi: false,
    apiKey: undefined,
  }

  return { ctx, user, membership }
}

describe('organizationsRouter.getNotificationPreferences', () => {
  let organization: Organization.Record
  let user: User.Record
  let membership: Membership.Record

  beforeEach(async () => {
    vi.clearAllMocks()

    const { organization: org } = await setupOrg()
    organization = org

    // Create user and membership
    const result = await adminTransaction(async ({ transaction }) => {
      const newUser = await insertUser(
        {
          id: `usr_test_${core.nanoid()}`,
          email: `test+${core.nanoid()}@test.com`,
          name: 'Test User',
          betterAuthId: `ba_${core.nanoid()}`,
        },
        transaction
      )

      const membershipResult = await setupMemberships({
        organizationId: organization.id,
      })

      // Update membership to link to our new user
      await updateMembership(
        { id: membershipResult.id, userId: newUser.id },
        transaction
      )

      const [updatedMembership] = await selectMemberships(
        { id: membershipResult.id },
        transaction
      )

      return { user: newUser, membership: updatedMembership }
    })

    user = result.user
    membership = result.membership
  })

  it('returns default preferences when membership has empty preferences', async () => {
    const { ctx } = await createAuthedContext({
      organization,
      user,
      membership,
    })
    const caller = organizationsRouter.createCaller(ctx)

    const result = await caller.getNotificationPreferences()

    // Test mode defaults to false
    expect(result.testModeNotifications).toBe(false)

    // All notification type preferences default to true
    expect(result.subscriptionCreated).toBe(true)
    expect(result.subscriptionAdjusted).toBe(true)
    expect(result.subscriptionCanceled).toBe(true)
    expect(result.subscriptionCancellationScheduled).toBe(true)
    expect(result.paymentFailed).toBe(true)
    expect(result.onboardingCompleted).toBe(true)
    expect(result.payoutsEnabled).toBe(true)
  })

  it('returns merged preferences when some are set', async () => {
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

    const { ctx } = await createAuthedContext({
      organization,
      user,
      membership,
    })
    const caller = organizationsRouter.createCaller(ctx)

    const result = await caller.getNotificationPreferences()

    // Stored values
    expect(result.testModeNotifications).toBe(true)
    expect(result.subscriptionCreated).toBe(false)

    // Default values for unset
    expect(result.subscriptionAdjusted).toBe(true)
    expect(result.subscriptionCanceled).toBe(true)
  })

  it('throws NOT_FOUND for user without membership in current org', async () => {
    // Create a different organization and context
    const { organization: otherOrg } = await setupOrg()

    const { ctx } = await createAuthedContext({
      organization: otherOrg,
      user,
      membership,
    })
    const caller = organizationsRouter.createCaller(ctx)

    const error = await caller
      .getNotificationPreferences()
      .catch((e) => e)

    expect(error).toBeInstanceOf(TRPCError)
    expect(error.code).toBe('NOT_FOUND')
    expect(error.message).toBe('Membership not found')
  })
})

describe('organizationsRouter.updateNotificationPreferences', () => {
  let organization: Organization.Record
  let user: User.Record
  let membership: Membership.Record

  beforeEach(async () => {
    vi.clearAllMocks()

    const { organization: org } = await setupOrg()
    organization = org

    // Create user and membership
    const result = await adminTransaction(async ({ transaction }) => {
      const newUser = await insertUser(
        {
          id: `usr_test_${core.nanoid()}`,
          email: `test+${core.nanoid()}@test.com`,
          name: 'Test User',
          betterAuthId: `ba_${core.nanoid()}`,
        },
        transaction
      )

      const membershipResult = await setupMemberships({
        organizationId: organization.id,
      })

      // Update membership to link to our new user
      await updateMembership(
        { id: membershipResult.id, userId: newUser.id },
        transaction
      )

      const [updatedMembership] = await selectMemberships(
        { id: membershipResult.id },
        transaction
      )

      return { user: newUser, membership: updatedMembership }
    })

    user = result.user
    membership = result.membership
  })

  it('updates specified preferences while preserving unspecified ones', async () => {
    // First set initial preferences
    await adminTransaction(async ({ transaction }) => {
      await updateMembership(
        {
          id: membership.id,
          notificationPreferences: {
            subscriptionCreated: false,
          },
        },
        transaction
      )
    })

    const { ctx } = await createAuthedContext({
      organization,
      user,
      membership,
    })
    const caller = organizationsRouter.createCaller(ctx)

    // Update with new preferences
    const result = (await caller.updateNotificationPreferences({
      preferences: {
        testModeNotifications: true,
        paymentFailed: false,
      },
    })) as { preferences: Record<string, unknown> }

    // New values
    const preferences = result.preferences
    expect(preferences.testModeNotifications).toBe(true)
    expect(preferences.paymentFailed).toBe(false)

    // Preserved existing value
    expect(preferences.subscriptionCreated).toBe(false)

    // Verify in database
    const [updatedMembership] = await adminTransaction(
      async ({ transaction }) => {
        return selectMemberships({ id: membership.id }, transaction)
      }
    )
    const storedPrefs =
      updatedMembership.notificationPreferences as Record<
        string,
        unknown
      >
    expect(storedPrefs.testModeNotifications).toBe(true)
    expect(storedPrefs.paymentFailed).toBe(false)
    expect(storedPrefs.subscriptionCreated).toBe(false)
  })

  it('can update a single preference', async () => {
    const { ctx } = await createAuthedContext({
      organization,
      user,
      membership,
    })
    const caller = organizationsRouter.createCaller(ctx)

    const result = (await caller.updateNotificationPreferences({
      preferences: {
        onboardingCompleted: false,
      },
    })) as { preferences: Record<string, unknown> }

    const prefs = result.preferences
    expect(prefs.onboardingCompleted).toBe(false)
  })

  it('throws NOT_FOUND for user without membership in current org', async () => {
    // Create a different organization and context
    const { organization: otherOrg } = await setupOrg()

    const { ctx } = await createAuthedContext({
      organization: otherOrg,
      user,
      membership,
    })
    const caller = organizationsRouter.createCaller(ctx)

    const error = await caller
      .updateNotificationPreferences({
        preferences: { testModeNotifications: true },
      })
      .catch((e: TRPCError) => e)

    expect(error).toBeInstanceOf(TRPCError)
    expect((error as TRPCError).code).toBe('NOT_FOUND')
    expect((error as TRPCError).message).toBe('Membership not found')
  })
})
