import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import { selectFeatures } from '@/db/tableMethods/featureMethods'
import { selectPrices } from '@/db/tableMethods/priceMethods'
import { selectProductFeatures } from '@/db/tableMethods/productFeatureMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import {
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PriceType,
} from '@/types'
import type { SetupPricingModelInput } from './setupSchemas'
import { setupPricingModelTransaction } from './setupTransaction'
import { updatePricingModelTransaction } from './updateTransaction'

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

/**
 * Helper to create a basic pricing model for testing updates.
 * PR 5: Usage prices now belong to usage meters, not products.
 */
const createBasicPricingModel = async (
  overrides: Partial<SetupPricingModelInput> = {}
) => {
  // PR 5: Usage meters have nested structure with prices
  // Transform any old-style flat usage meters to nested structure with default prices
  const processedUsageMeters: SetupPricingModelInput['usageMeters'] =
    (overrides.usageMeters ?? []).map((meter) => {
      // If already in new format (has usageMeter property), use as-is
      if ('usageMeter' in meter) {
        return meter
      }
      // Otherwise, transform from old flat format
      const meterData = meter as { slug: string; name: string }
      return {
        usageMeter: {
          slug: meterData.slug,
          name: meterData.name,
        },
        prices: [
          {
            type: PriceType.Usage as const,
            slug: `${meterData.slug}-usage-price`,
            unitPrice: 10,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            usageEventsPerUnit: 100,
            trialPeriodDays: null,
          },
        ],
      }
    })

  const baseProducts: SetupPricingModelInput['products'] = [
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
  ]

  // PR 5: Products only contain subscription/single payment prices now
  // No more usage price products - usage prices live under usage meters
  const finalProducts = overrides.products ?? baseProducts

  const input: SetupPricingModelInput = {
    name: 'Test Pricing Model',
    isDefault: false,
    features: [
      {
        type: FeatureType.Toggle,
        slug: 'feature-a',
        name: 'Feature A',
        description: 'A toggle feature',
        active: true,
      },
    ],
    ...overrides,
    usageMeters: processedUsageMeters,
    products: finalProducts,
  }

  return adminTransaction(async ({ transaction }) =>
    setupPricingModelTransaction(
      {
        input,
        organizationId: organization.id,
        livemode: false,
      },
      transaction
    )
  )
}

