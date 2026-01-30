import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PriceType,
} from '@db-core/enums'
import type { Organization } from '@db-core/schema/organizations'
import type { Price } from '@db-core/schema/prices'
import { Result } from 'better-result'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import {
  selectProductFeatures,
  updateProductFeature,
} from '@/db/tableMethods/productFeatureMethods'
import { bulkInsertResources } from '@/db/tableMethods/resourceMethods'
import type { SetupPricingModelInput } from './setupSchemas'
import { setupPricingModelTransaction } from './setupTransaction'
import {
  generateSyntheticUsagePriceSlug,
  resolveExistingIds,
  syncProductFeaturesForMultipleProducts,
} from './updateHelpers'

let organization: Organization.Record

beforeEach(async () => {
  const orgData = await setupOrg()
  organization = orgData.organization
})

afterEach(async () => {
  if (organization) {
    await teardownOrg({ organizationId: organization.id })
  }
})

describe('resolveExistingIds', () => {
  it('should create slug-to-id maps for all child entities', async () => {
    // Setup: create pricing model with features, products, prices, usage meters
    const input: SetupPricingModelInput = {
      name: 'Test Pricing Model',
      isDefault: false,
      // Usage meters use nested structure with prices
      usageMeters: [
        {
          usageMeter: {
            slug: 'api-calls',
            name: 'API Calls',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'api-usage-price',
              unitPrice: 10,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageEventsPerUnit: 100,
              trialPeriodDays: null,
            },
          ],
        },
        {
          usageMeter: {
            slug: 'storage',
            name: 'Storage',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'storage-usage-price',
              unitPrice: 5,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageEventsPerUnit: 50,
              trialPeriodDays: null,
            },
          ],
        },
      ],
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'feature-a',
          name: 'Feature A',
          description: 'A toggle feature',
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'api-credits',
          name: 'API Credits',
          description: 'Monthly API call credits',
          usageMeterSlug: 'api-calls',
          amount: 1000,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'Starter Plan',
            slug: 'starter',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'starter-monthly',
            unitPrice: 1999,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
          features: ['feature-a'],
        },
        {
          product: {
            name: 'Pro Plan',
            slug: 'pro',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'pro-monthly',
            unitPrice: 4999,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
          features: ['feature-a', 'api-credits'],
        },
        // Removed usage price products - usage prices belong to usage meters
      ],
    }

    const setupResult = await adminTransaction(async (ctx) =>
      (
        await setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          ctx
        )
      ).unwrap()
    )

    // Test: resolve IDs
    const resolvedIds = await adminTransaction(async (ctx) =>
      resolveExistingIds(setupResult.pricingModel.id, ctx.transaction)
    )

    // Verify features map
    expect(resolvedIds.features.size).toBe(2)
    expect(resolvedIds.features.has('feature-a')).toBe(true)
    expect(resolvedIds.features.has('api-credits')).toBe(true)

    const featureAId = resolvedIds.features.get('feature-a')
    const apiCreditsId = resolvedIds.features.get('api-credits')

    // Verify IDs match the created records
    const createdFeatureA = setupResult.features.find(
      (f) => f.slug === 'feature-a'
    )
    const createdApiCredits = setupResult.features.find(
      (f) => f.slug === 'api-credits'
    )
    expect(featureAId).toBe(createdFeatureA?.id)
    expect(apiCreditsId).toBe(createdApiCredits?.id)

    // Verify products map
    expect(resolvedIds.products.size).toBeGreaterThanOrEqual(2) // May include auto-generated default
    expect(resolvedIds.products.has('starter')).toBe(true)
    expect(resolvedIds.products.has('pro')).toBe(true)

    const createdStarter = setupResult.products.find(
      (p) => p.slug === 'starter'
    )
    const createdPro = setupResult.products.find(
      (p) => p.slug === 'pro'
    )
    expect(resolvedIds.products.get('starter')).toBe(
      createdStarter?.id
    )
    expect(resolvedIds.products.get('pro')).toBe(createdPro?.id)

    // Verify prices map
    expect(resolvedIds.prices.size).toBeGreaterThanOrEqual(2)
    expect(resolvedIds.prices.has('starter-monthly')).toBe(true)
    expect(resolvedIds.prices.has('pro-monthly')).toBe(true)

    const createdStarterPrice = setupResult.prices.find(
      (p) => p.slug === 'starter-monthly'
    )
    const createdProPrice = setupResult.prices.find(
      (p) => p.slug === 'pro-monthly'
    )
    expect(resolvedIds.prices.get('starter-monthly')).toBe(
      createdStarterPrice?.id
    )
    expect(resolvedIds.prices.get('pro-monthly')).toBe(
      createdProPrice?.id
    )

    // Verify usage prices are also included in the prices map
    expect(resolvedIds.prices.has('api-usage-price')).toBe(true)
    expect(resolvedIds.prices.has('storage-usage-price')).toBe(true)

    const createdApiUsagePrice = setupResult.prices.find(
      (p) => p.slug === 'api-usage-price'
    )
    const createdStorageUsagePrice = setupResult.prices.find(
      (p) => p.slug === 'storage-usage-price'
    )
    expect(resolvedIds.prices.get('api-usage-price')).toBe(
      createdApiUsagePrice?.id
    )
    expect(resolvedIds.prices.get('storage-usage-price')).toBe(
      createdStorageUsagePrice?.id
    )

    // Verify usage meters map
    expect(resolvedIds.usageMeters.size).toBe(2)
    expect(resolvedIds.usageMeters.has('api-calls')).toBe(true)
    expect(resolvedIds.usageMeters.has('storage')).toBe(true)

    const createdApiCallsMeter = setupResult.usageMeters.find(
      (m) => m.slug === 'api-calls'
    )
    const createdStorageMeter = setupResult.usageMeters.find(
      (m) => m.slug === 'storage'
    )
    expect(resolvedIds.usageMeters.get('api-calls')).toBe(
      createdApiCallsMeter?.id
    )
    expect(resolvedIds.usageMeters.get('storage')).toBe(
      createdStorageMeter?.id
    )
  })

  it('returns empty maps for pricing models with no features or usage meters', async () => {
    // Setup: pricing model with no child records
    const input: SetupPricingModelInput = {
      name: 'Empty Model',
      isDefault: false,
      usageMeters: [],
      features: [],
      products: [
        {
          product: {
            name: 'Simple Product',
            slug: 'simple',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'simple-price',
            unitPrice: 1000,
            isDefault: true,
            active: true,
          },
          features: [],
        },
      ],
    }

    const setupResult = await adminTransaction(async (ctx) =>
      (
        await setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          ctx
        )
      ).unwrap()
    )

    // Test: resolve IDs
    const resolvedIds = await adminTransaction(async (ctx) =>
      resolveExistingIds(setupResult.pricingModel.id, ctx.transaction)
    )

    // Expect: returns empty or minimal maps without error
    expect(resolvedIds.features.size).toBe(0)
    expect(resolvedIds.usageMeters.size).toBe(0)
    // Products should have at least the simple one plus auto-generated default
    expect(resolvedIds.products.size).toBeGreaterThanOrEqual(1)
    expect(resolvedIds.products.has('simple')).toBe(true)
    expect(resolvedIds.prices.size).toBeGreaterThanOrEqual(1)
    expect(resolvedIds.prices.has('simple-price')).toBe(true)
  })

  it('includes resources in the returned ID maps', async () => {
    // Setup: create pricing model
    const input: SetupPricingModelInput = {
      name: 'Resource Test Model',
      isDefault: false,
      usageMeters: [],
      features: [],
      products: [
        {
          product: {
            name: 'Basic Product',
            slug: 'basic',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'basic-price',
            unitPrice: 1000,
            isDefault: true,
            active: true,
          },
          features: [],
        },
      ],
    }

    const setupResult = await adminTransaction(async (ctx) =>
      (
        await setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          ctx
        )
      ).unwrap()
    )

    // Directly insert resources for the pricing model
    const createdResources = await adminTransaction(async (ctx) =>
      bulkInsertResources(
        [
          {
            slug: 'resource-a',
            name: 'Resource A',
            pricingModelId: setupResult.pricingModel.id,
            organizationId: organization.id,
            livemode: false,
            active: true,
          },
          {
            slug: 'resource-b',
            name: 'Resource B',
            pricingModelId: setupResult.pricingModel.id,
            organizationId: organization.id,
            livemode: false,
            active: true,
          },
        ],
        ctx.transaction
      )
    )

    // Test: resolve IDs
    const resolvedIds = await adminTransaction(async (ctx) =>
      resolveExistingIds(setupResult.pricingModel.id, ctx.transaction)
    )

    // Verify resources map exists and has correct entries
    expect(resolvedIds.resources).toBeInstanceOf(Map)
    expect(resolvedIds.resources.size).toBe(2)
    expect(resolvedIds.resources.has('resource-a')).toBe(true)
    expect(resolvedIds.resources.has('resource-b')).toBe(true)

    // Verify IDs match the created records
    const resourceA = createdResources.find(
      (r) => r.slug === 'resource-a'
    )
    const resourceB = createdResources.find(
      (r) => r.slug === 'resource-b'
    )
    expect(resolvedIds.resources.get('resource-a')).toBe(
      resourceA?.id
    )
    expect(resolvedIds.resources.get('resource-b')).toBe(
      resourceB?.id
    )
  })

  it('generates synthetic slugs for usage prices without real slugs and maps them to price IDs', async () => {
    // Setup: create pricing model with usage meter prices that have NO explicit slug
    const input: SetupPricingModelInput = {
      name: 'Synthetic Slug Test Model',
      isDefault: false,
      usageMeters: [
        {
          usageMeter: {
            slug: 'api-calls',
            name: 'API Calls',
          },
          prices: [
            {
              type: PriceType.Usage,
              // NO slug provided - should generate synthetic slug
              unitPrice: 10,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageEventsPerUnit: 100,
              trialPeriodDays: null,
            },
          ],
        },
        {
          usageMeter: {
            slug: 'storage',
            name: 'Storage',
          },
          prices: [
            {
              type: PriceType.Usage,
              // NO slug provided - should generate synthetic slug
              unitPrice: 5,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageEventsPerUnit: 50,
              trialPeriodDays: null,
            },
          ],
        },
      ],
      features: [],
      products: [
        {
          product: {
            name: 'Basic Plan',
            slug: 'basic',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'basic-monthly',
            unitPrice: 999,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
          features: [],
        },
      ],
    }

    const setupResult = await adminTransaction(async (ctx) =>
      (
        await setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          ctx
        )
      ).unwrap()
    )

    // Test: resolve IDs
    const resolvedIds = await adminTransaction(async (ctx) =>
      resolveExistingIds(setupResult.pricingModel.id, ctx.transaction)
    )

    // Find the created usage prices (they should have null slugs in DB)
    const usagePrices = setupResult.prices.filter(
      (p): p is Price.UsageRecord => p.type === PriceType.Usage
    )
    const apiCallsPrice = usagePrices.find((p) => p.unitPrice === 10)
    const storagePrice = usagePrices.find((p) => p.unitPrice === 5)

    // Verify prices were created without slugs
    // Use specific assertions to verify the price objects have expected properties
    expect(apiCallsPrice?.unitPrice).toBe(10)
    expect(storagePrice?.unitPrice).toBe(5)
    expect(apiCallsPrice?.slug).toBeNull()
    expect(storagePrice?.slug).toBeNull()

    // Generate synthetic slugs using the same logic as diffing.ts
    // Pass the meter slug for global uniqueness
    const apiCallsSyntheticSlug = generateSyntheticUsagePriceSlug(
      apiCallsPrice!,
      'api-calls'
    )
    const storageSyntheticSlug = generateSyntheticUsagePriceSlug(
      storagePrice!,
      'storage'
    )

    // Verify synthetic slugs are in the expected format
    expect(apiCallsSyntheticSlug).toMatch(/^__generated__/)
    expect(storageSyntheticSlug).toMatch(/^__generated__/)

    // Verify resolveExistingIds maps synthetic slugs to price IDs
    expect(resolvedIds.prices.has(apiCallsSyntheticSlug)).toBe(true)
    expect(resolvedIds.prices.has(storageSyntheticSlug)).toBe(true)
    expect(resolvedIds.prices.get(apiCallsSyntheticSlug)).toBe(
      apiCallsPrice!.id
    )
    expect(resolvedIds.prices.get(storageSyntheticSlug)).toBe(
      storagePrice!.id
    )
  })

  it('returns empty resources map when no resources exist', async () => {
    // Setup: create pricing model without resources
    const input: SetupPricingModelInput = {
      name: 'No Resources Model',
      isDefault: false,
      usageMeters: [],
      features: [],
      products: [
        {
          product: {
            name: 'Simple Product',
            slug: 'simple',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'simple-price',
            unitPrice: 1000,
            isDefault: true,
            active: true,
          },
          features: [],
        },
      ],
    }

    const setupResult = await adminTransaction(async (ctx) =>
      (
        await setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          ctx
        )
      ).unwrap()
    )

    // Test: resolve IDs
    const resolvedIds = await adminTransaction(async (ctx) =>
      resolveExistingIds(setupResult.pricingModel.id, ctx.transaction)
    )

    // Verify resources map exists and is empty
    expect(resolvedIds.resources).toBeInstanceOf(Map)
    expect(resolvedIds.resources.size).toBe(0)
  })
})

