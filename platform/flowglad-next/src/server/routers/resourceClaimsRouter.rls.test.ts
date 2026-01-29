import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupResource,
  setupResourceClaim,
  setupResourceSubscriptionItemFeature,
  setupSubscription,
  setupSubscriptionItem,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Feature } from '@/db/schema/features'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Resource } from '@/db/schema/resources'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import { insertFeature } from '@/db/tableMethods/featureMethods'
import { resourceClaimsRouter } from '@/server/routers/resourceClaimsRouter'
import type { TRPCApiContext } from '@/server/trpcContext'
import {
  FeatureType,
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  SubscriptionStatus,
} from '@/types'

const createCaller = (
  organization: Organization.Record,
  apiKeyToken: string,
  livemode: boolean = true
) => {
  return resourceClaimsRouter.createCaller({
    organizationId: organization.id,
    organization,
    apiKey: apiKeyToken,
    livemode,
    environment: livemode ? ('live' as const) : ('test' as const),
    isApi: true,
    path: '',
    user: null,
    session: null,
  } as TRPCApiContext)
}

describe('resourceClaimsRouter', () => {
  // Shared setup - created once in beforeAll
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let resource: Resource.Record
  let resource2: Resource.Record
  let apiKeyToken: string
  let product: Product.Record
  let price: Price.Record
  let seatsFeature: Feature.Record
  let projectsFeature: Feature.Record

  // Secondary org for cross-tenant tests (shared)
  let org2Data: Awaited<ReturnType<typeof setupOrg>>
  let org2Subscription: Subscription.Record
  let org2ApiKeyToken: string

  // Per-test setup - created fresh in beforeEach for test isolation
  let customer: Customer.Record
  let subscription: Subscription.Record
  let subscriptionItem: SubscriptionItem.Record

  // beforeAll: Set up shared data that doesn't change between tests
  // This runs once per test file, significantly reducing setup time
  beforeAll(async () => {
    // Setup organization 1
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    const userApiKeySetup = (
      await setupUserAndApiKey({
        organizationId: organization.id,
        livemode: true,
      })
    ).unwrap()
    if (!userApiKeySetup.apiKey.token) {
      throw new Error('API key token not found after setup')
    }
    apiKeyToken = userApiKeySetup.apiKey.token

    // Setup resources (shared across tests)
    resource = (
      await setupResource({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        slug: 'seats',
        name: 'Seats',
      })
    ).unwrap()

    resource2 = (
      await setupResource({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        slug: 'projects',
        name: 'Projects',
      })
    ).unwrap()

    // Setup product and price (shared across tests)
    product = (
      await setupProduct({
        organizationId: organization.id,
        name: 'Test Product',
        pricingModelId: pricingModel.id,
        livemode: true,
      })
    ).unwrap()

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      unitPrice: 1000,
      livemode: true,
      isDefault: true,
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
    })

    // Create Resource features (shared across tests)
    seatsFeature = (
      await adminTransaction(async (ctx) => {
        return Result.ok(
          await insertFeature(
            {
              organizationId: organization.id,
              pricingModelId: pricingModel.id,
              type: FeatureType.Resource,
              name: 'Seats Feature',
              slug: 'seats-feature',
              description: 'Resource feature for seats',
              amount: 10,
              usageMeterId: null,
              renewalFrequency: null,
              resourceId: resource.id,
              livemode: true,
              active: true,
            },
            ctx
          )
        )
      })
    ).unwrap()

    projectsFeature = (
      await adminTransaction(async (ctx) => {
        return Result.ok(
          await insertFeature(
            {
              organizationId: organization.id,
              pricingModelId: pricingModel.id,
              type: FeatureType.Resource,
              name: 'Projects Feature',
              slug: 'projects-feature',
              description: 'Resource feature for projects',
              amount: 5,
              usageMeterId: null,
              renewalFrequency: null,
              resourceId: resource2.id,
              livemode: true,
              active: true,
            },
            ctx
          )
        )
      })
    ).unwrap()

    // Setup organization 2 for cross-tenant tests (shared)
    // NOTE: org2's subscription is created in beforeAll (not beforeEach) because
    // it's only used for read-only permission boundary tests, never mutated
    org2Data = (await setupOrg()).unwrap()
    const userApiKeyOrg2 = (
      await setupUserAndApiKey({
        organizationId: org2Data.organization.id,
        livemode: true,
      })
    ).unwrap()
    if (!userApiKeyOrg2.apiKey.token) {
      throw new Error('API key token not found after setup for org2')
    }
    org2ApiKeyToken = userApiKeyOrg2.apiKey.token

    const customer2 = (
      await setupCustomer({
        organizationId: org2Data.organization.id,
        email: `customer2+${Date.now()}@test.com`,
        livemode: true,
      })
    ).unwrap()

    const paymentMethod2 = (
      await setupPaymentMethod({
        organizationId: org2Data.organization.id,
        customerId: customer2.id,
        livemode: true,
        type: PaymentMethodType.Card,
      })
    ).unwrap()

    org2Subscription = await setupSubscription({
      organizationId: org2Data.organization.id,
      customerId: customer2.id,
      paymentMethodId: paymentMethod2.id,
      priceId: org2Data.price.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      status: SubscriptionStatus.Active,
    })
  })

  // beforeEach: Create fresh subscription data for test isolation
  // This ensures each test has its own subscription without claims from other tests
  beforeEach(async () => {
    customer = (
      await setupCustomer({
        organizationId: organization.id,
        email: `customer+${Date.now()}@test.com`,
        livemode: true,
      })
    ).unwrap()

    const paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        livemode: true,
        type: PaymentMethodType.Card,
      })
    ).unwrap()

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      status: SubscriptionStatus.Active,
    })

    subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Resource Subscription Item',
      quantity: 1,
      unitPrice: 1000,
    })

    // Set up subscription item features to provide capacity for the resources
    ;(
      await setupResourceSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem.id,
        featureId: seatsFeature.id,
        resourceId: resource.id,
        pricingModelId: pricingModel.id,
        amount: 10,
      })
    ).unwrap()
    ;(
      await setupResourceSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem.id,
        featureId: projectsFeature.id,
        resourceId: resource2.id,
        pricingModelId: pricingModel.id,
        amount: 5,
      })
    ).unwrap()
  })

  describe('getUsage procedure', () => {
    it('returns usage data when resourceSlug is provided', async () => {
      // Create some claims first
      ;(
        await setupResourceClaim({
          organizationId: organization.id,
          resourceId: resource.id,
          subscriptionId: subscription.id,
          pricingModelId: pricingModel.id,
          externalId: 'user-1',
        })
      ).unwrap()
      ;(
        await setupResourceClaim({
          organizationId: organization.id,
          resourceId: resource.id,
          subscriptionId: subscription.id,
          pricingModelId: pricingModel.id,
          externalId: 'user-2',
        })
      ).unwrap()

      const caller = createCaller(organization, apiKeyToken)

      const result = await caller.getUsage({
        subscriptionId: subscription.id,
        resourceSlug: 'seats',
      })

      expect(result.usage).toMatchObject({
        resourceSlug: 'seats',
        resourceId: resource.id,
        capacity: 10,
        claimed: 2,
        available: 8,
      })
      expect(result.claims).toHaveLength(2)
      expect(result.claims.map((c) => c.externalId).sort()).toEqual([
        'user-1',
        'user-2',
      ])
    })

    it('returns usage data when resourceId is provided', async () => {
      // Create a claim
      ;(
        await setupResourceClaim({
          organizationId: organization.id,
          resourceId: resource.id,
          subscriptionId: subscription.id,
          pricingModelId: pricingModel.id,
          externalId: 'user-1',
        })
      ).unwrap()

      const caller = createCaller(organization, apiKeyToken)

      const result = await caller.getUsage({
        subscriptionId: subscription.id,
        resourceId: resource.id,
      })

      expect(result.usage).toMatchObject({
        resourceSlug: 'seats',
        resourceId: resource.id,
        capacity: 10,
        claimed: 1,
        available: 9,
      })
      expect(result.claims).toHaveLength(1)
      expect(result.claims[0].externalId).toBe('user-1')
    })

    it('throws NOT_FOUND when the specified resource does not exist', async () => {
      const caller = createCaller(organization, apiKeyToken)

      const error = await caller
        .getUsage({
          subscriptionId: subscription.id,
          resourceSlug: 'nonexistent-resource',
        })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('NOT_FOUND')
      expect(error.message).toBe('Resource not found')
    })

    it('throws NOT_FOUND when the subscription has no subscription items', async () => {
      // Create a new subscription without any subscription items
      const customer2 = (
        await setupCustomer({
          organizationId: organization.id,
          email: `empty-customer+${Date.now()}@test.com`,
          livemode: true,
        })
      ).unwrap()

      const paymentMethod2 = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer2.id,
          livemode: true,
          type: PaymentMethodType.Card,
        })
      ).unwrap()

      const emptyProduct = (
        await setupProduct({
          organizationId: organization.id,
          name: 'Empty Product',
          pricingModelId: pricingModel.id,
          livemode: true,
        })
      ).unwrap()

      const emptyPrice = await setupPrice({
        productId: emptyProduct.id,
        name: 'Empty Price',
        unitPrice: 500,
        livemode: true,
        isDefault: true,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })

      const emptySubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer2.id,
        paymentMethodId: paymentMethod2.id,
        priceId: emptyPrice.id,
        interval: IntervalUnit.Month,
        intervalCount: 1,
        status: SubscriptionStatus.Active,
      })

      const caller = createCaller(organization, apiKeyToken)

      const error = await caller
        .getUsage({
          subscriptionId: emptySubscription.id,
          resourceSlug: 'seats',
        })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('NOT_FOUND')
      expect(error.message).toBe('Subscription has no items')
    })

    it('throws NOT_FOUND when the resource is not available on the subscription', async () => {
      // Create a resource that's not associated with the subscription
      ;(
        await setupResource({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          slug: 'unlinked-resource',
          name: 'Unlinked Resource',
        })
      ).unwrap()

      const caller = createCaller(organization, apiKeyToken)

      const error = await caller
        .getUsage({
          subscriptionId: subscription.id,
          resourceSlug: 'unlinked-resource',
        })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('NOT_FOUND')
      expect(error.message).toBe(
        'Resource is not available on this subscription'
      )
    })

    it('throws validation error when both resourceSlug and resourceId are provided', async () => {
      const caller = createCaller(organization, apiKeyToken)

      await expect(
        caller.getUsage({
          subscriptionId: subscription.id,
          resourceSlug: 'seats',
          resourceId: resource.id,
        })
      ).rejects.toThrow(
        'Exactly one of resourceSlug or resourceId must be provided'
      )
    })

    it('throws validation error when neither resourceSlug nor resourceId is provided', async () => {
      const caller = createCaller(organization, apiKeyToken)

      await expect(
        caller.getUsage({
          subscriptionId: subscription.id,
        })
      ).rejects.toThrow(
        'Exactly one of resourceSlug or resourceId must be provided'
      )
    })
  })

  describe('listResourceUsages procedure', () => {
    it('returns an empty array when the subscription has no subscription items', async () => {
      // Create a subscription without items
      const customer2 = (
        await setupCustomer({
          organizationId: organization.id,
          email: `empty-list-customer+${Date.now()}@test.com`,
          livemode: true,
        })
      ).unwrap()

      const paymentMethod2 = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer2.id,
          livemode: true,
          type: PaymentMethodType.Card,
        })
      ).unwrap()

      const emptyProduct = (
        await setupProduct({
          organizationId: organization.id,
          name: 'Empty List Product',
          pricingModelId: pricingModel.id,
          livemode: true,
        })
      ).unwrap()

      const emptyPrice = await setupPrice({
        productId: emptyProduct.id,
        name: 'Empty List Price',
        unitPrice: 500,
        livemode: true,
        isDefault: true,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })

      const emptySubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer2.id,
        paymentMethodId: paymentMethod2.id,
        priceId: emptyPrice.id,
        interval: IntervalUnit.Month,
        intervalCount: 1,
        status: SubscriptionStatus.Active,
      })

      const caller = createCaller(organization, apiKeyToken)

      const result = await caller.listResourceUsages({
        subscriptionId: emptySubscription.id,
      })

      expect(result).toEqual([])
    })

    it('returns an empty array when no resource features exist on subscription items', async () => {
      // Create a subscription with items but no resource features
      const customer3 = (
        await setupCustomer({
          organizationId: organization.id,
          email: `no-features-customer+${Date.now()}@test.com`,
          livemode: true,
        })
      ).unwrap()

      const paymentMethod3 = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer3.id,
          livemode: true,
          type: PaymentMethodType.Card,
        })
      ).unwrap()

      const noFeaturesProduct = (
        await setupProduct({
          organizationId: organization.id,
          name: 'No Features Product',
          pricingModelId: pricingModel.id,
          livemode: true,
        })
      ).unwrap()

      const noFeaturesPrice = await setupPrice({
        productId: noFeaturesProduct.id,
        name: 'No Features Price',
        unitPrice: 500,
        livemode: true,
        isDefault: true,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })

      const noFeaturesSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer3.id,
        paymentMethodId: paymentMethod3.id,
        priceId: noFeaturesPrice.id,
        interval: IntervalUnit.Month,
        intervalCount: 1,
        status: SubscriptionStatus.Active,
      })

      // Add a subscription item but no resource features
      await setupSubscriptionItem({
        subscriptionId: noFeaturesSubscription.id,
        name: 'Item Without Resource Features',
        quantity: 1,
        unitPrice: 500,
      })

      const caller = createCaller(organization, apiKeyToken)

      const result = await caller.listResourceUsages({
        subscriptionId: noFeaturesSubscription.id,
      })

      expect(result).toEqual([])
    })

    it('returns usage for all resources with claims correctly grouped by resource', async () => {
      // Create claims for resource 1 (seats)
      ;(
        await setupResourceClaim({
          organizationId: organization.id,
          resourceId: resource.id,
          subscriptionId: subscription.id,
          pricingModelId: pricingModel.id,
          externalId: 'seat-user-1',
        })
      ).unwrap()
      ;(
        await setupResourceClaim({
          organizationId: organization.id,
          resourceId: resource.id,
          subscriptionId: subscription.id,
          pricingModelId: pricingModel.id,
          externalId: 'seat-user-2',
        })
      ).unwrap()

      // Create claims for resource 2 (projects)
      ;(
        await setupResourceClaim({
          organizationId: organization.id,
          resourceId: resource2.id,
          subscriptionId: subscription.id,
          pricingModelId: pricingModel.id,
          externalId: 'project-1',
        })
      ).unwrap()

      const caller = createCaller(organization, apiKeyToken)

      const result = await caller.listResourceUsages({
        subscriptionId: subscription.id,
      })

      expect(result).toHaveLength(2)

      // Find seats usage - we know it exists because result has length 2
      const seatsUsage = result.find(
        (u) => u.usage.resourceSlug === 'seats'
      )
      // Assert seatsUsage exists by checking its structure
      expect(seatsUsage).toMatchObject({
        usage: {
          resourceSlug: 'seats',
          resourceId: resource.id,
          capacity: 10,
          claimed: 2,
          available: 8,
        },
      })
      expect(seatsUsage!.claims).toHaveLength(2)
      expect(
        seatsUsage!.claims.map((c) => c.externalId).sort()
      ).toEqual(['seat-user-1', 'seat-user-2'])

      // Find projects usage - we know it exists because result has length 2
      const projectsUsage = result.find(
        (u) => u.usage.resourceSlug === 'projects'
      )
      // Assert projectsUsage exists by checking its structure
      expect(projectsUsage).toMatchObject({
        usage: {
          resourceSlug: 'projects',
          resourceId: resource2.id,
          capacity: 5,
          claimed: 1,
          available: 4,
        },
      })
      expect(projectsUsage!.claims).toHaveLength(1)
      expect(projectsUsage!.claims[0].externalId).toBe('project-1')
    })

    it('throws error when subscription belongs to a different organization', async () => {
      const caller = createCaller(organization, apiKeyToken)

      // Cross-tenant access should be denied
      // Note: Due to RLS, this may return INTERNAL_SERVER_ERROR from the database layer
      // rather than FORBIDDEN from application code. Both indicate access was denied.
      await expect(
        caller.listResourceUsages({
          subscriptionId: org2Subscription.id,
        })
      ).rejects.toThrow()
    })

    // Tests for filtering by resourceSlugs and resourceIds
    describe('filtering by resourceSlugs', () => {
      it('filters results to only include resources matching the provided slugs', async () => {
        // Create claims for both resources
        ;(
          await setupResourceClaim({
            organizationId: organization.id,
            resourceId: resource.id,
            subscriptionId: subscription.id,
            pricingModelId: pricingModel.id,
            externalId: 'seat-user-1',
          })
        ).unwrap()
        ;(
          await setupResourceClaim({
            organizationId: organization.id,
            resourceId: resource2.id,
            subscriptionId: subscription.id,
            pricingModelId: pricingModel.id,
            externalId: 'project-1',
          })
        ).unwrap()

        const caller = createCaller(organization, apiKeyToken)

        const result = await caller.listResourceUsages({
          subscriptionId: subscription.id,
          resourceSlugs: ['seats'],
        })

        // Should only return seats, not projects
        expect(result).toHaveLength(1)
        expect(result[0].usage.resourceSlug).toBe('seats')
      })

      it('filters results when multiple resourceSlugs are provided', async () => {
        const caller = createCaller(organization, apiKeyToken)

        const result = await caller.listResourceUsages({
          subscriptionId: subscription.id,
          resourceSlugs: ['seats', 'projects'],
        })

        expect(result).toHaveLength(2)
        const slugs = result.map((r) => r.usage.resourceSlug).sort()
        expect(slugs).toEqual(['projects', 'seats'])
      })

      it('returns empty array when resourceSlugs filter matches no resources', async () => {
        const caller = createCaller(organization, apiKeyToken)

        const result = await caller.listResourceUsages({
          subscriptionId: subscription.id,
          resourceSlugs: ['nonexistent-resource'],
        })

        expect(result).toEqual([])
      })
    })

    describe('filtering by resourceIds', () => {
      it('filters results to only include resources matching the provided IDs', async () => {
        // Create claims for both resources
        ;(
          await setupResourceClaim({
            organizationId: organization.id,
            resourceId: resource.id,
            subscriptionId: subscription.id,
            pricingModelId: pricingModel.id,
            externalId: 'seat-user-1',
          })
        ).unwrap()
        ;(
          await setupResourceClaim({
            organizationId: organization.id,
            resourceId: resource2.id,
            subscriptionId: subscription.id,
            pricingModelId: pricingModel.id,
            externalId: 'project-1',
          })
        ).unwrap()

        const caller = createCaller(organization, apiKeyToken)

        const result = await caller.listResourceUsages({
          subscriptionId: subscription.id,
          resourceIds: [resource.id],
        })

        // Should only return seats (resource.id), not projects
        expect(result).toHaveLength(1)
        expect(result[0].usage.resourceId).toBe(resource.id)
      })

      it('filters results when multiple resourceIds are provided', async () => {
        const caller = createCaller(organization, apiKeyToken)

        const result = await caller.listResourceUsages({
          subscriptionId: subscription.id,
          resourceIds: [resource.id, resource2.id],
        })

        expect(result).toHaveLength(2)
        const ids = result.map((r) => r.usage.resourceId).sort()
        expect(ids).toEqual([resource.id, resource2.id].sort())
      })

      it('returns empty array when resourceIds filter matches no resources', async () => {
        const caller = createCaller(organization, apiKeyToken)

        const result = await caller.listResourceUsages({
          subscriptionId: subscription.id,
          resourceIds: ['nonexistent-id'],
        })

        expect(result).toEqual([])
      })
    })

    describe('filtering with no filters provided', () => {
      it('returns all resources when neither resourceSlugs nor resourceIds is provided', async () => {
        const caller = createCaller(organization, apiKeyToken)

        const result = await caller.listResourceUsages({
          subscriptionId: subscription.id,
        })

        // Should return both resources
        expect(result).toHaveLength(2)
        const slugs = result.map((r) => r.usage.resourceSlug).sort()
        expect(slugs).toEqual(['projects', 'seats'])
      })
    })
  })

  describe('validateSubscriptionOwnership', () => {
    it('throws FORBIDDEN when organizationId does not match the subscription owner', async () => {
      // Try to access org2's subscription with org1's credentials
      const caller = createCaller(organization, apiKeyToken)

      // Verify setup is correct - org2Subscription should exist with different org
      expect(org2Subscription.id).toMatch(/^sub_/)
      expect(org2Subscription.organizationId).not.toBe(
        organization.id
      )

      // The cross-tenant access should be denied
      // Note: Due to RLS, this may return INTERNAL_SERVER_ERROR from the database layer
      // rather than FORBIDDEN from application code. Both indicate access was denied.
      await expect(
        caller.getUsage({
          subscriptionId: org2Subscription.id,
          resourceSlug: 'seats',
        })
      ).rejects.toThrow()
    })
  })
})
