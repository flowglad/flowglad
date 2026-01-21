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

  // Updated to use nested usage meter structure with prices
  it('creates pricingModel, features, products, prices, and productFeatures on happy path', async () => {
    const input: SetupPricingModelInput = {
      name: 'MyPricingModel',
      isDefault: true,
      // Usage meters have nested structure with prices
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
      // Products only have subscription/single payment prices
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

    // Prices - should have product prices + usage prices + auto-generated default price + no_charge prices
    // Usage prices come from usage meters, not products
    const productPriceSlugs = input.products.map((p) => p.price.slug!)
    const usagePriceSlugs = input.usageMeters.flatMap(
      (m) => m.prices?.map((p) => p.slug!) ?? []
    )
    // No-charge prices are auto-created for each usage meter
    const noChargePriceSlugs = input.usageMeters.map(
      (m) => `${m.usageMeter.slug}_no_charge`
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
    expect(resultPriceSlugs).toContain('um_no_charge') // Auto-generated no-charge price

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
    it('creates no_charge price for each usage meter with _no_charge slug suffix', async () => {
      const input: SetupPricingModelInput = {
        name: 'Pricing with Usage Meters',
        isDefault: false,
        usageMeters: [
          {
            usageMeter: { slug: 'api_calls', name: 'API Calls' },
            prices: [],
          },
          {
            usageMeter: { slug: 'storage_gb', name: 'Storage GB' },
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

      // Should have 2 usage meters
      expect(result.usageMeters).toHaveLength(2)

      // Should have auto-generated no-charge prices for each meter + default product price
      const usagePrices = result.prices.filter(
        (p) => p.type === PriceType.Usage
      )
      expect(usagePrices).toHaveLength(2)

      // Verify no-charge price slugs follow the pattern
      const noChargeSlugs = usagePrices.map((p) => p.slug)
      expect(noChargeSlugs).toContain('api_calls_no_charge')
      expect(noChargeSlugs).toContain('storage_gb_no_charge')
    })

    it('sets no_charge price isDefault=true when no user prices are specified', async () => {
      const input: SetupPricingModelInput = {
        name: 'Pricing with No User Prices',
        isDefault: false,
        usageMeters: [
          {
            usageMeter: { slug: 'requests', name: 'Requests' },
            prices: [], // No user prices
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
        (p) => p.slug === 'requests_no_charge'
      )
      expect(noChargePrice?.slug).toBe('requests_no_charge')
      expect(noChargePrice?.isDefault).toBe(true)
      expect(noChargePrice?.unitPrice).toBe(0)
    })

    it('sets no_charge price isDefault=false when user specifies a default price', async () => {
      const input: SetupPricingModelInput = {
        name: 'Pricing with User Default Price',
        isDefault: false,
        usageMeters: [
          {
            usageMeter: { slug: 'compute', name: 'Compute Hours' },
            prices: [
              {
                type: PriceType.Usage,
                slug: 'compute_standard',
                isDefault: true, // User's price is default
                name: 'Standard Rate',
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

      const noChargePrice = result.prices.find(
        (p) => p.slug === 'compute_no_charge'
      )
      const userPrice = result.prices.find(
        (p) => p.slug === 'compute_standard'
      )

      // Verify both prices exist
      expect(noChargePrice?.slug).toBe('compute_no_charge')
      expect(userPrice?.slug).toBe('compute_standard')

      // With Patch 3, user-specified isDefault: true is preserved
      expect(userPrice?.isDefault).toBe(true)
      // No-charge should not be default when user specified a default price
      expect(noChargePrice?.isDefault).toBe(false)
    })

    it('creates no_charge price with correct properties', async () => {
      const input: SetupPricingModelInput = {
        name: 'Pricing with Meter',
        isDefault: false,
        usageMeters: [
          {
            usageMeter: {
              slug: 'bandwidth',
              name: 'Bandwidth Usage',
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
        (p) => p.slug === 'bandwidth_no_charge'
      )
      expect(noChargePrice?.slug).toBe('bandwidth_no_charge')

      // Verify all expected properties
      expect(noChargePrice?.name).toBe('Bandwidth Usage - No Charge')
      expect(noChargePrice?.type).toBe(PriceType.Usage)
      expect(noChargePrice?.unitPrice).toBe(0)
      expect(noChargePrice?.usageEventsPerUnit).toBe(1)
      expect(noChargePrice?.productId).toBeNull()
      expect(noChargePrice?.active).toBe(true)
      expect(noChargePrice?.intervalUnit).toBe(IntervalUnit.Month)
      expect(noChargePrice?.intervalCount).toBe(1)

      // Verify it's linked to the correct usage meter
      const bandwidth = result.usageMeters.find(
        (m) => m.slug === 'bandwidth'
      )
      expect(noChargePrice?.usageMeterId).toBe(bandwidth?.id)
      expect(noChargePrice?.pricingModelId).toBe(
        result.pricingModel.id
      )
    })

    it('uses organization defaultCurrency for no_charge prices', async () => {
      const input: SetupPricingModelInput = {
        name: 'Pricing with Currency',
        isDefault: false,
        usageMeters: [
          {
            usageMeter: { slug: 'tokens', name: 'Tokens' },
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
        (p) => p.slug === 'tokens_no_charge'
      )
      expect(noChargePrice!.currency).toBe(
        organization.defaultCurrency
      )
    })

    it('creates no_charge prices alongside user-specified prices', async () => {
      const input: SetupPricingModelInput = {
        name: 'Pricing with Mixed Prices',
        isDefault: false,
        usageMeters: [
          {
            usageMeter: { slug: 'messages', name: 'Messages' },
            prices: [
              {
                type: PriceType.Usage,
                slug: 'messages_premium',
                isDefault: true,
                name: 'Premium Rate',
                usageEventsPerUnit: 1,
                active: true,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                unitPrice: 50,
                trialPeriodDays: null,
              },
              {
                type: PriceType.Usage,
                slug: 'messages_basic',
                isDefault: false,
                name: 'Basic Rate',
                usageEventsPerUnit: 10,
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

      // Should have 3 usage prices: 2 user + 1 no_charge
      const usagePrices = result.prices.filter(
        (p) => p.type === PriceType.Usage
      )
      expect(usagePrices).toHaveLength(3)

      const slugs = usagePrices.map((p) => p.slug)
      expect(slugs).toContain('messages_premium')
      expect(slugs).toContain('messages_basic')
      expect(slugs).toContain('messages_no_charge')
    })
  })
})
