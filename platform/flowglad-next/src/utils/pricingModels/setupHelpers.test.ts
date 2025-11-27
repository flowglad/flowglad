import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
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
          prices: [
            {
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
          ],
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
          prices: [
            {
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
          ],
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
              usageMeterSlug: 'api-calls',
              usageEventsPerUnit: 100,
              trialPeriodDays: null,
            },
          ],
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
              usageMeterSlug: 'storage',
              usageEventsPerUnit: 50,
              trialPeriodDays: null,
            },
          ],
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
          prices: [
            {
              type: PriceType.SinglePayment,
              name: 'One-time Setup',
              slug: 'addon-setup',
              unitPrice: 9999,
              isDefault: true,
              active: true,
            },
          ],
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
    expect(toggleFeature).toBeDefined()
    expect(toggleFeature?.slug).toBe('basic-feature')

    const creditFeature = fetchedData.features.find(
      (f) => f.type === FeatureType.UsageCreditGrant
    )
    expect(creditFeature).toBeDefined()
    if (creditFeature?.type === FeatureType.UsageCreditGrant) {
      expect(creditFeature.usageMeterSlug).toBe('api-calls')
      expect(creditFeature.amount).toBe(1000)
    }

    // Verify products (should include auto-generated default + our 5 products)
    expect(fetchedData.products.length).toBeGreaterThanOrEqual(5)

    const starterProduct = fetchedData.products.find(
      (p) => p.product.slug === 'starter'
    )
    expect(starterProduct).toBeDefined()
    expect(starterProduct?.product.name).toBe('Starter Plan')
    expect(starterProduct?.product.description).toBe(
      'Perfect for getting started'
    )
    expect(starterProduct?.product.imageURL).toBe(
      'https://example.com/starter.png'
    )
    expect(starterProduct?.product.singularQuantityLabel).toBe('seat')
    expect(starterProduct?.product.pluralQuantityLabel).toBe('seats')

    // Verify prices on starter product
    expect(starterProduct?.prices).toHaveLength(1)
    const starterPrice = starterProduct?.prices[0]
    expect(starterPrice?.type).toBe(PriceType.Subscription)
    if (starterPrice?.type === PriceType.Subscription) {
      expect(starterPrice.unitPrice).toBe(1999)
      expect(starterPrice.intervalUnit).toBe(IntervalUnit.Month)
      expect(starterPrice.trialPeriodDays).toBe(14)
      expect(starterPrice.usageMeterId).toBe(null)
      expect(starterPrice.usageEventsPerUnit).toBe(null)
    }

    // Verify Pro product (now only has subscription price)
    const proProduct = fetchedData.products.find(
      (p) => p.product.slug === 'pro'
    )
    expect(proProduct).toBeDefined()
    expect(proProduct?.prices).toHaveLength(1)

    // Verify API Usage product
    const apiUsageProduct = fetchedData.products.find(
      (p) => p.product.slug === 'api-usage'
    )
    expect(apiUsageProduct).toBeDefined()
    expect(apiUsageProduct?.prices).toHaveLength(1)
    const apiUsagePrice = apiUsageProduct?.prices[0]
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
    expect(storageUsageProduct).toBeDefined()
    expect(storageUsageProduct?.prices).toHaveLength(1)
    const storageUsagePrice = storageUsageProduct?.prices[0]
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
    expect(addonProduct).toBeDefined()
    expect(addonProduct?.prices).toHaveLength(1)
    const singlePaymentPrice = addonProduct?.prices[0]
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
          prices: [
            {
              type: PriceType.SinglePayment,
              slug: 'simple-price',
              unitPrice: 1000,
              isDefault: true,
              active: true,
            },
          ],
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
          prices: [
            {
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
            {
              type: PriceType.Subscription,
              slug: 'inactive-non-default-price',
              name: 'Inactive Non-Default Price',
              unitPrice: 4000,
              isDefault: false, // Non-default - should be excluded
              active: false, // Inactive - should be excluded
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null,
            },
          ],
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
    expect(fetchedProduct).toBeDefined()

    // Verify only the active default price is included
    expect(fetchedProduct?.prices).toHaveLength(1)
    expect(fetchedProduct?.prices[0]?.slug).toBe(
      'active-default-price'
    )
    expect(fetchedProduct?.prices[0]?.isDefault).toBe(true)
    expect(fetchedProduct?.prices[0]?.active).toBe(true)
    expect(fetchedProduct?.prices[0]?.unitPrice).toBe(1000)

    // Verify the excluded prices are not present
    const priceSlugs = fetchedProduct?.prices.map((p) => p.slug) || []
    expect(priceSlugs).not.toContain('inactive-non-default-price')
  })
})
