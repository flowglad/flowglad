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

// Now import everything else (including mocked modules)
import { HttpResponse, http } from 'msw'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import * as databaseAuthentication from '@/db/databaseAuthentication'
import type { Organization } from '@/db/schema/organizations'
import type { User } from '@/db/schema/users'
import { organizationsRouter } from '@/server/routers/organizationsRouter'
import type { TRPCContext } from '@/server/trpcContext'
import { CountryCode, StripeConnectContractType } from '@/types'
import core from '@/utils/core'
import { server } from '../../../mocks/server'

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

  it('should use organization countryId and stripeConnectContractType', async () => {
    const orgSetup = await setupOrg({
      countryCode: CountryCode.GB,
      stripeConnectContractType: StripeConnectContractType.Platform,
    })
    const organization = orgSetup.organization
    const { ctx } = await createAuthedContext({ organization })

    let lastAccountCreateBody: URLSearchParams | undefined
    server.use(
      http.post(
        'https://api.stripe.com/v1/accounts',
        async ({ request }) => {
          lastAccountCreateBody = new URLSearchParams(
            await request.text()
          )
          return HttpResponse.json({
            id: `acct_${core.nanoid()}`,
            object: 'account',
          })
        }
      ),
      http.post(
        'https://api.stripe.com:443/v1/accounts',
        async ({ request }) => {
          lastAccountCreateBody = new URLSearchParams(
            await request.text()
          )
          return HttpResponse.json({
            id: `acct_${core.nanoid()}`,
            object: 'account',
          })
        }
      )
    )

    const result = await organizationsRouter
      .createCaller(ctx)
      .requestStripeConnect({})

    expect(result.onboardingLink).toContain(
      'https://connect.stripe.com/'
    )
    expect(lastAccountCreateBody?.get('country')).toBe(CountryCode.GB)
  })

  it('should create Platform account with card_payments capability', async () => {
    const orgSetup = await setupOrg({
      countryCode: CountryCode.US,
      stripeConnectContractType: StripeConnectContractType.Platform,
    })
    const organization = orgSetup.organization
    const { ctx } = await createAuthedContext({ organization })

    let lastAccountCreateBody: URLSearchParams | undefined
    server.use(
      http.post(
        'https://api.stripe.com/v1/accounts',
        async ({ request }) => {
          lastAccountCreateBody = new URLSearchParams(
            await request.text()
          )
          return HttpResponse.json({
            id: `acct_${core.nanoid()}`,
            object: 'account',
          })
        }
      ),
      http.post(
        'https://api.stripe.com:443/v1/accounts',
        async ({ request }) => {
          lastAccountCreateBody = new URLSearchParams(
            await request.text()
          )
          return HttpResponse.json({
            id: `acct_${core.nanoid()}`,
            object: 'account',
          })
        }
      )
    )

    await organizationsRouter
      .createCaller(ctx)
      .requestStripeConnect({})

    expect(
      lastAccountCreateBody?.get('capabilities[transfers][requested]')
    ).toBe('true')
    expect(
      lastAccountCreateBody?.get(
        'capabilities[card_payments][requested]'
      )
    ).toBe('true')
  })

  it('should create MoR account with transfers-only capability', async () => {
    const orgSetup = await setupOrg({
      countryCode: CountryCode.US,
      stripeConnectContractType:
        StripeConnectContractType.MerchantOfRecord,
    })
    const organization = orgSetup.organization
    const { ctx } = await createAuthedContext({ organization })

    let lastAccountCreateBody: URLSearchParams | undefined
    server.use(
      http.post(
        'https://api.stripe.com/v1/accounts',
        async ({ request }) => {
          lastAccountCreateBody = new URLSearchParams(
            await request.text()
          )
          return HttpResponse.json({
            id: `acct_${core.nanoid()}`,
            object: 'account',
          })
        }
      ),
      http.post(
        'https://api.stripe.com:443/v1/accounts',
        async ({ request }) => {
          lastAccountCreateBody = new URLSearchParams(
            await request.text()
          )
          return HttpResponse.json({
            id: `acct_${core.nanoid()}`,
            object: 'account',
          })
        }
      )
    )

    await organizationsRouter
      .createCaller(ctx)
      .requestStripeConnect({})

    expect(
      lastAccountCreateBody?.get('capabilities[transfers][requested]')
    ).toBe('true')
    expect(
      lastAccountCreateBody?.get(
        'capabilities[card_payments][requested]'
      )
    ).toBeNull()
  })
})
