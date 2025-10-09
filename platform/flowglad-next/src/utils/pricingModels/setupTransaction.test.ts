import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupPricingModelTransaction,
  externalIdFromProductData,
} from '@/utils/pricingModels/setupTransaction'
import { hashData } from '@/utils/backendCore'
import type {
  SetupPricingModelInput,
  SetupPricingModelProductInput,
} from '@/utils/pricingModels/setupSchemas'
import {
  FeatureType,
  FeatureUsageGrantFrequency,
  PriceType,
  IntervalUnit,
  CurrencyCode,
} from '@/types'
import type { Organization } from '@/db/schema/organizations'

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
        displayFeatures: null,
        singularQuantityLabel: null,
        pluralQuantityLabel: null,
      },
      prices: [],
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
        displayFeatures: null,
        singularQuantityLabel: null,
        pluralQuantityLabel: null,
      },
      prices: [],
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
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [],
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
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'ps',
              isDefault: false,
              name: 'Test Price',
              usageMeterId: null,
              trialPeriodDays: null,
              usageEventsPerUnit: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 100,
              startsWithCreditTrial: false,
            },
            {
              type: PriceType.Usage,
              slug: 'pu',
              isDefault: false,
              name: 'Test Price',
              usageMeterSlug: 'um',
              trialPeriodDays: null,
              usageEventsPerUnit: 1,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 5,
              startsWithCreditTrial: false,
            },
          ],
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
    expect(result.pricingModel.id).toBeDefined()
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
    const allPriceSlugs = input.products.flatMap((p) =>
      p.prices.map((pr) => pr.slug!)
    )
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
              displayFeatures: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            prices: [
              {
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
                startsWithCreditTrial: false,
              },
            ],
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
              displayFeatures: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            prices: [],
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
              displayFeatures: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            prices: [],
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
              displayFeatures: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            prices: [
              {
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
                startsWithCreditTrial: false,
              },
            ],
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
              displayFeatures: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            prices: [
              {
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
                startsWithCreditTrial: false,
              },
            ],
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

    it('should reject default product using reserved "free" slug', async () => {
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
              slug: 'free', // Reserved slug - should fail
              active: true,
              imageURL: null,
              displayFeatures: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            prices: [
              {
                type: PriceType.Subscription,
                slug: 'free-price',
                isDefault: true,
                name: 'Free Price',
                usageMeterId: null,
                trialPeriodDays: null,
                usageEventsPerUnit: null,
                active: true,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                unitPrice: 0,
                startsWithCreditTrial: false,
              },
            ],
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
      ).rejects.toThrow(
        "Slug 'free' is reserved for auto-generated default plans"
      )
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
              displayFeatures: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
            },
            prices: [
              {
                type: PriceType.Subscription,
                slug: 'test-price',
                isDefault: false,
                name: 'Test Price',
                usageMeterId: null,
                trialPeriodDays: null,
                usageEventsPerUnit: null,
                active: true,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                unitPrice: 100,
                startsWithCreditTrial: false,
                currency: 'INVALID_CURRENCY' as any, // Invalid currency
              },
            ],
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
      ).rejects.toThrow('Invalid currency code')
    })
  })
})
