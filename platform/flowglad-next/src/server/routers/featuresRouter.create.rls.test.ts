import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { FeatureType } from '@db-core/enums'
import { TRPCError } from '@trpc/server'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { featuresRouter } from '@/server/routers/featuresRouter'

describe('featuresRouter.create - pricingModelId derivation', () => {
  afterEach(() => {
    globalThis.__mockedAuthSession = undefined
  })

  it('should derive pricingModelId from the API key when called via API and insert a feature', async () => {
    const orgData = await setupOrg()
    const { apiKey } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: true,
    })

    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true,
      path: '',
      authScope: 'merchant' as const,
      apiKeyPricingModelId: orgData.pricingModel.id,
      focusedPricingModelId: undefined,
    }

    const result = await featuresRouter.createCaller(ctx).create({
      feature: {
        type: FeatureType.Toggle,
        name: 'API Toggle Feature',
        slug: 'api-toggle-feature',
        description: 'Created via API',
        amount: null,
        usageMeterId: null,
        renewalFrequency: null,
        active: true,
      },
    })

    expect(result.feature.name).toBe('API Toggle Feature')
    expect(result.feature.slug).toBe('api-toggle-feature')
    expect(result.feature.type).toBe(FeatureType.Toggle)
    expect(result.feature.pricingModelId).toBe(
      orgData.pricingModel.id
    )
    expect(result.feature.organizationId).toBe(
      orgData.organization.id
    )
  })

  it('should derive pricingModelId from focusedPricingModelId when called via dashboard and insert a feature', async () => {
    const orgData = await setupOrg()
    const { user, betterAuthId } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: true,
    })

    globalThis.__mockedAuthSession = {
      user: { id: betterAuthId!, email: user.email },
    }

    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: undefined,
      livemode: true,
      environment: 'live' as const,
      isApi: false as any,
      path: '',
      authScope: 'merchant' as const,
      user,
      focusedPricingModelId: orgData.pricingModel.id,
      apiKeyPricingModelId: undefined,
    }

    const result = await featuresRouter.createCaller(ctx).create({
      feature: {
        type: FeatureType.Toggle,
        name: 'Dashboard Toggle Feature',
        slug: 'dashboard-toggle-feature',
        description: 'Created via dashboard',
        amount: null,
        usageMeterId: null,
        renewalFrequency: null,
        active: true,
      },
    })

    expect(result.feature.name).toBe('Dashboard Toggle Feature')
    expect(result.feature.slug).toBe('dashboard-toggle-feature')
    expect(result.feature.type).toBe(FeatureType.Toggle)
    expect(result.feature.pricingModelId).toBe(
      orgData.pricingModel.id
    )
    expect(result.feature.organizationId).toBe(
      orgData.organization.id
    )
  })

  it('should throw BAD_REQUEST when API key has no associated pricing model', async () => {
    const orgData = await setupOrg()
    const { apiKey } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: true,
    })

    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: apiKey.token!,
      livemode: true,
      environment: 'live' as const,
      isApi: true,
      path: '',
      authScope: 'merchant' as const,
      apiKeyPricingModelId: undefined,
      focusedPricingModelId: undefined,
    }

    try {
      await featuresRouter.createCaller(ctx).create({
        feature: {
          type: FeatureType.Toggle,
          name: 'Should Fail',
          slug: 'should-fail',
          description: '',
          amount: null,
          usageMeterId: null,
          renewalFrequency: null,
          active: true,
        },
      })
      throw new Error('Expected TRPCError BAD_REQUEST')
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError)
      expect((err as TRPCError).code).toBe('BAD_REQUEST')
      expect((err as TRPCError).message).toContain(
        'Ensure your API key is associated with a pricing model'
      )
    }
  })

  it('should throw BAD_REQUEST when dashboard has no focused pricing model', async () => {
    const orgData = await setupOrg()
    const { user, betterAuthId } = await setupUserAndApiKey({
      organizationId: orgData.organization.id,
      livemode: true,
    })

    globalThis.__mockedAuthSession = {
      user: { id: betterAuthId!, email: user.email },
    }

    const ctx = {
      organizationId: orgData.organization.id,
      apiKey: undefined,
      livemode: true,
      environment: 'live' as const,
      isApi: false as any,
      path: '',
      authScope: 'merchant' as const,
      user,
      focusedPricingModelId: undefined,
      apiKeyPricingModelId: undefined,
    }

    try {
      await featuresRouter.createCaller(ctx).create({
        feature: {
          type: FeatureType.Toggle,
          name: 'Should Fail Dashboard',
          slug: 'should-fail-dashboard',
          description: '',
          amount: null,
          usageMeterId: null,
          renewalFrequency: null,
          active: true,
        },
      })
      throw new Error('Expected TRPCError BAD_REQUEST')
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError)
      expect((err as TRPCError).code).toBe('BAD_REQUEST')
      expect((err as TRPCError).message).toContain(
        'Please select a pricing model'
      )
    }
  })
})