describe('syncProductFeaturesForMultipleProducts', () => {
  it('should batch add feature associations for multiple products', async () => {
    // Setup: create products with some features, then add more
    const input: SetupPricingModelInput = {
      name: 'Sync Test Model',
      isDefault: false,
      usageMeters: [],
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'feature-a',
          name: 'Feature A',
          description: 'Toggle A',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-b',
          name: 'Feature B',
          description: 'Toggle B',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-c',
          name: 'Feature C',
          description: 'Toggle C',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-x',
          name: 'Feature X',
          description: 'Toggle X',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-y',
          name: 'Feature Y',
          description: 'Toggle Y',
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'Product A',
            slug: 'product-a',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'product-a-price',
            unitPrice: 1000,
            isDefault: true,
            active: true,
          },
          features: ['feature-a', 'feature-b'], // Start with a and b
        },
        {
          product: {
            name: 'Product B',
            slug: 'product-b',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'product-b-price',
            unitPrice: 2000,
            isDefault: true,
            active: true,
          },
          features: ['feature-x'], // Start with x
        },
      ],
    }

    const setupResult = await adminTransaction(async (ctx) =>
      (
        await setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          ctx
        )
      ).unwrap()
    )

    // Build feature slug to ID map
    const featureSlugToIdMap = new Map<string, string>()
    for (const feature of setupResult.features) {
      featureSlugToIdMap.set(feature.slug, feature.id)
    }

    const productA = setupResult.products.find(
      (p) => p.slug === 'product-a'
    )!
    const productB = setupResult.products.find(
      (p) => p.slug === 'product-b'
    )!

    // Sync: add feature-c to product A, add feature-y to product B
    const syncResult = await comprehensiveAdminTransaction(
      async (params) => {
        const result = await syncProductFeaturesForMultipleProducts(
          {
            productsWithFeatures: [
              {
                productId: productA.id,
                desiredFeatureSlugs: [
                  'feature-a',
                  'feature-b',
                  'feature-c',
                ],
              },
              {
                productId: productB.id,
                desiredFeatureSlugs: ['feature-x', 'feature-y'],
              },
            ],
            featureSlugToIdMap,
            organizationId: organization.id,
            livemode: false,
          },
          params
        )
        return Result.ok(result)
      }
    )

    // Expect: creates productFeatures for c and y
    expect(syncResult.added.length).toBe(2)
    expect(syncResult.removed.length).toBe(0)

    // Verify the added features
    const addedFeatureIds = new Set(
      syncResult.added.map((pf) => pf.featureId)
    )
    expect(
      addedFeatureIds.has(featureSlugToIdMap.get('feature-c')!)
    ).toBe(true)
    expect(
      addedFeatureIds.has(featureSlugToIdMap.get('feature-y')!)
    ).toBe(true)
  })

  it('should batch remove feature associations for multiple products', async () => {
    // Setup
    const input: SetupPricingModelInput = {
      name: 'Removal Test Model',
      isDefault: false,
      usageMeters: [],
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'feature-a',
          name: 'Feature A',
          description: 'Toggle A',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-b',
          name: 'Feature B',
          description: 'Toggle B',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-c',
          name: 'Feature C',
          description: 'Toggle C',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-x',
          name: 'Feature X',
          description: 'Toggle X',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-y',
          name: 'Feature Y',
          description: 'Toggle Y',
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'Product A',
            slug: 'product-a',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'product-a-price',
            unitPrice: 1000,
            isDefault: true,
            active: true,
          },
          features: ['feature-a', 'feature-b', 'feature-c'], // Start with a, b, c
        },
        {
          product: {
            name: 'Product B',
            slug: 'product-b',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'product-b-price',
            unitPrice: 2000,
            isDefault: true,
            active: true,
          },
          features: ['feature-x', 'feature-y'], // Start with x, y
        },
      ],
    }

    const setupResult = await adminTransaction(async (ctx) =>
      (
        await setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          ctx
        )
      ).unwrap()
    )

    // Build feature slug to ID map
    const featureSlugToIdMap = new Map<string, string>()
    for (const feature of setupResult.features) {
      featureSlugToIdMap.set(feature.slug, feature.id)
    }

    const productA = setupResult.products.find(
      (p) => p.slug === 'product-a'
    )!
    const productB = setupResult.products.find(
      (p) => p.slug === 'product-b'
    )!

    // Sync: remove feature-c from product A, remove feature-y from product B
    const syncResult = await comprehensiveAdminTransaction(
      async (params) => {
        const result = await syncProductFeaturesForMultipleProducts(
          {
            productsWithFeatures: [
              {
                productId: productA.id,
                desiredFeatureSlugs: ['feature-a', 'feature-b'], // Remove c
              },
              {
                productId: productB.id,
                desiredFeatureSlugs: ['feature-x'], // Remove y
              },
            ],
            featureSlugToIdMap,
            organizationId: organization.id,
            livemode: false,
          },
          params
        )
        return Result.ok(result)
      }
    )

    // Expect: expires productFeatures for c and y
    expect(syncResult.removed.length).toBe(2)
    expect(syncResult.added.length).toBe(0)

    // Verify the removed features
    const removedFeatureIds = new Set(
      syncResult.removed.map((pf) => pf.featureId)
    )
    expect(
      removedFeatureIds.has(featureSlugToIdMap.get('feature-c')!)
    ).toBe(true)
    expect(
      removedFeatureIds.has(featureSlugToIdMap.get('feature-y')!)
    ).toBe(true)

    // Verify they are actually expired (have expiredAt set)
    for (const removedPf of syncResult.removed) {
      expect(typeof removedPf.expiredAt).toBe('number')
    }
  })

  it('expires old features and creates new ones when completely replacing product features', async () => {
    // Setup
    const input: SetupPricingModelInput = {
      name: 'Replacement Test Model',
      isDefault: false,
      usageMeters: [],
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'feature-a',
          name: 'Feature A',
          description: 'Toggle A',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-b',
          name: 'Feature B',
          description: 'Toggle B',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-c',
          name: 'Feature C',
          description: 'Toggle C',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-d',
          name: 'Feature D',
          description: 'Toggle D',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-x',
          name: 'Feature X',
          description: 'Toggle X',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-y',
          name: 'Feature Y',
          description: 'Toggle Y',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-z',
          name: 'Feature Z',
          description: 'Toggle Z',
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'Product A',
            slug: 'product-a',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'product-a-price',
            unitPrice: 1000,
            isDefault: true,
            active: true,
          },
          features: ['feature-a', 'feature-b'], // Start with a, b
        },
        {
          product: {
            name: 'Product B',
            slug: 'product-b',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'product-b-price',
            unitPrice: 2000,
            isDefault: true,
            active: true,
          },
          features: ['feature-x', 'feature-y'], // Start with x, y
        },
      ],
    }

    const setupResult = await adminTransaction(async (ctx) =>
      (
        await setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          ctx
        )
      ).unwrap()
    )

    // Build feature slug to ID map
    const featureSlugToIdMap = new Map<string, string>()
    for (const feature of setupResult.features) {
      featureSlugToIdMap.set(feature.slug, feature.id)
    }

    const productA = setupResult.products.find(
      (p) => p.slug === 'product-a'
    )!
    const productB = setupResult.products.find(
      (p) => p.slug === 'product-b'
    )!

    // Sync: completely replace features
    // Product A: [a, b] -> [c, d]
    // Product B: [x, y] -> [z]
    const syncResult = await comprehensiveAdminTransaction(
      async (params) => {
        const result = await syncProductFeaturesForMultipleProducts(
          {
            productsWithFeatures: [
              {
                productId: productA.id,
                desiredFeatureSlugs: ['feature-c', 'feature-d'],
              },
              {
                productId: productB.id,
                desiredFeatureSlugs: ['feature-z'],
              },
            ],
            featureSlugToIdMap,
            organizationId: organization.id,
            livemode: false,
          },
          params
        )
        return Result.ok(result)
      }
    )

    // Expect: removes a, b, x, y and adds c, d, z
    expect(syncResult.removed.length).toBe(4)
    expect(syncResult.added.length).toBe(3)

    // Verify removed
    const removedFeatureIds = new Set(
      syncResult.removed.map((pf) => pf.featureId)
    )
    expect(
      removedFeatureIds.has(featureSlugToIdMap.get('feature-a')!)
    ).toBe(true)
    expect(
      removedFeatureIds.has(featureSlugToIdMap.get('feature-b')!)
    ).toBe(true)
    expect(
      removedFeatureIds.has(featureSlugToIdMap.get('feature-x')!)
    ).toBe(true)
    expect(
      removedFeatureIds.has(featureSlugToIdMap.get('feature-y')!)
    ).toBe(true)

    // Verify added
    const addedFeatureIds = new Set(
      syncResult.added.map((pf) => pf.featureId)
    )
    expect(
      addedFeatureIds.has(featureSlugToIdMap.get('feature-c')!)
    ).toBe(true)
    expect(
      addedFeatureIds.has(featureSlugToIdMap.get('feature-d')!)
    ).toBe(true)
    expect(
      addedFeatureIds.has(featureSlugToIdMap.get('feature-z')!)
    ).toBe(true)
  })

  it('only modifies changed product features while leaving unchanged ones intact', async () => {
    // Setup
    const input: SetupPricingModelInput = {
      name: 'Mixed Changes Test Model',
      isDefault: false,
      usageMeters: [],
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'feature-a',
          name: 'Feature A',
          description: 'Toggle A',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-b',
          name: 'Feature B',
          description: 'Toggle B',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-x',
          name: 'Feature X',
          description: 'Toggle X',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-y',
          name: 'Feature Y',
          description: 'Toggle Y',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-p',
          name: 'Feature P',
          description: 'Toggle P',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-q',
          name: 'Feature Q',
          description: 'Toggle Q',
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'Product A',
            slug: 'product-a',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'product-a-price',
            unitPrice: 1000,
            isDefault: true,
            active: true,
          },
          features: ['feature-a', 'feature-b'], // No change
        },
        {
          product: {
            name: 'Product B',
            slug: 'product-b',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'product-b-price',
            unitPrice: 2000,
            isDefault: true,
            active: true,
          },
          features: ['feature-x'], // Add y
        },
        {
          product: {
            name: 'Product C',
            slug: 'product-c',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'product-c-price',
            unitPrice: 3000,
            isDefault: true,
            active: true,
          },
          features: ['feature-p', 'feature-q'], // Remove q
        },
      ],
    }

    const setupResult = await adminTransaction(async (ctx) =>
      (
        await setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          ctx
        )
      ).unwrap()
    )

    // Build feature slug to ID map
    const featureSlugToIdMap = new Map<string, string>()
    for (const feature of setupResult.features) {
      featureSlugToIdMap.set(feature.slug, feature.id)
    }

    const productA = setupResult.products.find(
      (p) => p.slug === 'product-a'
    )!
    const productB = setupResult.products.find(
      (p) => p.slug === 'product-b'
    )!
    const productC = setupResult.products.find(
      (p) => p.slug === 'product-c'
    )!

    // Sync:
    // Product A: [a, b] -> [a, b] (no change)
    // Product B: [x] -> [x, y] (add y)
    // Product C: [p, q] -> [p] (remove q)
    const syncResult = await comprehensiveAdminTransaction(
      async (params) => {
        const result = await syncProductFeaturesForMultipleProducts(
          {
            productsWithFeatures: [
              {
                productId: productA.id,
                desiredFeatureSlugs: ['feature-a', 'feature-b'],
              },
              {
                productId: productB.id,
                desiredFeatureSlugs: ['feature-x', 'feature-y'],
              },
              {
                productId: productC.id,
                desiredFeatureSlugs: ['feature-p'],
              },
            ],
            featureSlugToIdMap,
            organizationId: organization.id,
            livemode: false,
          },
          params
        )
        return Result.ok(result)
      }
    )

    // Expect: only y added and q removed
    expect(syncResult.added.length).toBe(1)
    expect(syncResult.removed.length).toBe(1)

    // Verify added is y
    const addedFeatureIds = new Set(
      syncResult.added.map((pf) => pf.featureId)
    )
    expect(
      addedFeatureIds.has(featureSlugToIdMap.get('feature-y')!)
    ).toBe(true)

    // Verify removed is q
    const removedFeatureIds = new Set(
      syncResult.removed.map((pf) => pf.featureId)
    )
    expect(
      removedFeatureIds.has(featureSlugToIdMap.get('feature-q')!)
    ).toBe(true)
  })

  it('returns empty added and removed arrays when given empty products list', async () => {
    // Test: call with empty productsWithFeatures array
    const syncResult = await comprehensiveAdminTransaction(
      async (params) => {
        const result = await syncProductFeaturesForMultipleProducts(
          {
            productsWithFeatures: [],
            featureSlugToIdMap: new Map(),
            organizationId: organization.id,
            livemode: false,
          },
          params
        )
        return Result.ok(result)
      }
    )

    // Expect: returns empty added and removed arrays, no errors
    expect(syncResult.added).toEqual([])
    expect(syncResult.removed).toEqual([])
  })

  it('unexpires previously expired features when re-added and returns them in added array', async () => {
    // Setup: create product with feature-a and feature-b
    const input: SetupPricingModelInput = {
      name: 'Unexpire Test Model',
      isDefault: false,
      usageMeters: [],
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'feature-a',
          name: 'Feature A',
          description: 'Toggle A',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-b',
          name: 'Feature B',
          description: 'Toggle B',
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'Product A',
            slug: 'product-a',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'product-a-price',
            unitPrice: 1000,
            isDefault: true,
            active: true,
          },
          features: ['feature-a', 'feature-b'],
        },
      ],
    }

    const setupResult = await adminTransaction(async (ctx) =>
      (
        await setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          ctx
        )
      ).unwrap()
    )

    const productA = setupResult.products.find(
      (p) => p.slug === 'product-a'
    )!

    // Build feature slug to ID map
    const featureSlugToIdMap = new Map<string, string>()
    for (const feature of setupResult.features) {
      featureSlugToIdMap.set(feature.slug, feature.id)
    }

    // Step 1: Remove feature-b (this will expire it)
    const removeResult = await comprehensiveAdminTransaction(
      async (params) => {
        const result = await syncProductFeaturesForMultipleProducts(
          {
            productsWithFeatures: [
              {
                productId: productA.id,
                desiredFeatureSlugs: ['feature-a'], // Remove feature-b
              },
            ],
            featureSlugToIdMap,
            organizationId: organization.id,
            livemode: false,
          },
          params
        )
        return Result.ok(result)
      }
    )

    // Verify feature-b was removed (expired)
    expect(removeResult.removed.length).toBe(1)
    expect(removeResult.removed[0].featureId).toBe(
      featureSlugToIdMap.get('feature-b')!
    )
    expect(typeof removeResult.removed[0].expiredAt).toBe('number')

    // Step 2: Re-add feature-b (this should unexpire it)
    const reAddResult = await comprehensiveAdminTransaction(
      async (params) => {
        const result = await syncProductFeaturesForMultipleProducts(
          {
            productsWithFeatures: [
              {
                productId: productA.id,
                desiredFeatureSlugs: ['feature-a', 'feature-b'], // Re-add feature-b
              },
            ],
            featureSlugToIdMap,
            organizationId: organization.id,
            livemode: false,
          },
          params
        )
        return Result.ok(result)
      }
    )

    // Verify feature-b was added back (unexpired)
    expect(reAddResult.added.length).toBe(1)
    expect(reAddResult.added[0].featureId).toBe(
      featureSlugToIdMap.get('feature-b')!
    )
    expect(reAddResult.added[0].expiredAt).toBeNull()
    expect(reAddResult.removed.length).toBe(0)

    // Verify the database state: both features should now be active
    const finalProductFeatures = await adminTransaction(async (ctx) =>
      selectProductFeatures(
        { productId: productA.id },
        ctx.transaction
      )
    )

    const activeFeatures = finalProductFeatures.filter(
      (pf) => !pf.expiredAt
    )
    expect(activeFeatures.length).toBe(2)

    const featureIds = new Set(
      activeFeatures.map((pf) => pf.featureId)
    )
    expect(featureIds.has(featureSlugToIdMap.get('feature-a')!)).toBe(
      true
    )
    expect(featureIds.has(featureSlugToIdMap.get('feature-b')!)).toBe(
      true
    )
  })

  it('skips re-expiring already expired features', async () => {
    // Setup
    const input: SetupPricingModelInput = {
      name: 'Already Expired Test Model',
      isDefault: false,
      usageMeters: [],
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'feature-a',
          name: 'Feature A',
          description: 'Toggle A',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-b',
          name: 'Feature B',
          description: 'Toggle B',
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'Product A',
            slug: 'product-a',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'product-a-price',
            unitPrice: 1000,
            isDefault: true,
            active: true,
          },
          features: ['feature-a', 'feature-b'],
        },
      ],
    }

    const setupResult = await adminTransaction(async (ctx) =>
      (
        await setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          ctx
        )
      ).unwrap()
    )

    const productA = setupResult.products.find(
      (p) => p.slug === 'product-a'
    )!

    // Manually expire feature-b's productFeature
    await adminTransaction(async (ctx) => {
      const productFeatures = await selectProductFeatures(
        { productId: productA.id },
        ctx.transaction
      )
      const featureBProductFeature = productFeatures.find(
        (pf) =>
          pf.featureId ===
          setupResult.features.find((f) => f.slug === 'feature-b')?.id
      )
      if (featureBProductFeature) {
        await updateProductFeature(
          {
            id: featureBProductFeature.id,
            expiredAt: Date.now() - 1000,
          },
          ctx
        )
      }
    })

    // Build feature slug to ID map
    const featureSlugToIdMap = new Map<string, string>()
    for (const feature of setupResult.features) {
      featureSlugToIdMap.set(feature.slug, feature.id)
    }

    // Sync: request only feature-a (feature-b is already expired)
    const syncResult = await comprehensiveAdminTransaction(
      async (params) => {
        const result = await syncProductFeaturesForMultipleProducts(
          {
            productsWithFeatures: [
              {
                productId: productA.id,
                desiredFeatureSlugs: ['feature-a'],
              },
            ],
            featureSlugToIdMap,
            organizationId: organization.id,
            livemode: false,
          },
          params
        )
        return Result.ok(result)
      }
    )

    // Expect: no removals because feature-b was already expired
    expect(syncResult.removed.length).toBe(0)
    expect(syncResult.added.length).toBe(0)
  })
})
