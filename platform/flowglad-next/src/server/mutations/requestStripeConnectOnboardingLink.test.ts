import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import type { User } from '@/db/schema/users'
import { insertMembership } from '@/db/tableMethods/membershipMethods'
import { insertUser } from '@/db/tableMethods/userMethods'
import { organizationsRouter } from '@/server/routers/organizationsRouter'
import type { TRPCContext } from '@/server/trpcContext'
import { CountryCode, StripeConnectContractType } from '@/types'
import { getSession } from '@/utils/auth'
import core from '@/utils/core'
import { server } from '../../../mocks/server'

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
  livemode?: boolean
}) => {
  const { organization } = params
  const livemode = params.livemode ?? true

  const betterAuthId = `ba_test_${core.nanoid()}`
  const email = `merchant+${core.nanoid()}@example.com`

  const user = await adminTransaction(async ({ transaction }) => {
    const insertedUser: User.Record = await insertUser(
      {
        id: `usr_test_${core.nanoid()}`,
        email,
        name: 'Test Merchant',
        betterAuthId,
      },
      transaction
    )

    await insertMembership(
      {
        userId: insertedUser.id,
        organizationId: organization.id,
        focused: true,
        livemode,
      },
      transaction
    )

    return insertedUser
  })

  vi.mocked(getSession).mockResolvedValue({
    user: {
      id: betterAuthId,
      email,
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
    clientIp: 'test-ip',
    userAgent: 'test-agent',
  }

  return { ctx, user }
}

describe('requestStripeConnectOnboardingLink mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