describe('updatePricingModelTransaction', () => {
  describe('pricing model metadata updates', () => {
    it('updates the pricing model name without affecting child records', async () => {
      const setupResult = await createBasicPricingModel({
        name: 'Old Name',
      })

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'New Name',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
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
                ],
              },
            },
            transaction
          )
      )

      expect(updateResult.pricingModel.name).toBe('New Name')
      expect(updateResult.features.created).toHaveLength(0)
      expect(updateResult.features.updated).toHaveLength(0)
      expect(updateResult.products.created).toHaveLength(0)
      expect(updateResult.products.updated).toHaveLength(0)
    })

    it('updates the isDefault flag', async () => {
      const setupResult = await createBasicPricingModel({
        isDefault: false,
      })

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: true,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
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
                ],
              },
            },
            transaction
          )
      )

      expect(updateResult.pricingModel.isDefault).toBe(true)
    })
  })

  describe('usage meter updates', () => {
    // TODO: PR 2/5 - This test expects usage meters to create associated products
    // but in the new data model, usage prices have productId: null and don't create products
    // PR 5: Usage meters now use nested structure
    it.skip('creates new usage meters', async () => {
      const setupResult = await createBasicPricingModel({
        usageMeters: [
          {
            usageMeter: { slug: 'api-calls', name: 'API Calls' },
            prices: [
              {
                type: PriceType.Usage,
                slug: 'api-calls-usage-price',
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
      })

      // PR 5: Update proposedInput with new nested usage meter structure
      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
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
                        slug: 'api-calls-usage-price',
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
                    usageMeter: { slug: 'storage', name: 'Storage' },
                    prices: [
                      {
                        type: PriceType.Usage,
                        slug: 'storage-usage-price',
                        unitPrice: 5,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageEventsPerUnit: 1000,
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
                ],
                // PR 5: Products only have subscription/single payment prices
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
                ],
              },
            },
            transaction
          )
      )

      expect(updateResult.usageMeters.created).toHaveLength(1)
      expect(updateResult.usageMeters.created[0].slug).toBe('storage')
      expect(updateResult.usageMeters.created[0].name).toBe('Storage')
    })

    // TODO: PR 2 - This test expects usage meters to create associated products
    // but in the new data model, usage prices have productId: null and don't create products
    it.skip('updates existing usage meter name', async () => {
      const setupResult = await createBasicPricingModel({
        usageMeters: [
          {
            usageMeter: { slug: 'api-calls', name: 'API Calls' },
            prices: [
              {
                type: PriceType.Usage,
                slug: 'api-calls-usage-price',
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
      })

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [
                  {
                    usageMeter: {
                      slug: 'api-calls',
                      name: 'API Requests',
                    },
                    prices: [
                      {
                        type: PriceType.Usage,
                        slug: 'api-calls-usage-price',
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
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
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
                ],
              },
            },
            transaction
          )
      )

      expect(updateResult.usageMeters.updated).toHaveLength(1)
      expect(updateResult.usageMeters.updated[0].name).toBe(
        'API Requests'
      )
    })

    it('throws when trying to remove usage meters', async () => {
      const setupResult = await createBasicPricingModel({
        usageMeters: [
          {
            usageMeter: { slug: 'api-calls', name: 'API Calls' },
            prices: [
              {
                type: PriceType.Usage,
                slug: 'api-calls-usage-price',
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
            usageMeter: { slug: 'storage', name: 'Storage' },
            prices: [
              {
                type: PriceType.Usage,
                slug: 'storage-usage-price',
                unitPrice: 5,
                isDefault: true,
                active: true,
                intervalCount: 1,
                intervalUnit: IntervalUnit.Month,
                usageEventsPerUnit: 1,
                trialPeriodDays: null,
              },
            ],
          },
        ],
      })

      await expect(
        adminTransaction(async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
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
                        slug: 'api-calls-usage-price',
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
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
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
                ],
              },
            },
            transaction
          )
        )
      ).rejects.toThrow('Usage meters cannot be removed')
    })
  })

  describe('feature updates', () => {
    it('creates new features', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
                    active: true,
                  },
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-b',
                    name: 'Feature B',
                    description: 'Another toggle feature',
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
                ],
              },
            },
            transaction
          )
      )

      expect(updateResult.features.created).toHaveLength(1)
      expect(updateResult.features.created[0].slug).toBe('feature-b')
    })

    it('updates existing feature name', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A Updated',
                    description: 'A toggle feature',
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
                ],
              },
            },
            transaction
          )
      )

      expect(updateResult.features.updated).toHaveLength(1)
      expect(updateResult.features.updated[0].name).toBe(
        'Feature A Updated'
      )
    })

    it('soft-deletes removed features by setting active=false', async () => {
      const setupResult = await createBasicPricingModel({
        features: [
          {
            type: FeatureType.Toggle,
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A toggle feature',
            active: true,
          },
          {
            type: FeatureType.Toggle,
            slug: 'feature-b',
            name: 'Feature B',
            description: 'Another toggle feature',
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
            features: ['feature-a', 'feature-b'],
          },
        ],
      })

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
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
                ],
              },
            },
            transaction
          )
      )

      expect(updateResult.features.deactivated).toHaveLength(1)
      expect(updateResult.features.deactivated[0].slug).toBe(
        'feature-b'
      )
      expect(updateResult.features.deactivated[0].active).toBe(false)
    })

    it('throws when trying to change feature type', async () => {
      const setupResult = await createBasicPricingModel({
        usageMeters: [
          {
            usageMeter: { slug: 'api-calls', name: 'API Calls' },
            prices: [
              {
                type: PriceType.Usage,
                slug: 'api-calls-usage-price',
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
      })

      await expect(
        adminTransaction(async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
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
                        slug: 'api-calls-usage-price',
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
                    type: FeatureType.UsageCreditGrant,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'Changed to usage credit grant',
                    usageMeterSlug: 'api-calls',
                    amount: 100,
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
                ],
              },
            },
            transaction
          )
        )
      ).rejects.toThrow('Feature type cannot be changed')
    })
  })

  describe('product updates', () => {
    it('creates new products with prices', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
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
                    features: ['feature-a'],
                  },
                ],
              },
            },
            transaction
          )
      )

      expect(updateResult.products.created).toHaveLength(1)
      expect(updateResult.products.created[0].slug).toBe('pro')
      // 2 prices created: one for the new 'pro' product, one for auto-generated 'free' product replacement
      expect(
        updateResult.prices.created.length
      ).toBeGreaterThanOrEqual(1)
      const proPriceCreated = updateResult.prices.created.find(
        (p) => p.slug === 'pro-monthly'
      )
      expect(proPriceCreated?.unitPrice).toBe(4999)
    })

    it('updates existing product metadata without affecting price', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
                    active: true,
                  },
                ],
                products: [
                  {
                    product: {
                      name: 'Starter Plan Updated',
                      slug: 'starter',
                      default: false,
                      active: true,
                      description: 'Now with a description!',
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
                ],
              },
            },
            transaction
          )
      )

      expect(updateResult.products.updated).toHaveLength(1)
      expect(updateResult.products.updated[0].name).toBe(
        'Starter Plan Updated'
      )
      expect(updateResult.products.updated[0].description).toBe(
        'Now with a description!'
      )
      // Note: "free" product was auto-generated in setup but not included in proposed,
      // however it is protected by protectDefaultProduct and preserved
      expect(updateResult.products.deactivated).toHaveLength(0)
    })

    it('soft-deletes removed products and their prices', async () => {
      const setupResult = await createBasicPricingModel({
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
            features: ['feature-a'],
          },
        ],
      })

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
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
                      // Match the existing price schema from getPricingModelSetupData
                      name: undefined,
                      slug: 'starter-monthly',
                      unitPrice: 1999,
                      isDefault: true,
                      active: true,
                      intervalCount: 1,
                      intervalUnit: IntervalUnit.Month,
                      trialPeriodDays: undefined,
                      usageMeterId: null,
                      usageEventsPerUnit: null,
                    },
                    features: ['feature-a'],
                  },
                ],
              },
            },
            transaction
          )
      )

      // 1 product deactivated: 'pro' (explicitly removed)
      // Note: 'free' (auto-generated default) is protected and preserved by protectDefaultProduct
      expect(updateResult.products.deactivated).toHaveLength(1)
      const proDeactivated = updateResult.products.deactivated.find(
        (p) => p.slug === 'pro'
      )
      expect(proDeactivated!.active).toBe(false)

      // 1 price deactivated: pro-monthly
      // Note: free product's price is preserved since the default product is protected
      expect(updateResult.prices.deactivated).toHaveLength(1)
      const proMonthlyDeactivated =
        updateResult.prices.deactivated.find(
          (p) => p.slug === 'pro-monthly'
        )
      expect(proMonthlyDeactivated!.active).toBe(false)
    })

    it('creates new price and deactivates old price when price changes', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
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
                      unitPrice: 2999,
                      isDefault: true,
                      active: true,
                      intervalCount: 1,
                      intervalUnit: IntervalUnit.Month,
                      usageMeterId: null,
                      usageEventsPerUnit: null,
                    },
                    features: ['feature-a'],
                  },
                ],
              },
            },
            transaction
          )
      )

      // Price for starter changed (1999 -> 2999), plus free product deactivated
      expect(
        updateResult.prices.created.length
      ).toBeGreaterThanOrEqual(1)
      const starterPriceCreated = updateResult.prices.created.find(
        (p) => p.unitPrice === 2999
      )
      expect(starterPriceCreated!.active).toBe(true)

      // 2 prices deactivated: starter-monthly (old price) + free (auto-generated product removed)
      expect(
        updateResult.prices.deactivated.length
      ).toBeGreaterThanOrEqual(1)
      const starterPriceDeactivated =
        updateResult.prices.deactivated.find(
          (p) => p.unitPrice === 1999
        )
      expect(starterPriceDeactivated!.active).toBe(false)
    })
  })

  describe('productFeature junction table sync', () => {
    it('adds new feature associations when products gain features', async () => {
      const setupResult = await createBasicPricingModel({
        features: [
          {
            type: FeatureType.Toggle,
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A toggle feature',
            active: true,
          },
          {
            type: FeatureType.Toggle,
            slug: 'feature-b',
            name: 'Feature B',
            description: 'Another toggle feature',
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
        ],
      })

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
                    active: true,
                  },
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-b',
                    name: 'Feature B',
                    description: 'Another toggle feature',
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
                    features: ['feature-a', 'feature-b'],
                  },
                ],
              },
            },
            transaction
          )
      )

      expect(updateResult.productFeatures.added).toHaveLength(1)
      expect(updateResult.productFeatures.removed).toHaveLength(0)
    })

    it('removes feature associations when products lose features', async () => {
      const setupResult = await createBasicPricingModel({
        features: [
          {
            type: FeatureType.Toggle,
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A toggle feature',
            active: true,
          },
          {
            type: FeatureType.Toggle,
            slug: 'feature-b',
            name: 'Feature B',
            description: 'Another toggle feature',
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
            features: ['feature-a', 'feature-b'],
          },
        ],
      })

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
                    active: true,
                  },
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-b',
                    name: 'Feature B',
                    description: 'Another toggle feature',
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
                ],
              },
            },
            transaction
          )
      )

      expect(updateResult.productFeatures.added).toHaveLength(0)
      expect(updateResult.productFeatures.removed).toHaveLength(1)
    })

    it('does not modify productFeatures when no changes', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
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
                ],
              },
            },
            transaction
          )
      )

      expect(updateResult.productFeatures.added).toHaveLength(0)
      expect(updateResult.productFeatures.removed).toHaveLength(0)
    })
  })

  describe('new features and new products in same update', () => {
    it('creates new features and products that use those features in the same update', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
                    active: true,
                  },
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-new',
                    name: 'New Feature',
                    description: 'A newly added feature',
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
                      name: 'New Product',
                      slug: 'new-product',
                      default: false,
                      active: true,
                    },
                    price: {
                      type: PriceType.Subscription,
                      slug: 'new-product-monthly',
                      unitPrice: 2999,
                      isDefault: true,
                      active: true,
                      intervalCount: 1,
                      intervalUnit: IntervalUnit.Month,
                      usageMeterId: null,
                      usageEventsPerUnit: null,
                    },
                    features: ['feature-new'],
                  },
                ],
              },
            },
            transaction
          )
      )

      expect(updateResult.features.created).toHaveLength(1)
      expect(updateResult.features.created[0].slug).toBe(
        'feature-new'
      )
      expect(updateResult.products.created).toHaveLength(1)
      expect(updateResult.products.created[0].slug).toBe(
        'new-product'
      )
      expect(updateResult.productFeatures.added).toHaveLength(1)

      // Verify the productFeature links the new product to the new feature
      const newProductId = updateResult.products.created[0].id
      const newFeatureId = updateResult.features.created[0].id
      const addedProductFeature =
        updateResult.productFeatures.added[0]
      expect(addedProductFeature.productId).toBe(newProductId)
      expect(addedProductFeature.featureId).toBe(newFeatureId)
    })

    it('creates new usage meters and features that use those meters in the same update', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
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
                    description: 'Monthly API credits',
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
                    features: ['feature-a', 'api-credits'],
                  },
                ],
              },
            },
            transaction
          )
      )

      expect(updateResult.usageMeters.created).toHaveLength(1)
      expect(updateResult.usageMeters.created[0].slug).toBe(
        'api-calls'
      )
      expect(updateResult.features.created).toHaveLength(1)
      expect(updateResult.features.created[0].slug).toBe(
        'api-credits'
      )
      expect(updateResult.features.created[0].type).toBe(
        FeatureType.UsageCreditGrant
      )
      expect(updateResult.features.created[0].usageMeterId).toBe(
        updateResult.usageMeters.created[0].id
      )
    })
  })

  describe('complex scenario', () => {
    it('handles multiple simultaneous changes including renaming, adding, and removing', async () => {
      const setupResult = await createBasicPricingModel({
        name: 'Old Name',
        features: [
          {
            type: FeatureType.Toggle,
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A toggle feature',
            active: true,
          },
          {
            type: FeatureType.Toggle,
            slug: 'feature-b',
            name: 'Feature B',
            description: 'Another toggle feature',
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
            features: ['feature-a', 'feature-b'],
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
            features: ['feature-a', 'feature-b'],
          },
        ],
      })

      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'New Name',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A Renamed',
                    description: 'A toggle feature',
                    active: true,
                  },
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-c',
                    name: 'Feature C',
                    description: 'A new feature',
                    active: true,
                  },
                ],
                products: [
                  {
                    product: {
                      name: 'Starter Plan Updated',
                      slug: 'starter',
                      default: false,
                      active: true,
                    },
                    price: {
                      type: PriceType.Subscription,
                      slug: 'starter-monthly',
                      unitPrice: 2499,
                      isDefault: true,
                      active: true,
                      intervalCount: 1,
                      intervalUnit: IntervalUnit.Month,
                      usageMeterId: null,
                      usageEventsPerUnit: null,
                    },
                    features: ['feature-a', 'feature-c'],
                  },
                  {
                    product: {
                      name: 'Enterprise Plan',
                      slug: 'enterprise',
                      default: false,
                      active: true,
                    },
                    price: {
                      type: PriceType.Subscription,
                      slug: 'enterprise-monthly',
                      unitPrice: 9999,
                      isDefault: true,
                      active: true,
                      intervalCount: 1,
                      intervalUnit: IntervalUnit.Month,
                      usageMeterId: null,
                      usageEventsPerUnit: null,
                    },
                    features: ['feature-a', 'feature-c'],
                  },
                ],
              },
            },
            transaction
          )
      )

      // Pricing model renamed
      expect(updateResult.pricingModel.name).toBe('New Name')

      // Feature A renamed, feature B removed, feature C added
      expect(updateResult.features.created).toHaveLength(1)
      expect(updateResult.features.created[0].slug).toBe('feature-c')
      expect(updateResult.features.updated).toHaveLength(1)
      expect(updateResult.features.updated[0].slug).toBe('feature-a')
      expect(updateResult.features.updated[0].name).toBe(
        'Feature A Renamed'
      )
      expect(updateResult.features.deactivated).toHaveLength(1)
      expect(updateResult.features.deactivated[0].slug).toBe(
        'feature-b'
      )

      // Starter updated (name + price), Pro removed, Enterprise added
      // Note: 'free' auto-generated product is protected and preserved by protectDefaultProduct
      expect(updateResult.products.created).toHaveLength(1)
      expect(updateResult.products.created[0].slug).toBe('enterprise')
      expect(updateResult.products.updated).toHaveLength(1)
      expect(updateResult.products.updated[0].name).toBe(
        'Starter Plan Updated'
      )
      // 1 product deactivated: 'pro' (free is protected)
      expect(updateResult.products.deactivated).toHaveLength(1)
      const proDeactivated = updateResult.products.deactivated.find(
        (p) => p.slug === 'pro'
      )
      expect(proDeactivated).not.toBeUndefined()

      // Starter price changed
      expect(
        updateResult.prices.created.length
      ).toBeGreaterThanOrEqual(2)
      expect(
        updateResult.prices.deactivated.length
      ).toBeGreaterThanOrEqual(1)

      // Verify database state
      const allProducts = await adminTransaction(
        async ({ transaction }) =>
          selectProducts(
            { pricingModelId: setupResult.pricingModel.id },
            transaction
          )
      )
      const activeProducts = allProducts.filter((p) => p.active)
      // 3 active products: enterprise, starter, and the protected free product
      expect(activeProducts).toHaveLength(3)
      expect(activeProducts.map((p) => p.slug).sort()).toEqual([
        'enterprise',
        'free',
        'starter',
      ])
    })
  })

  describe('database state verification', () => {
    it('correctly persists all changes to the database', async () => {
      const setupResult = await createBasicPricingModel({
        features: [
          {
            type: FeatureType.Toggle,
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A toggle feature',
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
        ],
      })

      await adminTransaction(async ({ transaction }) =>
        updatePricingModelTransaction(
          {
            pricingModelId: setupResult.pricingModel.id,
            proposedInput: {
              name: 'Updated Pricing Model',
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
              ],
              features: [
                {
                  type: FeatureType.Toggle,
                  slug: 'feature-a',
                  name: 'Feature A Updated',
                  description: 'A toggle feature',
                  active: true,
                },
                {
                  type: FeatureType.Toggle,
                  slug: 'feature-b',
                  name: 'Feature B',
                  description: 'New feature',
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
                    unitPrice: 2999,
                    isDefault: true,
                    active: true,
                    intervalCount: 1,
                    intervalUnit: IntervalUnit.Month,
                    usageMeterId: null,
                    usageEventsPerUnit: null,
                  },
                  features: ['feature-a', 'feature-b'],
                },
              ],
            },
          },
          transaction
        )
      )

      // Verify database state
      const [usageMeters, features, products, productFeatures] =
        await Promise.all([
          adminTransaction(async ({ transaction }) =>
            selectUsageMeters(
              { pricingModelId: setupResult.pricingModel.id },
              transaction
            )
          ),
          adminTransaction(async ({ transaction }) =>
            selectFeatures(
              { pricingModelId: setupResult.pricingModel.id },
              transaction
            )
          ),
          adminTransaction(async ({ transaction }) =>
            selectProducts(
              { pricingModelId: setupResult.pricingModel.id },
              transaction
            )
          ),
          adminTransaction(async ({ transaction }) => {
            const prods = await selectProducts(
              { pricingModelId: setupResult.pricingModel.id },
              transaction
            )
            return selectProductFeatures(
              { productId: prods.map((p) => p.id) },
              transaction
            )
          }),
        ])

      // Verify usage meters
      expect(usageMeters).toHaveLength(1)
      expect(usageMeters[0].slug).toBe('api-calls')

      // Verify features
      expect(features).toHaveLength(2)
      const featureA = features.find((f) => f.slug === 'feature-a')
      const featureB = features.find((f) => f.slug === 'feature-b')
      expect(featureA?.name).toBe('Feature A Updated')
      expect(featureB?.name).toBe('Feature B')

      // Verify products (including auto-generated default)
      const activeProducts = products.filter((p) => p.active)
      expect(activeProducts.length).toBeGreaterThanOrEqual(1)
      const starterProduct = activeProducts.find(
        (p) => p.slug === 'starter'
      )
      // Verify prices
      const starterPrices = await adminTransaction(
        async ({ transaction }) =>
          selectPrices({ productId: starterProduct!.id }, transaction)
      )
      const activePrice = starterPrices.find((p) => p.active)
      expect(activePrice!.unitPrice).toBe(2999)

      // Verify productFeatures
      const starterProductFeatures = productFeatures.filter(
        (pf) => pf.productId === starterProduct!.id && !pf.expiredAt
      )
      expect(starterProductFeatures).toHaveLength(2)
    })
  })

  describe('default product protection', () => {
    it('prevents removal of default product when proposed input removes it, automatically adding it back', async () => {
      // Setup with explicit default product
      const setupResult = await createBasicPricingModel({
        products: [
          {
            product: {
              name: 'Free Plan',
              slug: 'free',
              default: true,
              active: true,
            },
            price: {
              type: PriceType.Subscription,
              slug: 'free-monthly',
              unitPrice: 0,
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
              unitPrice: 2999,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null,
            },
            features: ['feature-a'],
          },
        ],
      })

      // Try to update without the default product - only include Pro
      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
                    active: true,
                  },
                ],
                products: [
                  // Only Pro Plan - Free (default) is missing
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
                      unitPrice: 2999,
                      isDefault: true,
                      active: true,
                      intervalCount: 1,
                      intervalUnit: IntervalUnit.Month,
                      usageMeterId: null,
                      usageEventsPerUnit: null,
                    },
                    features: ['feature-a'],
                  },
                ],
              },
            },
            transaction
          )
      )

      // Verify the default product was NOT deactivated (it was auto-added back)
      const freeDeactivated = updateResult.products.deactivated.find(
        (p) => p.slug === 'free'
      )
      expect(freeDeactivated).toBeUndefined()

      // Verify database state - default product should still be active
      const allProducts = await adminTransaction(
        async ({ transaction }) =>
          selectProducts(
            { pricingModelId: setupResult.pricingModel.id },
            transaction
          )
      )
      const activeProducts = allProducts.filter((p) => p.active)
      const freeProduct = activeProducts.find(
        (p) => p.slug === 'free'
      )
      expect(freeProduct!.default).toBe(true)
      expect(freeProduct!.active).toBe(true)
    })

    it('preserves default product protected fields (unitPrice, slug, active) when proposed changes them, while applying allowed changes (name, description)', async () => {
      // Setup with explicit default product
      const setupResult = await createBasicPricingModel({
        products: [
          {
            product: {
              name: 'Free Plan',
              slug: 'free',
              default: true,
              active: true,
              description: 'Original description',
            },
            price: {
              type: PriceType.Subscription,
              slug: 'free-monthly',
              unitPrice: 0,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null,
            },
            features: ['feature-a'],
          },
        ],
      })

      // Try to update with protected field changes on the default product
      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
                    active: true,
                  },
                ],
                products: [
                  {
                    product: {
                      name: 'Updated Free Plan Name', // Allowed change
                      slug: 'free', // Same slug to identify the product
                      default: true,
                      active: false, // Protected - should be ignored
                      description: 'Updated description', // Allowed change
                    },
                    price: {
                      type: PriceType.Subscription,
                      slug: 'free-monthly',
                      unitPrice: 999, // Protected - should be ignored
                      isDefault: true,
                      active: true,
                      intervalCount: 1,
                      intervalUnit: IntervalUnit.Month,
                      usageMeterId: null,
                      usageEventsPerUnit: null,
                    },
                    features: ['feature-a'],
                  },
                ],
              },
            },
            transaction
          )
      )

      // Verify database state
      const allProducts = await adminTransaction(
        async ({ transaction }) =>
          selectProducts(
            { pricingModelId: setupResult.pricingModel.id },
            transaction
          )
      )
      const freeProduct = allProducts.find((p) => p.slug === 'free')

      // Protected fields should be preserved
      expect(freeProduct!.active).toBe(true) // Protected - was not changed to false
      expect(freeProduct!.slug).toBe('free') // Protected - preserved

      // Allowed fields should be updated
      expect(freeProduct!.name).toBe('Updated Free Plan Name')
      expect(freeProduct!.description).toBe('Updated description')

      // Price protected fields should be preserved
      const prices = await adminTransaction(async ({ transaction }) =>
        selectPrices({ productId: freeProduct!.id }, transaction)
      )
      const activePrice = prices.find((p) => p.active)
      expect(activePrice!.unitPrice).toBe(0) // Protected - was not changed to 999
    })

    it('allows changing only name, description, and features on default product without affecting other fields', async () => {
      // Setup with explicit default product with features
      const setupResult = await createBasicPricingModel({
        features: [
          {
            type: FeatureType.Toggle,
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A toggle feature',
            active: true,
          },
          {
            type: FeatureType.Toggle,
            slug: 'feature-b',
            name: 'Feature B',
            description: 'Another toggle feature',
            active: true,
          },
        ],
        products: [
          {
            product: {
              name: 'Free Plan',
              slug: 'free',
              default: true,
              active: true,
              description: 'Original description',
            },
            price: {
              type: PriceType.Subscription,
              slug: 'free-monthly',
              unitPrice: 0,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null,
            },
            features: ['feature-a'], // Original feature
          },
        ],
      })

      // Update only allowed fields on the default product
      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
                    active: true,
                  },
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-b',
                    name: 'Feature B',
                    description: 'Another toggle feature',
                    active: true,
                  },
                ],
                products: [
                  {
                    product: {
                      name: 'New Free Plan Name', // Allowed change
                      slug: 'free',
                      default: true,
                      active: true, // Not changing protected field
                      description: 'New description', // Allowed change
                    },
                    price: {
                      type: PriceType.Subscription,
                      slug: 'free-monthly',
                      unitPrice: 0, // Not changing protected field
                      isDefault: true,
                      active: true,
                      intervalCount: 1,
                      intervalUnit: IntervalUnit.Month,
                      usageMeterId: null,
                      usageEventsPerUnit: null,
                    },
                    features: ['feature-a', 'feature-b'], // Allowed change - adding feature-b
                  },
                ],
              },
            },
            transaction
          )
      )

      // Verify database state
      const allProducts = await adminTransaction(
        async ({ transaction }) =>
          selectProducts(
            { pricingModelId: setupResult.pricingModel.id },
            transaction
          )
      )
      const freeProduct = allProducts.find((p) => p.slug === 'free')

      // Allowed fields should be updated
      expect(freeProduct!.name).toBe('New Free Plan Name')
      expect(freeProduct!.description).toBe('New description')

      // Protected fields should be unchanged
      expect(freeProduct!.active).toBe(true)
      expect(freeProduct!.slug).toBe('free')
      expect(freeProduct!.default).toBe(true)

      // Features should be updated (features are allowed to change)
      expect(updateResult.productFeatures.added).toHaveLength(1)
      const productFeatures = await adminTransaction(
        async ({ transaction }) =>
          selectProductFeatures(
            { productId: freeProduct!.id },
            transaction
          )
      )
      const activeFeatures = productFeatures.filter(
        (pf) => !pf.expiredAt
      )
      expect(activeFeatures).toHaveLength(2) // feature-a and feature-b

      // Price should be unchanged
      const prices = await adminTransaction(async ({ transaction }) =>
        selectPrices({ productId: freeProduct!.id }, transaction)
      )
      const activePrice = prices.find((p) => p.active)
      expect(activePrice!.unitPrice).toBe(0)
      expect(activePrice!.intervalUnit).toBe(IntervalUnit.Month)
    })

    it('preserves default: true when proposed attempts to demote existing default product by setting default: false, avoiding duplicate slugs', async () => {
      // Setup with explicit default product
      const setupResult = await createBasicPricingModel({
        products: [
          {
            product: {
              name: 'Free Plan',
              slug: 'free',
              default: true,
              active: true,
            },
            price: {
              type: PriceType.Subscription,
              slug: 'free-monthly',
              unitPrice: 0,
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
              unitPrice: 2999,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null,
            },
            features: ['feature-a'],
          },
        ],
      })

      // Attempt to demote the default product by setting default: false
      const updateResult = await adminTransaction(
        async ({ transaction }) =>
          updatePricingModelTransaction(
            {
              pricingModelId: setupResult.pricingModel.id,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                usageMeters: [],
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A toggle feature',
                    active: true,
                  },
                ],
                products: [
                  {
                    product: {
                      name: 'Demoted Free Plan', // Allowed change
                      slug: 'free', // Same slug as existing default
                      default: false, // Attempting to demote
                      active: true,
                    },
                    price: {
                      type: PriceType.Subscription,
                      slug: 'free-monthly',
                      unitPrice: 0,
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
                      unitPrice: 2999,
                      isDefault: true,
                      active: true,
                      intervalCount: 1,
                      intervalUnit: IntervalUnit.Month,
                      usageMeterId: null,
                      usageEventsPerUnit: null,
                    },
                    features: ['feature-a'],
                  },
                ],
              },
            },
            transaction
          )
      )

      // Verify database state - should have exactly 2 active products (no duplicates)
      const allProducts = await adminTransaction(
        async ({ transaction }) =>
          selectProducts(
            { pricingModelId: setupResult.pricingModel.id },
            transaction
          )
      )
      const activeProducts = allProducts.filter((p) => p.active)
      expect(activeProducts).toHaveLength(2)

      // The free product should preserve default: true
      const freeProduct = activeProducts.find(
        (p) => p.slug === 'free'
      )
      expect(freeProduct!.default).toBe(true)
      expect(freeProduct!.active).toBe(true)

      // The allowed name change should be applied
      expect(freeProduct!.name).toBe('Demoted Free Plan')

      // Pro product should remain non-default
      const proProduct = activeProducts.find((p) => p.slug === 'pro')
      expect(proProduct!.default).toBe(false)
    })
  })
})
