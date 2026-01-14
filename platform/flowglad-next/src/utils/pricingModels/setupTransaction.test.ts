import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import {
  CurrencyCode,
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PriceType,
} from '@/types'
import { hashData } from '@/utils/backendCore'
import type {
  SetupPricingModelInput,
  SetupPricingModelProductInput,
} from '@/utils/pricingModels/setupSchemas'
import {
  externalIdFromProductData,
  setupPricingModelTransaction,
} from '@/utils/pricingModels/setupTransaction'

let organization: Organization.Record

beforeEach(async () => {
  // Set up a fresh organization for each test to ensure isolation
  const orgData = await setupOrg()
  organization = orgData.organization
})

afterEach(async () => {
  // Clean up the organization and all related data after each test
  if (organization) {
    await teardownOrg({ organizationId: organization.id })
  }
})

describe('externalIdFromProductData', () => {
  it('returns the hashData value for a product input', () => {
    const dummy: SetupPricingModelProductInput = {
      product: {
        name: 'Test',
        default: false,
        description: '',
        slug: 'test',
        active: true,
        imageURL: null,
        singularQuantityLabel: null,
        pluralQuantityLabel: null,
      },
      price: {
        type: PriceType.Subscription,
        slug: 'test-price',
        isDefault: true,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        usageMeterId: null,
        usageEventsPerUnit: null,
        active: true,
      },
      features: [],
    }
    const expected = hashData(
      JSON.stringify({ ...dummy, pricingModelId: 'pricingModelId' })
    )
    expect(
      externalIdFromProductData(dummy, 'pricingModelId')
    ).toEqual(expected)
  })

  it('returns a consistent hash for identical inputs', () => {
    const dummy: SetupPricingModelProductInput = {
      product: {
        name: 'Test',
        default: false,
        description: '',
        slug: 'test',
        active: true,
        imageURL: null,
        singularQuantityLabel: null,
        pluralQuantityLabel: null,
      },
      price: {
        type: PriceType.Subscription,
        slug: 'test-price',
        isDefault: true,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        usageMeterId: null,
        usageEventsPerUnit: null,
        active: true,
      },
      features: [],
    }
    const h1 = externalIdFromProductData(dummy, 'pricingModelId')
    const h2 = externalIdFromProductData(dummy, 'pricingModelId')
    expect(h1).toEqual(h2)
  })
})

