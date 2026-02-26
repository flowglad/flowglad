import {
  beforeEach,
  describe,
  expect,
  it,
  setDefaultTimeout,
} from 'bun:test'
import { FeatureType } from '@db-core/enums'
import type { Organization } from '@db-core/schema/organizations'
import { TRPCError } from '@trpc/server'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import type {
  TRPCApiContext,
  TRPCContext,
} from '@/server/trpcContext'
import { featuresRouter } from './featuresRouter'

setDefaultTimeout(30000)

const createApiCaller = (
  organization: Organization.Record,
  apiKeyToken: string,
  apiKeyPricingModelId: string | undefined,
  livemode: boolean = true
) => {
  const ctx = {
    organizationId: organization.id,
    organization,
    apiKey: apiKeyToken,
    livemode,
    environment: (livemode ? 'live' : 'test') satisfies
      | 'live'
      | 'test',
    isApi: true,
    apiKeyPricingModelId,
    focusedPricingModelId: undefined,
    path: '',
  } as unknown as TRPCApiContext
  return featuresRouter.createCaller(ctx)
}

const createDashboardCaller = (
  organization: Organization.Record,
  focusedPricingModelId: string | undefined,
  livemode: boolean = true
) => {
  const ctx = {
    organizationId: organization.id,
    organization,
    livemode,
    environment: (livemode ? 'live' : 'test') satisfies
      | 'live'
      | 'test',
    isApi: false,
    apiKey: undefined,
    apiKeyPricingModelId: undefined,
    focusedPricingModelId,
    path: '',
  } as unknown as TRPCContext
  return featuresRouter.createCaller(ctx)
}

describe('featuresRouter.create', () => {
  let organization: Organization.Record
  let apiKeyToken: string
  let pricingModelId: string

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    pricingModelId = orgSetup.pricingModel.id

    const userApiKeySetup = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    if (!userApiKeySetup.apiKey.token) {
      throw new Error('API key token not found after setup')
    }
    apiKeyToken = userApiKeySetup.apiKey.token
  })

  it('creates a toggle feature via API key and derives pricingModelId from ctx.apiKeyPricingModelId', async () => {
    const caller = createApiCaller(
      organization,
      apiKeyToken,
      pricingModelId
    )

    const result = await caller.create({
      feature: {
        type: FeatureType.Toggle,
        name: 'API Toggle Feature',
        slug: 'api-toggle-feature',
        description: 'Created via API key',
        amount: null,
        usageMeterId: null,
        renewalFrequency: null,
        resourceId: null,
        active: true,
      },
    })

    expect(result.feature.pricingModelId).toBe(pricingModelId)
    expect(result.feature.name).toBe('API Toggle Feature')
    expect(result.feature.slug).toBe('api-toggle-feature')
    expect(result.feature.type).toBe(FeatureType.Toggle)
    expect(result.feature.organizationId).toBe(organization.id)
  })

  it('creates a toggle feature via dashboard and derives pricingModelId from ctx.focusedPricingModelId', async () => {
    const caller = createDashboardCaller(organization, pricingModelId)

    const result = await caller.create({
      feature: {
        type: FeatureType.Toggle,
        name: 'Dashboard Toggle Feature',
        slug: 'dashboard-toggle-feature',
        description: 'Created via dashboard',
        amount: null,
        usageMeterId: null,
        renewalFrequency: null,
        resourceId: null,
        active: true,
      },
    })

    expect(result.feature.pricingModelId).toBe(pricingModelId)
    expect(result.feature.name).toBe('Dashboard Toggle Feature')
    expect(result.feature.slug).toBe('dashboard-toggle-feature')
    expect(result.feature.type).toBe(FeatureType.Toggle)
    expect(result.feature.organizationId).toBe(organization.id)
  })

  it('throws BAD_REQUEST with API-specific message when apiKeyPricingModelId is undefined', async () => {
    const caller = createApiCaller(
      organization,
      apiKeyToken,
      undefined
    )

    await expect(
      caller.create({
        feature: {
          type: FeatureType.Toggle,
          name: 'Should Fail',
          slug: 'should-fail',
          description: 'Missing pricing model',
          amount: null,
          usageMeterId: null,
          renewalFrequency: null,
          resourceId: null,
          active: true,
        },
      })
    ).rejects.toThrow(TRPCError)

    try {
      await caller.create({
        feature: {
          type: FeatureType.Toggle,
          name: 'Should Fail Again',
          slug: 'should-fail-again',
          description: 'Missing pricing model',
          amount: null,
          usageMeterId: null,
          renewalFrequency: null,
          resourceId: null,
          active: true,
        },
      })
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      const trpcError = error as TRPCError
      expect(trpcError.code).toBe('BAD_REQUEST')
      expect(trpcError.message).toContain(
        'Ensure your API key is associated with a pricing model'
      )
    }
  })

  it('throws BAD_REQUEST with dashboard-specific message when focusedPricingModelId is undefined', async () => {
    const caller = createDashboardCaller(organization, undefined)

    await expect(
      caller.create({
        feature: {
          type: FeatureType.Toggle,
          name: 'Should Fail',
          slug: 'should-fail-dashboard',
          description: 'Missing pricing model',
          amount: null,
          usageMeterId: null,
          renewalFrequency: null,
          resourceId: null,
          active: true,
        },
      })
    ).rejects.toThrow(TRPCError)

    try {
      await caller.create({
        feature: {
          type: FeatureType.Toggle,
          name: 'Should Fail Again',
          slug: 'should-fail-dashboard-again',
          description: 'Missing pricing model',
          amount: null,
          usageMeterId: null,
          renewalFrequency: null,
          resourceId: null,
          active: true,
        },
      })
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      const trpcError = error as TRPCError
      expect(trpcError.code).toBe('BAD_REQUEST')
      expect(trpcError.message).toContain(
        'Please select a pricing model'
      )
    }
  })
})
