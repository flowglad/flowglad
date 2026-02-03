import {
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

// Mock modules BEFORE importing them
mock.module('next/headers', () => ({
  headers: mock(() => new Headers()),
  cookies: mock(() => ({
    set: mock(),
    get: mock(),
    delete: mock(),
  })),
}))

import {
  CountryCode,
  StripeConnectContractType,
} from '@db-core/enums'
import type { Organization } from '@db-core/schema/organizations'
import type { User } from '@db-core/schema/users'
import { Result } from 'better-result'
// Now import everything else (including mocked modules)
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import * as databaseAuthentication from '@/db/databaseAuthentication'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { organizationsRouter } from '@/server/routers/organizationsRouter'
import type { TRPCContext } from '@/server/trpcContext'

const createAuthedContext = async (params: {
  organization: Organization.Record
  livemode?: boolean
}): Promise<{ ctx: TRPCContext; user: User.Record }> => {
  const { organization } = params
  const livemode = params.livemode ?? true

  // Create a user with API key - this will be used for the mock
  const { user } = await setupUserAndApiKey({
    organizationId: organization.id,
    livemode,
  })

  // Mock getDatabaseAuthenticationInfo to return proper auth info
  // This bypasses the getSession() call which is problematic to mock
  spyOn(
    databaseAuthentication,
    'getDatabaseAuthenticationInfo'
  ).mockResolvedValue({
    userId: user.id,
    livemode,
    jwtClaim: {
      role: 'merchant',
      sub: user.id,
      email: user.email!,
      organization_id: organization.id,
      auth_type: 'webapp',
      user_metadata: {
        id: user.id,
        user_metadata: {},
        aud: 'stub',
        email: user.email!,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        role: 'merchant',
        app_metadata: { provider: '' },
      },
      app_metadata: { provider: 'webapp' },
    },
  })

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

  return { ctx, user }
}

describe('requestStripeConnectOnboardingLink mutation', () => {
  beforeEach(() => {
    mock.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.flowglad.com'
  })

  it('should create a Stripe Connect account and return an onboarding link', async () => {
    const orgSetup = await setupOrg({
      countryCode: CountryCode.GB,
      stripeConnectContractType: StripeConnectContractType.Platform,
    })
    const organization = orgSetup.organization
    const { ctx } = await createAuthedContext({ organization })

    const result = await organizationsRouter
      .createCaller(ctx)
      .requestStripeConnect({})

    // Verify we got an onboarding link back (don't assert on specific URL format from mock)
    expect(typeof result.onboardingLink).toBe('string')
    expect(result.onboardingLink.length).toBeGreaterThan(0)

    // Verify the organization was updated with a Stripe account ID
    const updatedOrg = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectOrganizationById(organization.id, transaction)
          ).unwrap()
        )
      })
    ).unwrap()
    expect(typeof updatedOrg.stripeAccountId).toBe('string')
  })

  it('should work for Platform contract type', async () => {
    const orgSetup = await setupOrg({
      countryCode: CountryCode.US,
      stripeConnectContractType: StripeConnectContractType.Platform,
    })
    const organization = orgSetup.organization
    const { ctx } = await createAuthedContext({ organization })

    const result = await organizationsRouter
      .createCaller(ctx)
      .requestStripeConnect({})

    // Verify the mutation completed successfully
    expect(typeof result.onboardingLink).toBe('string')

    // Verify the organization was updated
    const updatedOrg = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectOrganizationById(organization.id, transaction)
          ).unwrap()
        )
      })
    ).unwrap()
    expect(typeof updatedOrg.stripeAccountId).toBe('string')
  })

  it('should work for MerchantOfRecord contract type', async () => {
    const orgSetup = await setupOrg({
      countryCode: CountryCode.US,
      stripeConnectContractType:
        StripeConnectContractType.MerchantOfRecord,
    })
    const organization = orgSetup.organization
    const { ctx } = await createAuthedContext({ organization })

    const result = await organizationsRouter
      .createCaller(ctx)
      .requestStripeConnect({})

    // Verify the mutation completed successfully
    expect(typeof result.onboardingLink).toBe('string')

    // Verify the organization was updated
    const updatedOrg = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectOrganizationById(organization.id, transaction)
          ).unwrap()
        )
      })
    ).unwrap()
    expect(typeof updatedOrg.stripeAccountId).toBe('string')
  })
})