describe('setupPricingModelTransaction (integration)', () => {
  it('throws if input validation fails', async () => {
    await expect(
      adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input: {} as any,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
      )
    ).rejects.toThrow()
  })

  it('throws when a UsageCreditGrant feature has no matching usage meter', async () => {
    const input: SetupPricingModelInput = {
      name: 'PricingModel',
      isDefault: false,
      usageMeters: [],
      features: [
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'f1',
          name: 'Feat1',
          description: '',
          usageMeterSlug: 'missing',
          amount: 1,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'P',
            default: false,
            description: '',
            slug: 'p',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'p-price',
            isDefault: true,
            unitPrice: 1000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            usageMeterId: null,
            usageEventsPerUnit: null,
            active: true,
          },
          features: ['f1'],
        },
      ],
    }
    await expect(
      adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          { input, organizationId: organization.id, livemode: false },
          transaction
        )
      )
    ).rejects.toThrow('Usage meter with slug missing does not exist')
  })

  it('creates pricingModel, features, products, prices, and productFeatures on happy path', async () => {
    const input: SetupPricingModelInput = {
      name: 'MyPricingModel',
      isDefault: true,
      usageMeters: [{ slug: 'um', name: 'UM' }],
      features: [
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'f1',
          name: 'Feat1',
          description: '',
          usageMeterSlug: 'um',
          amount: 10,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'f2',
          name: 'Feat2',
          description: '',
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'P1',
            default: false,
            description: 'd',
            slug: 'p1',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'ps',
            isDefault: true,
            name: 'Test Price',
            usageMeterId: null,
            trialPeriodDays: null,
            usageEventsPerUnit: null,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 100,
          },
          features: ['f1', 'f2'],
        },
        {
          product: {
            name: 'usage',
            default: false,
            description: 'd',
            slug: 'p2',
            active: true,
            imageURL: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          price: {
            type: PriceType.Usage,
            slug: 'pu',
            isDefault: true,
            name: 'Test Price',
            usageMeterSlug: 'um',
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            active: true,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 5,
          },
          features: [],
        },
      ],
    }

    const result = await adminTransaction(async ({ transaction }) =>
      setupPricingModelTransaction(
        { input, organizationId: organization.id, livemode: false },
        transaction
      )
    )

    // PricingModel
    expect(typeof result.pricingModel.id).toBe('string')
    expect(result.pricingModel.name).toEqual(input.name)
    expect(result.pricingModel.livemode).toEqual(false)
    expect(result.pricingModel.organizationId).toEqual(
      organization.id
    )
    expect(result.pricingModel.isDefault).toEqual(input.isDefault)

    // Features
    expect(result.features).toHaveLength(input.features.length)
    expect(result.features.map((f) => f.slug)).toEqual(
      input.features.map((f) => f.slug)
    )

    // Products - should have user products + auto-generated default product
    expect(result.products).toHaveLength(input.products.length + 1) // +1 for auto-generated default
    const userProductSlugs = input.products.map((p) => p.product.slug)
    const resultProductSlugs = result.products.map((p) => p.slug)
    expect(resultProductSlugs).toEqual(
      expect.arrayContaining(userProductSlugs)
    )
    expect(resultProductSlugs).toContain('free') // Auto-generated default product
    expect(
      result.products.every((p) => typeof p.externalId === 'string')
    ).toBe(true)

    // Prices - should have user prices + auto-generated default price
    const allPriceSlugs = input.products.map((p) => p.price.slug!)
    expect(result.prices).toHaveLength(allPriceSlugs.length + 1) // +1 for auto-generated default
    const resultPriceSlugs = result.prices.map((pr) => pr.slug)
    expect(resultPriceSlugs).toEqual(
      expect.arrayContaining(allPriceSlugs)
    )
    expect(resultPriceSlugs).toContain('free') // Auto-generated default price

    // ProductFeatures
    const totalFeatures = input.products.flatMap((p) => p.features)
    expect(result.productFeatures).toHaveLength(totalFeatures.length)
    const productIds = result.products.map((p) => p.id)
    const featureIds = result.features.map((f) => f.id)
    result.productFeatures.forEach((pf) => {
      expect(productIds).toContain(pf.productId)
      expect(featureIds).toContain(pf.featureId)
    })
  })

  describe('Default Product Auto-Generation', () => {
    it('should auto-generate default free plan when no default product provided', async () => {
      const input: SetupPricingModelInput = {
        name: 'Test Pricing Model',
        isDefault: false,
        usageMeters: [],
        features: [],
        products: [], // No products provided
      }

      const result = await adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          { input, organizationId: organization.id, livemode: false },
          transaction
        )
      )

      // Should have auto-generated default product
      expect(result.products).toHaveLength(1)
      const defaultProduct = result.products[0]
      expect(defaultProduct.name).toEqual('Free Plan')
      expect(defaultProduct.slug).toEqual('free')
      expect(defaultProduct.default).toBe(true)

      // Should have auto-generated default price
      expect(result.prices).toHaveLength(1)
      const defaultPrice = result.prices[0]
      expect(defaultPrice.name).toEqual('Free Plan')
      expect(defaultPrice.slug).toEqual('free')
      expect(defaultPrice.unitPrice).toEqual(0)
      expect(defaultPrice.isDefault).toBe(true)
      expect(defaultPrice.type).toEqual(PriceType.Subscription)
      expect(defaultPrice.intervalUnit).toEqual(IntervalUnit.Month)
      expect(defaultPrice.intervalCount).toEqual(1)
    })

    it('should use organization default currency for auto-generated price', async () => {
      const input: SetupPricingModelInput = {
        name: 'Test Pricing Model',
        isDefault: false,
        usageMeters: [],
        features: [],
        products: [],
      }

      const result = await adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          { input, organizationId: organization.id, livemode: false },
          transaction
        )
      )

      const defaultPrice = result.prices[0]
      expect(defaultPrice.currency).toEqual(
        organization.defaultCurrency
      )
    })
  })

  describe('Default Product Validation', () => {
    it('should accept valid user-provided default product', async () => {
      const input: SetupPricingModelInput = {
        name: 'Test Pricing Model',
        isDefault: false,
        usageMeters: [],
        features: [],
        products: [
          {
            product: {
              name: 'Custom Free Plan',
              default: true,
              description: 'Custom free plan',
              slug: 'custom-free',
              active: true,
              imageURL: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            price: {
              type: PriceType.Subscription,
              slug: 'custom-free-price',
              isDefault: true,
              name: 'Custom Free',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 0, // Zero price
            },
            features: [],
          },
        ],
      }

      const result = await adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          { input, organizationId: organization.id, livemode: false },
          transaction
        )
      )

      // Should have user-provided default product, no auto-generated one
      expect(result.products).toHaveLength(1)
      expect(result.products[0].name).toEqual('Custom Free Plan')
      expect(result.products[0].default).toBe(true)
    })

    it('should reject multiple default products', async () => {
      const input: SetupPricingModelInput = {
        name: 'Test Pricing Model',
        isDefault: false,
        usageMeters: [],
        features: [],
        products: [
          {
            product: {
              name: 'Default Product 1',
              default: true,
              description: '',
              slug: 'default-1',
              active: true,
              imageURL: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            price: {
              type: PriceType.Subscription,
              slug: 'default-1-price',
              isDefault: true,
              unitPrice: 0,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              usageMeterId: null,
              usageEventsPerUnit: null,
              active: true,
            },
            features: [],
          },
          {
            product: {
              name: 'Default Product 2',
              default: true,
              description: '',
              slug: 'default-2',
              active: true,
              imageURL: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            price: {
              type: PriceType.Subscription,
              slug: 'default-2-price',
              isDefault: true,
              unitPrice: 0,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              usageMeterId: null,
              usageEventsPerUnit: null,
              active: true,
            },
            features: [],
          },
        ],
      }

      await expect(
        adminTransaction(async ({ transaction }) =>
          setupPricingModelTransaction(
            {
              input,
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )
        )
      ).rejects.toThrow('Multiple default products not allowed')
    })

    it('should reject default product with non-zero price', async () => {
      const input: SetupPricingModelInput = {
        name: 'Test Pricing Model',
        isDefault: false,
        usageMeters: [],
        features: [],
        products: [
          {
            product: {
              name: 'Invalid Default',
              default: true,
              description: '',
              slug: 'invalid-default',
              active: true,
              imageURL: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            price: {
              type: PriceType.Subscription,
              slug: 'invalid-price',
              isDefault: true,
              name: 'Invalid Price',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 100, // Non-zero price - should fail
            },
            features: [],
          },
        ],
      }

      await expect(
        adminTransaction(async ({ transaction }) =>
          setupPricingModelTransaction(
            {
              input,
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )
        )
      ).rejects.toThrow('Default products must have zero price')
    })

    it('should reject default product with trials', async () => {
      const input: SetupPricingModelInput = {
        name: 'Test Pricing Model',
        isDefault: false,
        usageMeters: [],
        features: [],
        products: [
          {
            product: {
              name: 'Invalid Default',
              default: true,
              description: '',
              slug: 'invalid-default',
              active: true,
              imageURL: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            price: {
              type: PriceType.Subscription,
              slug: 'invalid-price',
              isDefault: true,
              name: 'Invalid Price',
              usageMeterId: null,
              trialPeriodDays: 7, // Trial days - should fail
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 0,
            },
            features: [],
          },
        ],
      }

      await expect(
        adminTransaction(async ({ transaction }) =>
          setupPricingModelTransaction(
            {
              input,
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )
        )
      ).rejects.toThrow('Default products cannot have trials')
    })
  })

  describe('Resource Creation', () => {
    it('creates resources and Resource features with correct resourceId when resources array is provided', async () => {
      const input: SetupPricingModelInput = {
        name: 'Resource Test Pricing Model',
        isDefault: false,
        usageMeters: [],
        resources: [
          {
            slug: 'seats',
            name: 'Seats',
            active: true,
          },
          {
            slug: 'storage-gb',
            name: 'Storage (GB)',
            active: true,
          },
        ],
        features: [
          {
            type: FeatureType.Resource,
            slug: 'seat-allocation',
            name: 'Seat Allocation',
            description: 'Number of seats included',
            resourceSlug: 'seats',
            amount: 5,
            active: true,
          },
          {
            type: FeatureType.Resource,
            slug: 'storage-allocation',
            name: 'Storage Allocation',
            description: 'Storage space in GB',
            resourceSlug: 'storage-gb',
            amount: 100,
            active: true,
          },
          {
            type: FeatureType.Toggle,
            slug: 'basic-access',
            name: 'Basic Access',
            description: 'Basic access toggle',
            active: true,
          },
        ],
        products: [
          {
            product: {
              name: 'Pro Plan',
              default: false,
              description: 'Pro plan with resources',
              slug: 'pro-plan',
              active: true,
              imageURL: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            price: {
              type: PriceType.Subscription,
              slug: 'pro-monthly',
              isDefault: true,
              unitPrice: 2900,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              usageMeterId: null,
              usageEventsPerUnit: null,
              active: true,
            },
            features: [
              'seat-allocation',
              'storage-allocation',
              'basic-access',
            ],
          },
        ],
      }

      const result = await adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          { input, organizationId: organization.id, livemode: false },
          transaction
        )
      )

      // Verify resources were created
      expect(result.resources).toHaveLength(2)
      const resourceSlugs = result.resources.map((r) => r.slug)
      expect(resourceSlugs).toContain('seats')
      expect(resourceSlugs).toContain('storage-gb')

      // Verify resources have correct properties
      const seatsResource = result.resources.find(
        (r) => r.slug === 'seats'
      )
      expect(seatsResource?.name).toBe('Seats')
      expect(seatsResource?.active).toBe(true)
      expect(seatsResource?.pricingModelId).toBe(
        result.pricingModel.id
      )
      expect(seatsResource?.organizationId).toBe(organization.id)

      // Verify Resource features were created with correct resourceId
      const resourceFeatures = result.features.filter(
        (f) => f.type === FeatureType.Resource
      )
      expect(resourceFeatures).toHaveLength(2)

      const seatFeature = resourceFeatures.find(
        (f) => f.slug === 'seat-allocation'
      )
      expect(seatFeature?.resourceId).toBe(seatsResource?.id)
      expect(seatFeature?.amount).toBe(5)
      expect(seatFeature?.usageMeterId).toBe(null)

      const storageResource = result.resources.find(
        (r) => r.slug === 'storage-gb'
      )
      const storageFeature = resourceFeatures.find(
        (f) => f.slug === 'storage-allocation'
      )
      expect(storageFeature?.resourceId).toBe(storageResource?.id)
      expect(storageFeature?.amount).toBe(100)

      // Verify Toggle feature also created correctly alongside Resource features
      const toggleFeature = result.features.find(
        (f) => f.type === FeatureType.Toggle
      )
      expect(toggleFeature?.slug).toBe('basic-access')
      expect(toggleFeature?.resourceId).toBe(null)
      expect(toggleFeature?.usageMeterId).toBe(null)
    })

    it('throws when Resource feature references non-existent resource slug', async () => {
      const input: SetupPricingModelInput = {
        name: 'Invalid Resource Reference',
        isDefault: false,
        usageMeters: [],
        resources: [
          {
            slug: 'existing-resource',
            name: 'Existing Resource',
          },
        ],
        features: [
          {
            type: FeatureType.Resource,
            slug: 'invalid-feature',
            name: 'Invalid Feature',
            description: 'References non-existent resource',
            resourceSlug: 'non-existent-resource',
            amount: 10,
            active: true,
          },
        ],
        products: [
          {
            product: {
              name: 'Test Product',
              default: false,
              description: '',
              slug: 'test-product',
              active: true,
              imageURL: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            price: {
              type: PriceType.Subscription,
              slug: 'test-price',
              isDefault: true,
              unitPrice: 1000,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              usageMeterId: null,
              usageEventsPerUnit: null,
              active: true,
            },
            features: ['invalid-feature'],
          },
        ],
      }

      await expect(
        adminTransaction(async ({ transaction }) =>
          setupPricingModelTransaction(
            {
              input,
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )
        )
      ).rejects.toThrow(
        'Resource with slug non-existent-resource does not exist'
      )
    })

    it('handles empty resources array when no Resource features are defined', async () => {
      const input: SetupPricingModelInput = {
        name: 'No Resources Model',
        isDefault: false,
        usageMeters: [],
        resources: [],
        features: [
          {
            type: FeatureType.Toggle,
            slug: 'simple-toggle',
            name: 'Simple Toggle',
            description: 'Just a toggle',
            active: true,
          },
        ],
        products: [
          {
            product: {
              name: 'Simple Product',
              default: false,
              description: '',
              slug: 'simple-product',
              active: true,
              imageURL: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            price: {
              type: PriceType.Subscription,
              slug: 'simple-price',
              isDefault: true,
              unitPrice: 500,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              usageMeterId: null,
              usageEventsPerUnit: null,
              active: true,
            },
            features: ['simple-toggle'],
          },
        ],
      }

      const result = await adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          { input, organizationId: organization.id, livemode: false },
          transaction
        )
      )

      expect(result.resources).toHaveLength(0)
      expect(result.features).toHaveLength(1)
      expect(result.features[0].type).toBe(FeatureType.Toggle)
    })

    it('creates mixed feature types (Toggle, UsageCreditGrant, Resource) in same pricing model', async () => {
      const input: SetupPricingModelInput = {
        name: 'Mixed Features Model',
        isDefault: false,
        usageMeters: [
          {
            slug: 'api-calls',
            name: 'API Calls',
          },
        ],
        resources: [
          {
            slug: 'team-members',
            name: 'Team Members',
          },
        ],
        features: [
          {
            type: FeatureType.Toggle,
            slug: 'dashboard-access',
            name: 'Dashboard Access',
            description: 'Access to dashboard',
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
          {
            type: FeatureType.Resource,
            slug: 'team-member-allocation',
            name: 'Team Member Allocation',
            description: 'Number of team members',
            resourceSlug: 'team-members',
            amount: 10,
            active: true,
          },
        ],
        products: [
          {
            product: {
              name: 'Team Plan',
              default: false,
              description: 'Team plan with all features',
              slug: 'team-plan',
              active: true,
              imageURL: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            price: {
              type: PriceType.Usage,
              slug: 'team-usage',
              isDefault: true,
              unitPrice: 10,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              usageMeterSlug: 'api-calls',
              usageEventsPerUnit: 100,
              trialPeriodDays: null,
              active: true,
            },
            features: [
              'dashboard-access',
              'api-credits',
              'team-member-allocation',
            ],
          },
        ],
      }

      const result = await adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          { input, organizationId: organization.id, livemode: false },
          transaction
        )
      )

      // Verify all entity types created
      expect(result.usageMeters).toHaveLength(1)
      expect(result.resources).toHaveLength(1)
      expect(result.features).toHaveLength(3)

      // Verify each feature type
      const toggleFeature = result.features.find(
        (f) => f.type === FeatureType.Toggle
      )
      expect(toggleFeature?.slug).toBe('dashboard-access')
      expect(toggleFeature?.usageMeterId).toBe(null)
      expect(toggleFeature?.resourceId).toBe(null)

      const usageCreditFeature = result.features.find(
        (f) => f.type === FeatureType.UsageCreditGrant
      )
      expect(usageCreditFeature?.slug).toBe('api-credits')
      expect(usageCreditFeature?.usageMeterId).toBe(
        result.usageMeters[0].id
      )
      expect(usageCreditFeature?.resourceId).toBe(null)
      expect(usageCreditFeature?.amount).toBe(1000)

      const resourceFeature = result.features.find(
        (f) => f.type === FeatureType.Resource
      )
      expect(resourceFeature?.slug).toBe('team-member-allocation')
      expect(resourceFeature?.resourceId).toBe(result.resources[0].id)
      expect(resourceFeature?.usageMeterId).toBe(null)
      expect(resourceFeature?.amount).toBe(10)

      // Verify product features
      expect(result.productFeatures).toHaveLength(3)
    })

    it('sets resource active to true by default when not specified', async () => {
      const input: SetupPricingModelInput = {
        name: 'Default Active Resource Model',
        isDefault: false,
        usageMeters: [],
        resources: [
          {
            slug: 'default-active',
            name: 'Default Active Resource',
            // active not specified - should default to true
          },
        ],
        features: [
          {
            type: FeatureType.Resource,
            slug: 'default-active-feature',
            name: 'Default Active Feature',
            description: 'Feature with default active resource',
            resourceSlug: 'default-active',
            amount: 1,
            active: true,
          },
        ],
        products: [
          {
            product: {
              name: 'Test Product',
              default: false,
              description: '',
              slug: 'test-product-default',
              active: true,
              imageURL: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            price: {
              type: PriceType.Subscription,
              slug: 'test-price-default',
              isDefault: true,
              unitPrice: 100,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              usageMeterId: null,
              usageEventsPerUnit: null,
              active: true,
            },
            features: ['default-active-feature'],
          },
        ],
      }

      const result = await adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          { input, organizationId: organization.id, livemode: false },
          transaction
        )
      )

      expect(result.resources).toHaveLength(1)
      expect(result.resources[0].active).toBe(true)
    })
  })

  describe('Input Validation', () => {
    it('should reject input with names exceeding length limits', async () => {
      const longName = 'A'.repeat(300) // Exceeds 255 character limit
      const input: SetupPricingModelInput = {
        name: longName,
        isDefault: false,
        usageMeters: [],
        features: [],
        products: [],
      }

      await expect(
        adminTransaction(async ({ transaction }) =>
          setupPricingModelTransaction(
            {
              input,
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )
        )
      ).rejects.toThrow('Field must be less than 255 characters')
    })

    it('should reject input with empty name', async () => {
      const input: SetupPricingModelInput = {
        name: '',
        isDefault: false,
        usageMeters: [],
        features: [],
        products: [],
      }

      await expect(
        adminTransaction(async ({ transaction }) =>
          setupPricingModelTransaction(
            {
              input,
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )
        )
      ).rejects.toThrow('Field is required')
    })

    it('should reject input with invalid currency codes', async () => {
      const input: SetupPricingModelInput = {
        name: 'Test Pricing Model',
        isDefault: false,
        usageMeters: [],
        features: [],
        products: [
          {
            product: {
              name: 'Test Product',
              default: false,
              description: '',
              slug: 'test-product',
              active: true,
              imageURL: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            price: {
              type: PriceType.Subscription,
              slug: 'test-price',
              isDefault: true,
              name: 'Test Price',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 100,
              // @ts-expect-error Testing invalid currency value for validation
              currency: 'INVALID_CURRENCY',
            },
            features: [],
          },
        ],
      }

      await expect(
        adminTransaction(async ({ transaction }) =>
          setupPricingModelTransaction(
            {
              input,
              organizationId: organization.id,
              livemode: false,
            },
            transaction
          )
        )
      ).rejects.toThrow(/Invalid option: expected one of/)
    })
  })
})
