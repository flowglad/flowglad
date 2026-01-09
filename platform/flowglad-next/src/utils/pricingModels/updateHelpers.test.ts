import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import {
  selectProductFeatures,
  updateProductFeature,
} from '@/db/tableMethods/productFeatureMethods'
import {
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PriceType,
} from '@/types'
import type { SetupPricingModelInput } from './setupSchemas'
import { setupPricingModelTransaction } from './setupTransaction'
import {
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
      // PR 5: Usage meters now use nested structure with prices
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
        // PR 5: Removed usage price products - usage prices now belong to usage meters
      ],
    }

    const setupResult = await adminTransaction(
      async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
    )

    // Test: resolve IDs
    const resolvedIds = await adminTransaction(
      async ({ transaction }) =>
        resolveExistingIds(setupResult.pricingModel.id, transaction)
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

    const setupResult = await adminTransaction(
      async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
    )

    // Test: resolve IDs
    const resolvedIds = await adminTransaction(
      async ({ transaction }) =>
        resolveExistingIds(setupResult.pricingModel.id, transaction)
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

    const setupResult = await adminTransaction(
      async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
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
    const syncResult = await adminTransaction(
      async ({ transaction }) =>
        syncProductFeaturesForMultipleProducts(
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
          transaction
        )
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

    const setupResult = await adminTransaction(
      async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
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
    const syncResult = await adminTransaction(
      async ({ transaction }) =>
        syncProductFeaturesForMultipleProducts(
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
          transaction
        )
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
      expect(removedPf.expiredAt).not.toBeNull()
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

    const setupResult = await adminTransaction(
      async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
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
    const syncResult = await adminTransaction(
      async ({ transaction }) =>
        syncProductFeaturesForMultipleProducts(
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
          transaction
        )
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

    const setupResult = await adminTransaction(
      async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
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
    const syncResult = await adminTransaction(
      async ({ transaction }) =>
        syncProductFeaturesForMultipleProducts(
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
          transaction
        )
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
    const syncResult = await adminTransaction(
      async ({ transaction }) =>
        syncProductFeaturesForMultipleProducts(
          {
            productsWithFeatures: [],
            featureSlugToIdMap: new Map(),
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
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

    const setupResult = await adminTransaction(
      async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
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
    const removeResult = await adminTransaction(
      async ({ transaction }) =>
        syncProductFeaturesForMultipleProducts(
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
          transaction
        )
    )

    // Verify feature-b was removed (expired)
    expect(removeResult.removed.length).toBe(1)
    expect(removeResult.removed[0].featureId).toBe(
      featureSlugToIdMap.get('feature-b')
    )
    expect(removeResult.removed[0].expiredAt).not.toBeNull()

    // Step 2: Re-add feature-b (this should unexpire it)
    const reAddResult = await adminTransaction(
      async ({ transaction }) =>
        syncProductFeaturesForMultipleProducts(
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
          transaction
        )
    )

    // Verify feature-b was added back (unexpired)
    expect(reAddResult.added.length).toBe(1)
    expect(reAddResult.added[0].featureId).toBe(
      featureSlugToIdMap.get('feature-b')
    )
    expect(reAddResult.added[0].expiredAt).toBeNull()
    expect(reAddResult.removed.length).toBe(0)

    // Verify the database state: both features should now be active
    const finalProductFeatures = await adminTransaction(
      async ({ transaction }) =>
        selectProductFeatures({ productId: productA.id }, transaction)
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

    const setupResult = await adminTransaction(
      async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
    )

    const productA = setupResult.products.find(
      (p) => p.slug === 'product-a'
    )!

    // Manually expire feature-b's productFeature
    await adminTransaction(async ({ transaction }) => {
      const productFeatures = await selectProductFeatures(
        { productId: productA.id },
        transaction
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
          transaction
        )
      }
    })

    // Build feature slug to ID map
    const featureSlugToIdMap = new Map<string, string>()
    for (const feature of setupResult.features) {
      featureSlugToIdMap.set(feature.slug, feature.id)
    }

    // Sync: request only feature-a (feature-b is already expired)
    const syncResult = await adminTransaction(
      async ({ transaction }) =>
        syncProductFeaturesForMultipleProducts(
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
          transaction
        )
    )

    // Expect: no removals because feature-b was already expired
    expect(syncResult.removed.length).toBe(0)
    expect(syncResult.added.length).toBe(0)
  })
})
