import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { Membership } from '@db-core/schema/memberships'
import type { Organization } from '@db-core/schema/organizations'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { User } from '@db-core/schema/users'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import {
  setupOrg,
  setupUserAndApiKey,
  teardownOrg,
} from '@/../seedDatabase'
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

const createCallerWithoutUser = (
  organization: Organization.Record,
  apiKeyToken: string
) => {
  return organizationsRouter.createCaller({
    organizationId: organization.id,
    organization,
    apiKey: apiKeyToken,
    livemode: true,
    environment: 'live' as const,
    isApi: true,
    path: '',
    user: undefined,
    session: null,
  } as unknown as TRPCApiContext)
}

describe('organizationsRouter - updateFocusedPricingModel', () => {
  let organization: Organization.Record
  let user: User.Record
  let membership: Membership.Record
  let livePricingModel: PricingModel.Record
  let testmodePricingModel: PricingModel.Record
  let apiKeyToken: string

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    livePricingModel = orgSetup.pricingModel
    testmodePricingModel = orgSetup.testmodePricingModel

    const userApiKeySetup = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    if (!userApiKeySetup.apiKey.token) {
      throw new Error('API key token not found after setup')
    }
    apiKeyToken = userApiKeySetup.apiKey.token
    user = userApiKeySetup.user
    membership = userApiKeySetup.membership

    // Set initial focused membership and pricing model
    await adminTransaction(async ({ transaction }) => {
      await updateMembership(
        {
          id: membership.id,
          focused: true,
          focusedPricingModelId: livePricingModel.id,
          livemode: true,
        },
        transaction
      )
      return Result.ok(null)
    })
  })

  afterEach(async () => {
    await teardownOrg({ organizationId: organization.id })
  })

  describe('authentication and authorization', () => {
    it('throws UNAUTHORIZED when organizationId is missing from context', async () => {
      const callerWithoutOrg = createCallerWithoutOrg(
        apiKeyToken,
        user
      )

      const error = await callerWithoutOrg
        .updateFocusedPricingModel({
          pricingModelId: testmodePricingModel.id,
        })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('UNAUTHORIZED')
      expect(error.message).toBe(
        'User and organization context required'
      )
    })

    it('throws UNAUTHORIZED when user is missing from context', async () => {
      const callerWithoutUser = createCallerWithoutUser(
        organization,
        apiKeyToken
      )

      const error = await callerWithoutUser
        .updateFocusedPricingModel({
          pricingModelId: testmodePricingModel.id,
        })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('UNAUTHORIZED')
      expect(error.message).toBe(
        'User and organization context required'
      )
    })
  })

  describe('pricing model validation', () => {
    it('throws NOT_FOUND when pricing model does not exist', async () => {
      const caller = createCaller(organization, apiKeyToken, user)

      const error = await caller
        .updateFocusedPricingModel({
          pricingModelId: 'non-existent-pm-id',
        })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('NOT_FOUND')
      expect(error.message).toBe('Pricing model not found')
    })

    it('throws FORBIDDEN when pricing model belongs to a different organization', async () => {
      const { organization: otherOrg, pricingModel: otherPm } =
        await setupOrg()

      try {
        const caller = createCaller(organization, apiKeyToken, user)

        const error = await caller
          .updateFocusedPricingModel({ pricingModelId: otherPm.id })
          .catch((e) => e)

        expect(error).toBeInstanceOf(TRPCError)
        expect(error.code).toBe('FORBIDDEN')
        expect(error.message).toBe(
          'Pricing model does not belong to this organization'
        )
      } finally {
        await teardownOrg({ organizationId: otherOrg.id })
      }
    })
  })

  describe('focused membership validation', () => {
    it('throws NOT_FOUND when user has no focused membership', async () => {
      // Unfocus the user's membership
      await adminTransaction(async ({ transaction }) => {
        await updateMembership(
          {
            id: membership.id,
            focused: false,
          },
          transaction
        )
        return Result.ok(null)
      })

      const caller = createCaller(organization, apiKeyToken, user)

      const error = await caller
        .updateFocusedPricingModel({
          pricingModelId: testmodePricingModel.id,
        })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('NOT_FOUND')
      expect(error.message).toBe(
        'No focused membership found for user'
      )
    })
  })

  describe('successful update', () => {
    it('updates focusedPricingModelId and returns membership and pricing model', async () => {
      const caller = createCaller(organization, apiKeyToken, user)

      const result = await caller.updateFocusedPricingModel({
        pricingModelId: testmodePricingModel.id,
      })

      expect(result.membership.focusedPricingModelId).toBe(
        testmodePricingModel.id
      )
      expect(result.pricingModel.id).toBe(testmodePricingModel.id)
      expect(result.pricingModel.name).toBe(testmodePricingModel.name)
    })

    it('auto-syncs membership livemode to match PM livemode when switching to test mode', async () => {
      const caller = createCaller(organization, apiKeyToken, user)

      const result = await caller.updateFocusedPricingModel({
        pricingModelId: testmodePricingModel.id,
      })

      expect(result.membership.livemode).toBe(false)
      expect(result.pricingModel.livemode).toBe(false)

      // Verify in database
      const [dbMembership] = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await selectMemberships(
              { id: membership.id },
              transaction
            )
          )
        })
      ).unwrap()
      expect(dbMembership.livemode).toBe(false)
    })

    it('auto-syncs membership livemode when switching from test to live mode', async () => {
      // First switch to test mode
      await adminTransaction(async ({ transaction }) => {
        await updateMembership(
          {
            id: membership.id,
            focusedPricingModelId: testmodePricingModel.id,
            livemode: false,
          },
          transaction
        )
        return Result.ok(null)
      })

      const caller = createCaller(
        organization,
        apiKeyToken,
        user,
        false
      )

      const result = await caller.updateFocusedPricingModel({
        pricingModelId: livePricingModel.id,
      })

      expect(result.membership.livemode).toBe(true)
      expect(result.pricingModel.livemode).toBe(true)
    })

    it('returns client-safe schema-parsed response objects', async () => {
      const caller = createCaller(organization, apiKeyToken, user)

      const result = await caller.updateFocusedPricingModel({
        pricingModelId: testmodePricingModel.id,
      })

      // Verify membership response structure
      expect(result.membership).toHaveProperty('id')
      expect(result.membership).toHaveProperty(
        'focusedPricingModelId'
      )
      expect(result.membership).toHaveProperty('livemode')

      // Verify pricing model response structure
      expect(result.pricingModel).toHaveProperty('id')
      expect(result.pricingModel).toHaveProperty('name')
      expect(result.pricingModel).toHaveProperty('livemode')
      expect(result.pricingModel).toHaveProperty('organizationId')
    })
  })
})
