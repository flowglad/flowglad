import { describe, expect, it } from 'vitest'
import { router } from '@/server/trpc'
import type { TRPCContext } from '@/server/trpcContext'
import { StripeConnectContractType } from '@/types'
import { getFundsFlowEligibilityForCountry } from './getFundsFlowEligibilityForCountry'

const createCaller = () => {
  const testRouter = router({
    getFundsFlowEligibilityForCountry,
  })

  const now = Date.now()
  const ctx: TRPCContext = {
    isApi: false,
    apiKey: undefined,
    path: '',
    organizationId: undefined,
    organization: undefined,
    environment: 'live',
    livemode: true,
    user: {
      id: 'user_test',
      name: null,
      email: 'test@example.com',
      clerkId: null,
      betterAuthId: null,
      stackAuthId: null,
      createdAt: now,
      updatedAt: now,
      createdByCommit: null,
      updatedByCommit: null,
      position: 1,
    },
  }

  return testRouter.createCaller(ctx)
}

describe('getFundsFlowEligibilityForCountry', () => {
  it('returns eligible flows for a platform-eligible country', async () => {
    const caller = createCaller()
    const result = await caller.getFundsFlowEligibilityForCountry({
      countryCode: 'US',
    })

    expect(result.isEligible).toBe(true)
    expect(result.eligibleFlows).toEqual([
      StripeConnectContractType.Platform,
      StripeConnectContractType.MerchantOfRecord,
    ])
  })

  it('returns ineligible for unknown country code', async () => {
    const caller = createCaller()
    const result = await caller.getFundsFlowEligibilityForCountry({
      countryCode: 'ZZ',
    })

    expect(result).toEqual({
      isEligible: false,
      eligibleFlows: [],
    })
  })
})
