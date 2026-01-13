import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import {
  selectFeaturesByProductFeatureWhere,
  updateProductFeature,
} from '@/db/tableMethods/productFeatureMethods'
import {
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PriceType,
} from '@/types'
import { getPricingModelSetupData } from './setupHelpers'
import {
  type SetupPricingModelInput,
  setupPricingModelSchema,
} from './setupSchemas'
import { setupPricingModelTransaction } from './setupTransaction'

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

describe('getPricingModelSetupData', () => {
  it('should fetch and transform a complete pricing model with all related entities', async () => {
    // First, create a pricing model with all the complex parts
    const originalInput: SetupPricingModelInput = {
      name: 'Test Pricing Model',
      isDefault: false,
      usageMeters: [
        {
          slug: 'api-calls',
          name: 'API Calls',
        },
        {
          slug: 'storage',
          name: 'Storage',
        },
      ],
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'basic-feature',
          name: 'Basic Feature',
          description: 'A basic toggle feature',
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
            description: 'Perfect for getting started',
            imageURL: 'https://example.com/starter.png',
            default: false,
            active: true,
            singularQuantityLabel: 'seat',
            pluralQuantityLabel: 'seats',
          },
          price: {
            type: PriceType.Subscription,
            name: 'Monthly Starter',
            slug: 'starter-monthly',
            unitPrice: 1999,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            trialPeriodDays: 14,
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
          features: ['basic-feature', 'api-credits'],
        },
        {
          product: {
            name: 'Pro Plan',
            slug: 'pro',
            description: 'For professionals',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.Subscription,
            name: 'Monthly Pro',
            slug: 'pro-monthly',
            unitPrice: 4999,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
          features: ['basic-feature', 'api-credits'],
        },
        {
          product: {
            name: 'API Usage',
            slug: 'api-usage',
            description: 'Pay per API call',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.Usage,
            name: 'Extra API Calls',
            slug: 'api-usage-price',
            unitPrice: 10,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            usageMeterSlug: 'api-calls',
            usageEventsPerUnit: 100,
            trialPeriodDays: null,
          },
          features: [],
        },
        {
          product: {
            name: 'Storage Usage',
            slug: 'storage-usage',
            description: 'Pay per storage',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.Usage,
            name: 'Storage Overages',
            slug: 'storage-usage-price',
            unitPrice: 5,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            usageMeterSlug: 'storage',
            usageEventsPerUnit: 50,
            trialPeriodDays: null,
          },
          features: [],
        },
        {
          product: {
            name: 'Add-on',
            slug: 'addon',
            description: 'One-time purchase',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            name: 'One-time Setup',
            slug: 'addon-setup',
            unitPrice: 9999,
            isDefault: true,
            active: true,
          },
          features: [],
        },
      ],
    }

    // Create the pricing model using setupPricingModelTransaction
    const setupResult = await adminTransaction(
      async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input: originalInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
    )

    // Now fetch it back using getPricingModelSetupData
    const fetchedData = await adminTransaction(
      async ({ transaction }) =>
        getPricingModelSetupData(
          setupResult.pricingModel.id,
          transaction
        )
    )

    // Validate the output using the schema
    const parseResult = setupPricingModelSchema.safeParse(fetchedData)
    expect(parseResult.success).toBe(true)

    // Verify the basic structure
    expect(fetchedData.name).toBe(originalInput.name)
    expect(fetchedData.isDefault).toBe(originalInput.isDefault)

    // Verify usage meters
    expect(fetchedData.usageMeters).toHaveLength(
      originalInput.usageMeters.length
    )
    const usageMeterSlugs = fetchedData.usageMeters.map((m) => m.slug)
    expect(usageMeterSlugs).toEqual(
      expect.arrayContaining(['api-calls', 'storage'])
    )

    // Verify features
    expect(fetchedData.features).toHaveLength(
      originalInput.features.length
    )
    const toggleFeature = fetchedData.features.find(
      (f) => f.type === FeatureType.Toggle
    )
    expect(toggleFeature).toMatchObject({ slug: 'basic-feature' })
    expect(toggleFeature?.slug).toBe('basic-feature')

    const creditFeature = fetchedData.features.find(
      (f) => f.type === FeatureType.UsageCreditGrant
    )
    expect(typeof creditFeature).toBe('object')
    if (creditFeature?.type === FeatureType.UsageCreditGrant) {
      expect(creditFeature.usageMeterSlug).toBe('api-calls')
      expect(creditFeature.amount).toBe(1000)
    }

    // Verify products (should include auto-generated default + our 5 products)
    expect(fetchedData.products.length).toBeGreaterThanOrEqual(5)

    const starterProduct = fetchedData.products.find(
      (p) => p.product.slug === 'starter'
    )
    expect(typeof starterProduct).toBe('object')
    expect(starterProduct?.product.name).toBe('Starter Plan')
    expect(starterProduct?.product.description).toBe(
      'Perfect for getting started'
    )
    expect(starterProduct?.product.imageURL).toBe(
      'https://example.com/starter.png'
    )
    expect(starterProduct?.product.singularQuantityLabel).toBe('seat')
    expect(starterProduct?.product.pluralQuantityLabel).toBe('seats')

    // Verify price on starter product
    expect(typeof starterProduct?.price).toBe('object')
    const starterPrice = starterProduct?.price
    expect(starterPrice?.type).toBe(PriceType.Subscription)
    if (starterPrice?.type === PriceType.Subscription) {
      expect(starterPrice.unitPrice).toBe(1999)
      expect(starterPrice.intervalUnit).toBe(IntervalUnit.Month)
      expect(starterPrice.trialPeriodDays).toBe(14)
      expect(starterPrice.usageMeterId).toBe(null)
      expect(starterPrice.usageEventsPerUnit).toBe(null)
    }

    // Verify Pro product
    const proProduct = fetchedData.products.find(
      (p) => p.product.slug === 'pro'
    )
    expect(typeof proProduct).toBe('object')
    expect(proProduct?.price?.type).toBe(PriceType.Subscription)

    // Verify API Usage product
    const apiUsageProduct = fetchedData.products.find(
      (p) => p.product.slug === 'api-usage'
    )
    expect(typeof apiUsageProduct).toBe('object')
    const apiUsagePrice = apiUsageProduct?.price
    expect(apiUsagePrice?.type).toBe(PriceType.Usage)
    if (apiUsagePrice?.type === PriceType.Usage) {
      expect(apiUsagePrice.usageMeterSlug).toBe('api-calls')
      expect(apiUsagePrice.usageEventsPerUnit).toBe(100)
      expect(apiUsagePrice.trialPeriodDays).toBe(null)
      expect(apiUsagePrice.isDefault).toBe(true)
      expect(apiUsagePrice.active).toBe(true)
    }

    // Verify Storage Usage product
    const storageUsageProduct = fetchedData.products.find(
      (p) => p.product.slug === 'storage-usage'
    )
    const storageUsagePrice = storageUsageProduct?.price
    expect(storageUsagePrice?.type).toBe(PriceType.Usage)
    if (storageUsagePrice?.type === PriceType.Usage) {
      expect(storageUsagePrice.usageMeterSlug).toBe('storage')
      expect(storageUsagePrice.usageEventsPerUnit).toBe(50)
      expect(storageUsagePrice.trialPeriodDays).toBe(null)
      expect(storageUsagePrice.isDefault).toBe(true)
      expect(storageUsagePrice.active).toBe(true)
    }

    // Verify single payment product
    const addonProduct = fetchedData.products.find(
      (p) => p.product.slug === 'addon'
    )
    expect(typeof addonProduct).toBe('object')
    const singlePaymentPrice = addonProduct?.price
    expect(singlePaymentPrice?.type).toBe(PriceType.SinglePayment)

    // Verify product features
    expect(starterProduct?.features).toEqual(
      expect.arrayContaining(['basic-feature', 'api-credits'])
    )
    expect(addonProduct?.features).toHaveLength(0)
  })

  it('should throw an error if pricing model is not found', async () => {
    await expect(
      adminTransaction(async ({ transaction }) =>
        getPricingModelSetupData('non-existent-id', transaction)
      )
    ).rejects.toThrow()
  })

  it('should handle a minimal pricing model with no usage meters or features', async () => {
    const minimalInput: SetupPricingModelInput = {
      name: 'Minimal Model',
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
            input: minimalInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
    )

    const fetchedData = await adminTransaction(
      async ({ transaction }) =>
        getPricingModelSetupData(
          setupResult.pricingModel.id,
          transaction
        )
    )

    // Validate with schema
    const parseResult = setupPricingModelSchema.safeParse(fetchedData)
    expect(parseResult.success).toBe(true)

    expect(fetchedData.usageMeters).toHaveLength(0)
    expect(fetchedData.features).toHaveLength(0)
    expect(fetchedData.products.length).toBeGreaterThanOrEqual(1)
  })

  it('should only include active default prices in the output', async () => {
    const input: SetupPricingModelInput = {
      name: 'Filter Test Model',
      isDefault: false,
      usageMeters: [],
      features: [],
      products: [
        {
          product: {
            name: 'Test Product',
            slug: 'test-product',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'active-default-price',
            name: 'Active Default Price',
            unitPrice: 1000,
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

    const fetchedData = await adminTransaction(
      async ({ transaction }) =>
        getPricingModelSetupData(
          setupResult.pricingModel.id,
          transaction
        )
    )

    // Validate with schema
    const parseResult = setupPricingModelSchema.safeParse(fetchedData)
    expect(parseResult.success).toBe(true)

    // Find the test product
    const fetchedProduct = fetchedData.products.find(
      (p) => p.product.slug === 'test-product'
    )
    expect(typeof fetchedProduct).toBe('object')

    // Verify only the active default price is included
    expect(fetchedProduct?.price?.slug).toBe('active-default-price')
    expect(fetchedProduct?.price?.isDefault).toBe(true)
    expect(fetchedProduct?.price?.active).toBe(true)
    expect(fetchedProduct?.price?.unitPrice).toBe(1000)
  })

  it('should exclude inactive features from the output', async () => {
    const input: SetupPricingModelInput = {
      name: 'Inactive Features Test Model',
      isDefault: false,
      usageMeters: [
        {
          slug: 'test-meter',
          name: 'Test Meter',
        },
      ],
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'active-toggle',
          name: 'Active Toggle',
          description: 'This feature is active',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'inactive-toggle',
          name: 'Inactive Toggle',
          description: 'This feature is inactive',
          active: false,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'active-credit',
          name: 'Active Credit',
          description: 'Active usage credit',
          usageMeterSlug: 'test-meter',
          amount: 500,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'inactive-credit',
          name: 'Inactive Credit',
          description: 'Inactive usage credit',
          usageMeterSlug: 'test-meter',
          amount: 1000,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: false,
        },
      ],
      products: [
        {
          product: {
            name: 'Test Product',
            slug: 'test-product-inactive-features',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'test-price',
            unitPrice: 5000,
            isDefault: true,
            active: true,
          },
          features: [
            'active-toggle',
            'inactive-toggle',
            'active-credit',
            'inactive-credit',
          ],
        },
        {
          product: {
            name: 'Usage Product',
            slug: 'usage-product',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.Usage,
            slug: 'test-meter-usage',
            unitPrice: 10,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            usageMeterSlug: 'test-meter',
            usageEventsPerUnit: 100,
            trialPeriodDays: null,
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

    const fetchedData = await adminTransaction(
      async ({ transaction }) =>
        getPricingModelSetupData(
          setupResult.pricingModel.id,
          transaction
        )
    )

    // Validate with schema
    const parseResult = setupPricingModelSchema.safeParse(fetchedData)
    expect(parseResult.success).toBe(true)

    // Should only return active features (2 out of 4)
    expect(fetchedData.features).toHaveLength(2)
    const featureSlugs = fetchedData.features.map((f) => f.slug)
    expect(featureSlugs).toContain('active-toggle')
    expect(featureSlugs).toContain('active-credit')
    expect(featureSlugs).not.toContain('inactive-toggle')
    expect(featureSlugs).not.toContain('inactive-credit')

    // Product should only have active features in its features array
    const testProduct = fetchedData.products.find(
      (p) => p.product.slug === 'test-product-inactive-features'
    )
    expect(typeof testProduct).toBe('object')
    expect(testProduct?.features).toHaveLength(2)
    expect(testProduct?.features).toContain('active-toggle')
    expect(testProduct?.features).toContain('active-credit')
    expect(testProduct?.features).not.toContain('inactive-toggle')
    expect(testProduct?.features).not.toContain('inactive-credit')
  })

  it('should exclude expired product-feature associations from the output', async () => {
    // First, create a pricing model with features
    const input: SetupPricingModelInput = {
      name: 'Expired Associations Test Model',
      isDefault: false,
      usageMeters: [],
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'feature-a',
          name: 'Feature A',
          description: 'First feature',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-b',
          name: 'Feature B',
          description: 'Second feature',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-c',
          name: 'Feature C',
          description: 'Third feature',
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'Test Product Associations',
            slug: 'test-product-associations',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'test-price-associations',
            unitPrice: 3000,
            isDefault: true,
            active: true,
          },
          features: ['feature-a', 'feature-b', 'feature-c'],
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

    // Now manually expire one of the product-feature associations
    await adminTransaction(async ({ transaction }) => {
      const product = setupResult.products.find(
        (p) => p.slug === 'test-product-associations'
      )
      if (!product) {
        throw new Error('Test setup failed: product not found')
      }
      const productFeaturesResult =
        await selectFeaturesByProductFeatureWhere(
          { productId: product.id },
          transaction
        )

      // Find the product feature for 'feature-b' and expire it
      const featureBAssociation = productFeaturesResult.find(
        (pf) => pf.feature.slug === 'feature-b'
      )
      expect(typeof featureBAssociation).toBe('object')

      if (featureBAssociation) {
        await updateProductFeature(
          {
            id: featureBAssociation.productFeature.id,
            expiredAt: Date.now() - 1000, // Expired in the past
          },
          transaction
        )
      }
    })

    // Fetch the pricing model data
    const fetchedData = await adminTransaction(
      async ({ transaction }) =>
        getPricingModelSetupData(
          setupResult.pricingModel.id,
          transaction
        )
    )

    // Validate with schema
    const parseResult = setupPricingModelSchema.safeParse(fetchedData)
    expect(parseResult.success).toBe(true)

    // All 3 features should still exist at the pricing model level
    expect(fetchedData.features).toHaveLength(3)
    const featureSlugs = fetchedData.features.map((f) => f.slug)
    expect(featureSlugs).toContain('feature-a')
    expect(featureSlugs).toContain('feature-b')
    expect(featureSlugs).toContain('feature-c')

    // But the product should only have 2 features (excluding the expired association)
    const testProduct = fetchedData.products.find(
      (p) => p.product.slug === 'test-product-associations'
    )
    expect(typeof testProduct).toBe('object')
    expect(testProduct?.features).toHaveLength(2)
    expect(testProduct?.features).toContain('feature-a')
    expect(testProduct?.features).toContain('feature-c')
    expect(testProduct?.features).not.toContain('feature-b')
  })

  it('should export and transform Resource features with correct resourceSlug', async () => {
    const originalInput: SetupPricingModelInput = {
      name: 'Resource Export Test Model',
      isDefault: false,
      usageMeters: [],
      resources: [
        {
          slug: 'seats',
          name: 'Team Seats',
          active: true,
        },
        {
          slug: 'storage',
          name: 'Storage Allocation',
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
          description: 'Storage space included',
          resourceSlug: 'storage',
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
            name: 'Resource Plan',
            slug: 'resource-plan',
            description: 'Plan with resources',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.Subscription,
            name: 'Monthly Resource',
            slug: 'resource-monthly',
            unitPrice: 2900,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
          features: [
            'seat-allocation',
            'storage-allocation',
            'basic-access',
          ],
        },
      ],
    }

    // Create the pricing model
    const setupResult = await adminTransaction(
      async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input: originalInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
    )

    // Fetch it back using getPricingModelSetupData
    const fetchedData = await adminTransaction(
      async ({ transaction }) =>
        getPricingModelSetupData(
          setupResult.pricingModel.id,
          transaction
        )
    )

    // Validate the output using the schema
    const parseResult = setupPricingModelSchema.safeParse(fetchedData)
    expect(parseResult.success).toBe(true)

    // Verify resources were exported
    expect(fetchedData.resources).toHaveLength(2)
    const resourceSlugs = fetchedData.resources?.map((r) => r.slug)
    expect(resourceSlugs).toContain('seats')
    expect(resourceSlugs).toContain('storage')

    // Verify resource properties
    const seatsResource = fetchedData.resources?.find(
      (r) => r.slug === 'seats'
    )
    expect(seatsResource?.name).toBe('Team Seats')
    expect(seatsResource?.active).toBe(true)

    // Verify Resource features were exported with correct resourceSlug
    const resourceFeatures = fetchedData.features.filter(
      (f) => f.type === FeatureType.Resource
    )
    expect(resourceFeatures).toHaveLength(2)

    const seatFeature = resourceFeatures.find(
      (f) => f.slug === 'seat-allocation'
    )
    expect(seatFeature?.type).toBe(FeatureType.Resource)
    if (seatFeature?.type === FeatureType.Resource) {
      expect(seatFeature.resourceSlug).toBe('seats')
      expect(seatFeature.amount).toBe(5)
    }

    const storageFeature = resourceFeatures.find(
      (f) => f.slug === 'storage-allocation'
    )
    expect(storageFeature?.type).toBe(FeatureType.Resource)
    if (storageFeature?.type === FeatureType.Resource) {
      expect(storageFeature.resourceSlug).toBe('storage')
      expect(storageFeature.amount).toBe(100)
    }

    // Verify Toggle feature also exported correctly
    const toggleFeature = fetchedData.features.find(
      (f) => f.type === FeatureType.Toggle
    )
    expect(toggleFeature?.slug).toBe('basic-access')

    // Verify product features include all feature slugs
    const resourcePlan = fetchedData.products.find(
      (p) => p.product.slug === 'resource-plan'
    )
    expect(resourcePlan?.features).toHaveLength(3)
    expect(resourcePlan?.features).toContain('seat-allocation')
    expect(resourcePlan?.features).toContain('storage-allocation')
    expect(resourcePlan?.features).toContain('basic-access')
  })

  it('should handle mixed feature types (Toggle, UsageCreditGrant, Resource) in export', async () => {
    const originalInput: SetupPricingModelInput = {
      name: 'Mixed Features Export Model',
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
          description: 'Monthly API credits',
          usageMeterSlug: 'api-calls',
          amount: 1000,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.Resource,
          slug: 'team-allocation',
          name: 'Team Allocation',
          description: 'Number of team members',
          resourceSlug: 'team-members',
          amount: 10,
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'Mixed Plan',
            slug: 'mixed-plan',
            description: 'Plan with all feature types',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.Usage,
            name: 'Usage Price',
            slug: 'mixed-usage',
            unitPrice: 10,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            usageMeterSlug: 'api-calls',
            usageEventsPerUnit: 100,
            trialPeriodDays: null,
          },
          features: [
            'dashboard-access',
            'api-credits',
            'team-allocation',
          ],
        },
      ],
    }

    const setupResult = await adminTransaction(
      async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input: originalInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
    )

    const fetchedData = await adminTransaction(
      async ({ transaction }) =>
        getPricingModelSetupData(
          setupResult.pricingModel.id,
          transaction
        )
    )

    // Validate schema
    const parseResult = setupPricingModelSchema.safeParse(fetchedData)
    expect(parseResult.success).toBe(true)

    // Verify all entity types exported
    expect(fetchedData.usageMeters).toHaveLength(1)
    expect(fetchedData.resources).toHaveLength(1)
    expect(fetchedData.features).toHaveLength(3)

    // Verify each feature type
    const toggleFeature = fetchedData.features.find(
      (f) => f.type === FeatureType.Toggle
    )
    expect(toggleFeature?.slug).toBe('dashboard-access')

    const usageCreditFeature = fetchedData.features.find(
      (f) => f.type === FeatureType.UsageCreditGrant
    )
    expect(usageCreditFeature?.slug).toBe('api-credits')
    if (usageCreditFeature?.type === FeatureType.UsageCreditGrant) {
      expect(usageCreditFeature.usageMeterSlug).toBe('api-calls')
      expect(usageCreditFeature.amount).toBe(1000)
    }

    const resourceFeature = fetchedData.features.find(
      (f) => f.type === FeatureType.Resource
    )
    expect(resourceFeature?.slug).toBe('team-allocation')
    if (resourceFeature?.type === FeatureType.Resource) {
      expect(resourceFeature.resourceSlug).toBe('team-members')
      expect(resourceFeature.amount).toBe(10)
    }
  })

  it('should handle pricing model with resources but no Resource features', async () => {
    // This tests the edge case where resources exist but aren't used by any features
    const originalInput: SetupPricingModelInput = {
      name: 'Unused Resources Model',
      isDefault: false,
      usageMeters: [],
      resources: [
        {
          slug: 'unused-resource',
          name: 'Unused Resource',
          active: true,
        },
      ],
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
            slug: 'simple-product',
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
          features: ['simple-toggle'],
        },
      ],
    }

    const setupResult = await adminTransaction(
      async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input: originalInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
    )

    const fetchedData = await adminTransaction(
      async ({ transaction }) =>
        getPricingModelSetupData(
          setupResult.pricingModel.id,
          transaction
        )
    )

    // Validate schema
    const parseResult = setupPricingModelSchema.safeParse(fetchedData)
    expect(parseResult.success).toBe(true)

    // Resources should be exported even if unused
    expect(fetchedData.resources).toHaveLength(1)
    expect(fetchedData.resources?.[0].slug).toBe('unused-resource')

    // Features should just have the toggle
    expect(fetchedData.features).toHaveLength(1)
    expect(fetchedData.features[0].type).toBe(FeatureType.Toggle)
  })

  it('should exclude inactive Resource features from the output', async () => {
    const originalInput: SetupPricingModelInput = {
      name: 'Inactive Resource Features Model',
      isDefault: false,
      usageMeters: [],
      resources: [
        {
          slug: 'test-resource',
          name: 'Test Resource',
          active: true,
        },
      ],
      features: [
        {
          type: FeatureType.Resource,
          slug: 'active-resource-feature',
          name: 'Active Resource Feature',
          description: 'This is active',
          resourceSlug: 'test-resource',
          amount: 5,
          active: true,
        },
        {
          type: FeatureType.Resource,
          slug: 'inactive-resource-feature',
          name: 'Inactive Resource Feature',
          description: 'This is inactive',
          resourceSlug: 'test-resource',
          amount: 10,
          active: false,
        },
      ],
      products: [
        {
          product: {
            name: 'Test Product',
            slug: 'test-product-inactive-resource',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.SinglePayment,
            slug: 'test-price-inactive',
            unitPrice: 2000,
            isDefault: true,
            active: true,
          },
          features: [
            'active-resource-feature',
            'inactive-resource-feature',
          ],
        },
      ],
    }

    const setupResult = await adminTransaction(
      async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input: originalInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
    )

    const fetchedData = await adminTransaction(
      async ({ transaction }) =>
        getPricingModelSetupData(
          setupResult.pricingModel.id,
          transaction
        )
    )

    // Validate schema
    const parseResult = setupPricingModelSchema.safeParse(fetchedData)
    expect(parseResult.success).toBe(true)

    // Should only include active Resource feature
    expect(fetchedData.features).toHaveLength(1)
    expect(fetchedData.features[0].slug).toBe(
      'active-resource-feature'
    )

    // Product should only have active feature
    const testProduct = fetchedData.products.find(
      (p) => p.product.slug === 'test-product-inactive-resource'
    )
    expect(testProduct?.features).toHaveLength(1)
    expect(testProduct?.features).toContain('active-resource-feature')
    expect(testProduct?.features).not.toContain(
      'inactive-resource-feature'
    )
  })
})
