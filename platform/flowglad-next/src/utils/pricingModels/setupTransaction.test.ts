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
import { getNoChargeSlugForMeter } from '@/utils/usage/noChargePriceHelpers'

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

  // PR 5: Updated to use nested usage meter structure with prices
  it('creates pricingModel, features, products, prices, and productFeatures on happy path', async () => {
    const input: SetupPricingModelInput = {
      name: 'MyPricingModel',
      isDefault: true,
      // PR 5: Usage meters now have nested structure with prices
      usageMeters: [
        {
          usageMeter: { slug: 'um', name: 'UM' },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'pu',
              isDefault: true,
              name: 'Test Price',
              usageEventsPerUnit: 1,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 5,
              trialPeriodDays: null,
            },
          ],
        },
      ],
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
      // PR 5: Products only have subscription/single payment prices now
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

    // Prices - should have product prices + usage prices + no_charge prices + auto-generated default price
    // PR 5: Usage prices now come from usage meters, not products
    const productPriceSlugs = input.products.map((p) => p.price.slug!)
    const usagePriceSlugs = input.usageMeters.flatMap(
      (m) => m.prices?.map((p) => p.slug!) ?? []
    )
    const noChargePriceSlugs = input.usageMeters.map((m) =>
      getNoChargeSlugForMeter(m.usageMeter.slug)
    )
    const allPriceSlugs = [
      ...productPriceSlugs,
      ...usagePriceSlugs,
      ...noChargePriceSlugs,
    ]
    expect(result.prices).toHaveLength(allPriceSlugs.length + 1) // +1 for auto-generated default
    const resultPriceSlugs = result.prices.map((pr) => pr.slug)
    expect(resultPriceSlugs).toEqual(
      expect.arrayContaining(allPriceSlugs)
    )
    expect(resultPriceSlugs).toContain('free') // Auto-generated default price
    expect(resultPriceSlugs).toContain('um_no_charge') // Auto-generated no_charge price

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

  describe('No Charge Price Auto-Creation', () => {
    it('creates no_charge prices for all usage meters in pricing model setup', async () => {
      const input: SetupPricingModelInput = {
        name: 'Test Pricing Model with Usage Meters',
        isDefault: false,
        usageMeters: [
          {
            usageMeter: { slug: 'api_calls', name: 'API Calls' },
            prices: [],
          },
          {
            usageMeter: { slug: 'storage', name: 'Storage GB' },
            prices: [],
          },
        ],
        features: [],
        products: [],
      }

      const result = await adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          { input, organizationId: organization.id, livemode: false },
          transaction
        )
      )

      // Verify both usage meters were created
      expect(result.usageMeters).toHaveLength(2)
      expect(result.usageMeters.map((m) => m.slug)).toEqual(
        expect.arrayContaining(['api_calls', 'storage'])
      )

      // Verify no_charge prices were created for both meters
      const noChargePrices = result.prices.filter((p) =>
        p.slug?.endsWith('_no_charge')
      )
      expect(noChargePrices).toHaveLength(2)

      // Verify each no_charge price has correct properties
      const apiCallsNoChargePrice = noChargePrices.find(
        (p) => p.slug === getNoChargeSlugForMeter('api_calls')
      )
      expect(apiCallsNoChargePrice?.slug).toBe(
        getNoChargeSlugForMeter('api_calls')
      )
      expect(apiCallsNoChargePrice?.unitPrice).toBe(0)
      expect(apiCallsNoChargePrice?.usageEventsPerUnit).toBe(1)
      expect(apiCallsNoChargePrice?.type).toBe(PriceType.Usage)
      expect(apiCallsNoChargePrice?.productId).toBe(null)
      expect(apiCallsNoChargePrice?.active).toBe(true)
      expect(apiCallsNoChargePrice?.isDefault).toBe(true)

      const storageNoChargePrice = noChargePrices.find(
        (p) => p.slug === getNoChargeSlugForMeter('storage')
      )
      expect(storageNoChargePrice?.slug).toBe(
        getNoChargeSlugForMeter('storage')
      )
      expect(storageNoChargePrice?.unitPrice).toBe(0)
      expect(storageNoChargePrice?.usageEventsPerUnit).toBe(1)
      expect(storageNoChargePrice?.type).toBe(PriceType.Usage)
      expect(storageNoChargePrice?.productId).toBe(null)
      expect(storageNoChargePrice?.active).toBe(true)
      expect(storageNoChargePrice?.isDefault).toBe(true)
    })

    it('creates no_charge price with isDefault: false when user specifies a default price for the meter', async () => {
      const input: SetupPricingModelInput = {
        name: 'Test Pricing Model with User Default Price',
        isDefault: false,
        usageMeters: [
          {
            usageMeter: { slug: 'api_calls', name: 'API Calls' },
            prices: [
              {
                type: PriceType.Usage,
                slug: 'api_calls_premium',
                isDefault: true, // User sets this as default
                name: 'Premium API Price',
                usageEventsPerUnit: 1,
                active: true,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                unitPrice: 100, // $1.00 per 100 events
                trialPeriodDays: null,
              },
            ],
          },
        ],
        features: [],
        products: [],
      }

      const result = await adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          { input, organizationId: organization.id, livemode: false },
          transaction
        )
      )

      // Verify the user's custom price exists and is default
      const customPrice = result.prices.find(
        (p) => p.slug === 'api_calls_premium'
      )
      expect(customPrice?.slug).toBe('api_calls_premium')
      expect(customPrice?.isDefault).toBe(true)
      expect(customPrice?.unitPrice).toBe(100)

      // Verify the no_charge price exists but is NOT default
      const noChargePrice = result.prices.find(
        (p) => p.slug === getNoChargeSlugForMeter('api_calls')
      )
      expect(noChargePrice?.slug).toBe(
        getNoChargeSlugForMeter('api_calls')
      )
      expect(noChargePrice?.isDefault).toBe(false)
      expect(noChargePrice?.unitPrice).toBe(0)
    })

    it('creates no_charge price with isDefault: true when user price does not have isDefault', async () => {
      const input: SetupPricingModelInput = {
        name: 'Test Pricing Model with Non-Default User Price',
        isDefault: false,
        usageMeters: [
          {
            usageMeter: { slug: 'api_calls', name: 'API Calls' },
            prices: [
              {
                type: PriceType.Usage,
                slug: 'api_calls_premium',
                isDefault: false, // User does NOT set this as default
                name: 'Premium API Price',
                usageEventsPerUnit: 1,
                active: true,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                unitPrice: 100,
                trialPeriodDays: null,
              },
            ],
          },
        ],
        features: [],
        products: [],
      }

      const result = await adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          { input, organizationId: organization.id, livemode: false },
          transaction
        )
      )

      // Verify the user's custom price exists and is NOT default
      const customPrice = result.prices.find(
        (p) => p.slug === 'api_calls_premium'
      )
      expect(customPrice?.slug).toBe('api_calls_premium')
      expect(customPrice?.isDefault).toBe(false)

      // Verify the no_charge price IS default
      const noChargePrice = result.prices.find(
        (p) => p.slug === getNoChargeSlugForMeter('api_calls')
      )
      expect(noChargePrice?.slug).toBe(
        getNoChargeSlugForMeter('api_calls')
      )
      expect(noChargePrice?.isDefault).toBe(true)
    })

    it('creates no_charge price with correct pricingModelId and usageMeterId', async () => {
      const input: SetupPricingModelInput = {
        name: 'Test Pricing Model',
        isDefault: false,
        usageMeters: [
          {
            usageMeter: { slug: 'messages', name: 'Messages' },
            prices: [],
          },
        ],
        features: [],
        products: [],
      }

      const result = await adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          { input, organizationId: organization.id, livemode: false },
          transaction
        )
      )

      const usageMeter = result.usageMeters.find(
        (m) => m.slug === 'messages'
      )
      const noChargePrice = result.prices.find(
        (p) => p.slug === getNoChargeSlugForMeter('messages')
      )

      expect(usageMeter?.slug).toBe('messages')
      expect(noChargePrice?.slug).toBe(
        getNoChargeSlugForMeter('messages')
      )
      expect(noChargePrice?.pricingModelId).toBe(
        result.pricingModel.id
      )
      expect(noChargePrice?.usageMeterId).toBe(usageMeter?.id)
    })

    it('creates no_charge price with organization default currency', async () => {
      const input: SetupPricingModelInput = {
        name: 'Test Pricing Model',
        isDefault: false,
        usageMeters: [
          {
            usageMeter: { slug: 'bandwidth', name: 'Bandwidth' },
            prices: [],
          },
        ],
        features: [],
        products: [],
      }

      const result = await adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          { input, organizationId: organization.id, livemode: false },
          transaction
        )
      )

      const noChargePrice = result.prices.find(
        (p) => p.slug === getNoChargeSlugForMeter('bandwidth')
      )
      expect(noChargePrice?.slug).toBe(
        getNoChargeSlugForMeter('bandwidth')
      )
      expect(noChargePrice?.currency).toBe(
        organization.defaultCurrency
      )
    })

    it('creates no_charge price with name derived from meter name', async () => {
      const input: SetupPricingModelInput = {
        name: 'Test Pricing Model',
        isDefault: false,
        usageMeters: [
          {
            usageMeter: {
              slug: 'compute_hours',
              name: 'Compute Hours',
            },
            prices: [],
          },
        ],
        features: [],
        products: [],
      }

      const result = await adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          { input, organizationId: organization.id, livemode: false },
          transaction
        )
      )

      const noChargePrice = result.prices.find(
        (p) => p.slug === getNoChargeSlugForMeter('compute_hours')
      )
      expect(noChargePrice?.slug).toBe(
        getNoChargeSlugForMeter('compute_hours')
      )
      expect(noChargePrice?.name).toBe('Compute Hours - No Charge')
    })
  })
})
