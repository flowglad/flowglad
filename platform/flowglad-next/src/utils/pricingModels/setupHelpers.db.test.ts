import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PriceType,
} from '@db-core/enums'
import type { Organization } from '@db-core/schema/organizations'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectFeaturesByProductFeatureWhere,
  updateProductFeature,
} from '@/db/tableMethods/productFeatureMethods'
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
  // Rewritten test to use usage meter structure where usage prices
  // belong to usage meters, not products
  it('should fetch and transform a complete pricing model with all related entities', async () => {
    // First, create a pricing model with all the complex parts
    const originalInput: SetupPricingModelInput = {
      name: 'Test Pricing Model',
      isDefault: false,
      // Usage meters have nested prices
      usageMeters: [
        {
          usageMeter: {
            slug: 'api-calls',
            name: 'API Calls',
          },
          prices: [
            {
              type: PriceType.Usage,
              name: 'Extra API Calls',
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
              name: 'Storage Overages',
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
      // Products only have subscription/single payment prices
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
    const setupResult = await adminTransaction(async (ctx) =>
      (
        await setupPricingModelTransaction(
          {
            input: originalInput,
            organizationId: organization.id,
            livemode: false,
          },
          ctx
        )
      ).unwrap()
    )

    // Now fetch it back using getPricingModelSetupData
    const fetchedData = await adminTransaction(async (ctx) =>
      (
        await getPricingModelSetupData(
          setupResult.pricingModel.id,
          ctx.transaction
        )
      ).unwrap()
    )

    // Validate the output using the schema
    const parseResult = setupPricingModelSchema.safeParse(fetchedData)
    expect(parseResult.success).toBe(true)

    // Verify the basic structure
    expect(fetchedData.name).toBe(originalInput.name)
    expect(fetchedData.isDefault).toBe(originalInput.isDefault)

    // Verify usage meters with nested structure
    expect(fetchedData.usageMeters).toHaveLength(
      originalInput.usageMeters.length
    )
    const usageMeterSlugs = fetchedData.usageMeters.map(
      (m) => m.usageMeter.slug
    )
    expect(usageMeterSlugs).toEqual(
      expect.arrayContaining(['api-calls', 'storage'])
    )

    // Verify usage prices are nested under meters
    const apiCallsMeter = fetchedData.usageMeters.find(
      (m) => m.usageMeter.slug === 'api-calls'
    )
    expect(apiCallsMeter?.usageMeter.slug).toBe('api-calls')
    expect(apiCallsMeter?.prices).toHaveLength(1)
    expect(apiCallsMeter?.prices?.[0].slug).toBe('api-usage-price')
    expect(apiCallsMeter?.prices?.[0].unitPrice).toBe(10)
    expect(apiCallsMeter?.prices?.[0].usageEventsPerUnit).toBe(100)

    const storageMeter = fetchedData.usageMeters.find(
      (m) => m.usageMeter.slug === 'storage'
    )
    expect(storageMeter?.usageMeter.slug).toBe('storage')
    expect(storageMeter?.prices).toHaveLength(1)
    expect(storageMeter?.prices?.[0].slug).toBe('storage-usage-price')
    expect(storageMeter?.prices?.[0].unitPrice).toBe(5)
    expect(storageMeter?.prices?.[0].usageEventsPerUnit).toBe(50)

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

    // Verify products (now only 3 - no usage price products)
    expect(fetchedData.products.length).toBeGreaterThanOrEqual(3)

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
    }

    // Verify Pro product
    const proProduct = fetchedData.products.find(
      (p) => p.product.slug === 'pro'
    )
    expect(typeof proProduct).toBe('object')
    expect(proProduct?.price?.type).toBe(PriceType.Subscription)

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
      adminTransaction(async (ctx) =>
        (
          await getPricingModelSetupData(
            'non-existent-id',
            ctx.transaction
          )
        ).unwrap()
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

    const setupResult = await adminTransaction(async (ctx) =>
      (
        await setupPricingModelTransaction(
          {
            input: minimalInput,
            organizationId: organization.id,
            livemode: false,
          },
          ctx
        )
      ).unwrap()
    )

    const fetchedData = await adminTransaction(async (ctx) =>
      (
        await getPricingModelSetupData(
          setupResult.pricingModel.id,
          ctx.transaction
        )
      ).unwrap()
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

    const fetchedData = await adminTransaction(async (ctx) =>
      (
        await getPricingModelSetupData(
          setupResult.pricingModel.id,
          ctx.transaction
        )
      ).unwrap()
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
          usageMeter: {
            slug: 'test-meter',
            name: 'Test Meter',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'test-meter-usage',
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

    const fetchedData = await adminTransaction(async (ctx) =>
      (
        await getPricingModelSetupData(
          setupResult.pricingModel.id,
          ctx.transaction
        )
      ).unwrap()
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

    // Now manually expire one of the product-feature associations
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
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
          ctx
        )
      }
    })

    // Fetch the pricing model data
    const fetchedData = await adminTransaction(async (ctx) =>
      (
        await getPricingModelSetupData(
          setupResult.pricingModel.id,
          ctx.transaction
        )
      ).unwrap()
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
})
