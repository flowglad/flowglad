import { beforeEach, describe, expect, it } from 'bun:test'
import {
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PriceType,
  UsageMeterAggregationType,
} from '@db-core/enums'
import type { PricingModel } from '@db-core/schema/pricingModels'
import { Result } from 'better-result'
import { setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectFeatures } from '@/db/tableMethods/featureMethods'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import { setupPricingModelTransaction } from '@/utils/pricingModels/setupTransaction'
import { updatePricingModelTransaction } from '@/utils/pricingModels/updateTransaction'

describe('pricingModels.update (extended)', () => {
  let organizationId: string
  let pricingModelId: string
  let pricingModel: PricingModel.Record
  const livemode = false

  beforeEach(async () => {
    // Set up organization and pricing model with initial structure
    const result = (
      await adminTransaction(
        async (ctx) => {
          const { organization } = await setupOrg()

          // Create a pricing model with known structure for testing
          const setupResult = await setupPricingModelTransaction(
            {
              input: {
                name: 'Test Pricing Model',
                isDefault: false,
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A test toggle feature',
                    active: true,
                  },
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-b',
                    name: 'Feature B',
                    description: 'Another test toggle feature',
                    active: true,
                  },
                ],
                products: [
                  {
                    product: {
                      name: 'Pro Plan',
                      slug: 'pro-plan',
                      description: 'Professional tier',
                      active: true,
                      default: false,
                    },
                    price: {
                      type: PriceType.Subscription,
                      name: 'Monthly Pro',
                      slug: 'pro-monthly',
                      unitPrice: 2999,
                      intervalUnit: IntervalUnit.Month,
                      intervalCount: 1,
                      isDefault: true,
                      active: true,
                    },
                    features: ['feature-a', 'feature-b'],
                  },
                ],
                usageMeters: [
                  {
                    usageMeter: {
                      slug: 'api-calls',
                      name: 'API Calls',
                      aggregationType: UsageMeterAggregationType.Sum,
                    },
                    prices: [
                      {
                        type: PriceType.Usage,
                        name: 'API Usage Price',
                        slug: 'api-usage-price',
                        unitPrice: 100,
                        intervalUnit: IntervalUnit.Month,
                        intervalCount: 1,
                        usageEventsPerUnit: 1000,
                        isDefault: true,
                        active: true,
                      },
                    ],
                  },
                ],
              },
              organizationId: organization.id,
              livemode,
            },
            ctx
          )

          const pm = setupResult.unwrap()

          return Result.ok({
            organizationId: organization.id,
            pricingModelId: pm.pricingModel.id,
            pricingModel: pm.pricingModel,
          })
        },
        { livemode }
      )
    ).unwrap()

    organizationId = result.organizationId
    pricingModelId = result.pricingModelId
    pricingModel = result.pricingModel
  })

  it('updates pricing model name (existing behavior)', async () => {
    const result = (
      await adminTransaction(
        async (ctx) => {
          const updateResult = await updatePricingModelTransaction(
            {
              pricingModelId,
              proposedInput: {
                name: 'Updated Name',
                isDefault: false,
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A test toggle feature',
                    active: true,
                  },
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-b',
                    name: 'Feature B',
                    description: 'Another test toggle feature',
                    active: true,
                  },
                ],
                products: [
                  {
                    product: {
                      name: 'Pro Plan',
                      slug: 'pro-plan',
                      description: 'Professional tier',
                      active: true,
                      default: false,
                    },
                    price: {
                      type: PriceType.Subscription,
                      name: 'Monthly Pro',
                      slug: 'pro-monthly',
                      unitPrice: 2999,
                      intervalUnit: IntervalUnit.Month,
                      intervalCount: 1,
                      isDefault: true,
                      active: true,
                    },
                    features: ['feature-a', 'feature-b'],
                  },
                ],
                usageMeters: [
                  {
                    usageMeter: {
                      slug: 'api-calls',
                      name: 'API Calls',
                      aggregationType: UsageMeterAggregationType.Sum,
                    },
                    prices: [
                      {
                        type: PriceType.Usage,
                        name: 'API Usage Price',
                        slug: 'api-usage-price',
                        unitPrice: 100,
                        intervalUnit: IntervalUnit.Month,
                        intervalCount: 1,
                        usageEventsPerUnit: 1000,
                        isDefault: true,
                        active: true,
                      },
                    ],
                  },
                ],
              },
            },
            ctx
          )

          return updateResult
        },
        { livemode }
      )
    ).unwrap()

    expect(result.pricingModel.name).toBe('Updated Name')
    expect(result.pricingModel.id).toBe(pricingModelId)
  })

  it('updates pricing model products when provided', async () => {
    const result = (
      await adminTransaction(
        async (ctx) => {
          const { transaction } = ctx

          // Update with a modified product (new name and price)
          const updateResult = await updatePricingModelTransaction(
            {
              pricingModelId,
              proposedInput: {
                name: 'Test Pricing Model',
                isDefault: false,
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A test toggle feature',
                    active: true,
                  },
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-b',
                    name: 'Feature B',
                    description: 'Another test toggle feature',
                    active: true,
                  },
                ],
                products: [
                  {
                    product: {
                      name: 'Pro Plan Updated', // Changed name
                      slug: 'pro-plan',
                      description:
                        'Professional tier - now with more features!',
                      active: true,
                      default: false,
                    },
                    price: {
                      type: PriceType.Subscription,
                      name: 'Monthly Pro Updated',
                      slug: 'pro-monthly-v2', // New price slug (price will be replaced)
                      unitPrice: 3999, // Increased price
                      intervalUnit: IntervalUnit.Month,
                      intervalCount: 1,
                      isDefault: true,
                      active: true,
                    },
                    features: ['feature-a', 'feature-b'],
                  },
                ],
                usageMeters: [
                  {
                    usageMeter: {
                      slug: 'api-calls',
                      name: 'API Calls',
                      aggregationType: UsageMeterAggregationType.Sum,
                    },
                    prices: [
                      {
                        type: PriceType.Usage,
                        name: 'API Usage Price',
                        slug: 'api-usage-price',
                        unitPrice: 100,
                        intervalUnit: IntervalUnit.Month,
                        intervalCount: 1,
                        usageEventsPerUnit: 1000,
                        isDefault: true,
                        active: true,
                      },
                    ],
                  },
                ],
              },
            },
            ctx
          )

          const updated = updateResult.unwrap()

          // Verify the product was updated
          const products = await selectProducts(
            { pricingModelId, active: true },
            transaction
          )
          // Filter to just the pro plan (not the auto-generated default)
          const proPlan = products.find((p) => p.slug === 'pro-plan')

          return Result.ok({
            result: updated,
            proPlan,
          })
        },
        { livemode }
      )
    ).unwrap()

    expect(
      result.result.products.updated.length
    ).toBeGreaterThanOrEqual(0)
    expect(result.proPlan?.name).toBe('Pro Plan Updated')
    expect(result.proPlan?.description).toBe(
      'Professional tier - now with more features!'
    )
  })

  it('returns validation error for breaking changes', async () => {
    const result = await adminTransaction(
      async (ctx) => {
        // Attempt to change feature type (which is not allowed)
        const updateResult = await updatePricingModelTransaction(
          {
            pricingModelId,
            proposedInput: {
              name: 'Test Pricing Model',
              isDefault: false,
              features: [
                {
                  // Trying to change feature-a from Toggle to UsageCreditGrant
                  type: FeatureType.UsageCreditGrant,
                  slug: 'feature-a',
                  name: 'Feature A',
                  description: 'A test feature',
                  usageMeterSlug: 'api-calls',
                  amount: 100,
                  renewalFrequency:
                    FeatureUsageGrantFrequency.EveryBillingPeriod,
                  active: true,
                },
                {
                  type: FeatureType.Toggle,
                  slug: 'feature-b',
                  name: 'Feature B',
                  description: 'Another test toggle feature',
                  active: true,
                },
              ],
              products: [
                {
                  product: {
                    name: 'Pro Plan',
                    slug: 'pro-plan',
                    description: 'Professional tier',
                    active: true,
                    default: false,
                  },
                  price: {
                    type: PriceType.Subscription,
                    name: 'Monthly Pro',
                    slug: 'pro-monthly',
                    unitPrice: 2999,
                    intervalUnit: IntervalUnit.Month,
                    intervalCount: 1,
                    isDefault: true,
                    active: true,
                  },
                  features: ['feature-a', 'feature-b'],
                },
              ],
              usageMeters: [
                {
                  usageMeter: {
                    slug: 'api-calls',
                    name: 'API Calls',
                    aggregationType: UsageMeterAggregationType.Sum,
                  },
                  prices: [
                    {
                      type: PriceType.Usage,
                      name: 'API Usage Price',
                      slug: 'api-usage-price',
                      unitPrice: 100,
                      intervalUnit: IntervalUnit.Month,
                      intervalCount: 1,
                      usageEventsPerUnit: 1000,
                      isDefault: true,
                      active: true,
                    },
                  ],
                },
              ],
            },
          },
          ctx
        )

        return updateResult
      },
      { livemode }
    )

    // The update should fail with a validation error
    expect(Result.isError(result)).toBe(true)
    if (Result.isError(result)) {
      expect(result.error.message).toContain('type')
    }
  })

  it('is backward compatible with metadata-only updates', async () => {
    // This test verifies that when only metadata fields are provided,
    // the existing behavior is preserved (no structure changes)
    const result = (
      await adminTransaction(
        async (ctx) => {
          const { transaction } = ctx

          // Get initial state
          const initialFeatures = await selectFeatures(
            { pricingModelId, active: true },
            transaction
          )
          const initialProducts = await selectProducts(
            { pricingModelId, active: true },
            transaction
          )
          const initialUsageMeters = await selectUsageMeters(
            { pricingModelId },
            transaction
          )

          // Perform update with same structure (simulating metadata-only semantics)
          const updateResult = await updatePricingModelTransaction(
            {
              pricingModelId,
              proposedInput: {
                name: 'Renamed Pricing Model',
                isDefault: false,
                // Providing the same structure should result in no changes
                features: [
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-a',
                    name: 'Feature A',
                    description: 'A test toggle feature',
                    active: true,
                  },
                  {
                    type: FeatureType.Toggle,
                    slug: 'feature-b',
                    name: 'Feature B',
                    description: 'Another test toggle feature',
                    active: true,
                  },
                ],
                products: [
                  {
                    product: {
                      name: 'Pro Plan',
                      slug: 'pro-plan',
                      description: 'Professional tier',
                      active: true,
                      default: false,
                    },
                    price: {
                      type: PriceType.Subscription,
                      name: 'Monthly Pro',
                      slug: 'pro-monthly',
                      unitPrice: 2999,
                      intervalUnit: IntervalUnit.Month,
                      intervalCount: 1,
                      isDefault: true,
                      active: true,
                    },
                    features: ['feature-a', 'feature-b'],
                  },
                ],
                usageMeters: [
                  {
                    usageMeter: {
                      slug: 'api-calls',
                      name: 'API Calls',
                      aggregationType: UsageMeterAggregationType.Sum,
                    },
                    prices: [
                      {
                        type: PriceType.Usage,
                        name: 'API Usage Price',
                        slug: 'api-usage-price',
                        unitPrice: 100,
                        intervalUnit: IntervalUnit.Month,
                        intervalCount: 1,
                        usageEventsPerUnit: 1000,
                        isDefault: true,
                        active: true,
                      },
                    ],
                  },
                ],
              },
            },
            ctx
          )

          const updated = updateResult.unwrap()

          // Get final state
          const finalFeatures = await selectFeatures(
            { pricingModelId, active: true },
            transaction
          )
          const finalProducts = await selectProducts(
            { pricingModelId, active: true },
            transaction
          )
          const finalUsageMeters = await selectUsageMeters(
            { pricingModelId },
            transaction
          )

          return Result.ok({
            updated,
            initialFeatures,
            initialProducts,
            initialUsageMeters,
            finalFeatures,
            finalProducts,
            finalUsageMeters,
          })
        },
        { livemode }
      )
    ).unwrap()

    // Name should be updated
    expect(result.updated.pricingModel.name).toBe(
      'Renamed Pricing Model'
    )

    // Structure should remain unchanged (same count of active records)
    expect(result.finalFeatures.length).toBe(
      result.initialFeatures.length
    )
    expect(result.finalProducts.length).toBe(
      result.initialProducts.length
    )
    expect(result.finalUsageMeters.length).toBe(
      result.initialUsageMeters.length
    )

    // Feature slugs should be preserved
    const initialSlugs = result.initialFeatures
      .map((f) => f.slug)
      .sort()
    const finalSlugs = result.finalFeatures.map((f) => f.slug).sort()
    expect(finalSlugs).toEqual(initialSlugs)
  })
})
