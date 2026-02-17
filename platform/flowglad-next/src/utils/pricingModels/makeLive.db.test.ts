import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { FeatureType, IntervalUnit, PriceType } from '@db-core/enums'
import type { Organization } from '@db-core/schema/organizations'
import { Result } from 'better-result'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectFeatures } from '@/db/tableMethods/featureMethods'
import { selectPrices } from '@/db/tableMethods/priceMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { selectResources } from '@/db/tableMethods/resourceMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import { makeLivePricingModelTransaction } from './makeLive'
import type { SetupPricingModelInput } from './setupSchemas'
import { setupPricingModelTransaction } from './setupTransaction'

let organization: Organization.Record

beforeEach(async () => {
  const orgData = await setupOrg({ skipPricingModel: true })
  organization = orgData.organization
})

afterEach(async () => {
  if (organization) {
    await teardownOrg({ organizationId: organization.id })
  }
})

const createPricingModel = async (
  overrides: Partial<SetupPricingModelInput> & {
    livemode?: boolean
  } = {}
) => {
  const { livemode = false, ...inputOverrides } = overrides

  const processedUsageMeters: SetupPricingModelInput['usageMeters'] =
    (inputOverrides.usageMeters ?? []).map((meter) => {
      if ('usageMeter' in meter) {
        return meter
      }
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

  const finalProducts = inputOverrides.products ?? baseProducts

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
    ...inputOverrides,
    usageMeters: processedUsageMeters,
    products: finalProducts,
  }

  return (
    await adminTransaction(async (ctx) => {
      return Result.ok(
        await (
          await setupPricingModelTransaction(
            {
              input,
              organizationId: organization.id,
              livemode,
            },
            ctx
          )
        ).unwrap()
      )
    })
  ).unwrap()
}

describe('makeLivePricingModel', () => {
  it('should replace live PM features/products/prices with test PM structure', async () => {
    // Create a live PM with its own structure
    await createPricingModel({
      livemode: true,
      name: 'Live PM',
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'old-feature',
          name: 'Old Feature',
          description: 'An old feature',
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'Old Product',
            slug: 'old-product',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'old-price',
            unitPrice: 999,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
          features: ['old-feature'],
        },
      ],
    })

    // Create a test PM with different structure
    const testPm = await createPricingModel({
      livemode: false,
      name: 'Test PM',
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'new-feature',
          name: 'New Feature',
          description: 'A new feature',
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'New Product',
            slug: 'new-product',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'new-price',
            unitPrice: 2999,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
          features: ['new-feature'],
        },
      ],
    })

    // Capture test PM's product count before makeLive
    // (includes auto-generated free default product from setup)
    const testPmProducts = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectProducts(
            { pricingModelId: testPm.pricingModel.id, active: true },
            transaction
          )
        )
      }
    ).then((r) => r.unwrap())
    const testPmProductCount = testPmProducts.length

    const result = (
      await adminTransaction(async (ctx) => {
        return makeLivePricingModelTransaction(
          {
            testPricingModelId: testPm.pricingModel.id,
            organizationId: organization.id,
          },
          ctx
        )
      })
    ).unwrap()

    expect(result.pricingModel.livemode).toBe(true)

    // Verify live PM has the new feature and the old one is deactivated
    const liveFeatures = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectFeatures(
            { pricingModelId: result.pricingModel.id },
            transaction
          )
        )
      }
    ).then((r) => r.unwrap())

    const activeFeatures = liveFeatures.filter((f) => f.active)
    expect(activeFeatures).toHaveLength(1)
    expect(activeFeatures[0].slug).toBe('new-feature')

    // Verify live PM has the same number of active products as the test PM
    const liveProducts = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectProducts(
            { pricingModelId: result.pricingModel.id },
            transaction
          )
        )
      }
    ).then((r) => r.unwrap())

    const activeProducts = liveProducts.filter((p) => p.active)
    expect(activeProducts).toHaveLength(testPmProductCount)
    expect(activeProducts.map((p) => p.slug)).toContain('new-product')

    // Verify live PM has the new price
    const livePrices = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectPrices(
            { pricingModelId: result.pricingModel.id },
            transaction
          )
        )
      }
    ).then((r) => r.unwrap())

    const newProductPrice = livePrices.find(
      (p) =>
        p.active &&
        p.type === PriceType.Subscription &&
        p.unitPrice === 2999
    )
    expect(newProductPrice?.slug).toBe('new-price')
  })

  it('should create live PM from test PM when no live PM exists', async () => {
    const testPm = await createPricingModel({
      livemode: false,
      name: 'Test PM',
    })

    const result = (
      await adminTransaction(async (ctx) => {
        return makeLivePricingModelTransaction(
          {
            testPricingModelId: testPm.pricingModel.id,
            organizationId: organization.id,
          },
          ctx
        )
      })
    ).unwrap()

    expect(result.pricingModel.livemode).toBe(true)
    expect(result.pricingModel.id).not.toBe(testPm.pricingModel.id)

    // Verify the new live PM has the test PM's structure
    const liveFeatures = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectFeatures(
            { pricingModelId: result.pricingModel.id, active: true },
            transaction
          )
        )
      }
    ).then((r) => r.unwrap())

    expect(liveFeatures).toHaveLength(1)
    expect(liveFeatures[0].slug).toBe('feature-a')
  })

  it('should preserve existing live PM usage meters not in test PM', async () => {
    // Create live PM with a usage meter
    await createPricingModel({
      livemode: true,
      name: 'Live PM',
      usageMeters: [
        {
          usageMeter: {
            slug: 'live-only-meter',
            name: 'Live Only Meter',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'live-only-meter-price',
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

    // Create test PM without that meter
    const testPm = await createPricingModel({
      livemode: false,
      name: 'Test PM',
      usageMeters: [],
    })

    const result = (
      await adminTransaction(async (ctx) => {
        return makeLivePricingModelTransaction(
          {
            testPricingModelId: testPm.pricingModel.id,
            organizationId: organization.id,
          },
          ctx
        )
      })
    ).unwrap()

    // The live-only meter should still exist
    const liveMeters = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectUsageMeters(
            { pricingModelId: result.pricingModel.id },
            transaction
          )
        )
      }
    ).then((r) => r.unwrap())

    expect(liveMeters).toHaveLength(1)
    expect(liveMeters[0].slug).toBe('live-only-meter')
  })

  it('should add new usage meters from test PM to live PM', async () => {
    // Create live PM without usage meters
    await createPricingModel({
      livemode: true,
      name: 'Live PM',
      usageMeters: [],
    })

    // Create test PM with a new usage meter
    const testPm = await createPricingModel({
      livemode: false,
      name: 'Test PM',
      usageMeters: [
        {
          usageMeter: { slug: 'new-meter', name: 'New Meter' },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'new-meter-price',
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
    })

    const result = (
      await adminTransaction(async (ctx) => {
        return makeLivePricingModelTransaction(
          {
            testPricingModelId: testPm.pricingModel.id,
            organizationId: organization.id,
          },
          ctx
        )
      })
    ).unwrap()

    const liveMeters = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectUsageMeters(
            { pricingModelId: result.pricingModel.id },
            transaction
          )
        )
      }
    ).then((r) => r.unwrap())

    expect(liveMeters).toHaveLength(1)
    expect(liveMeters[0].slug).toBe('new-meter')
  })

  it('should update usage meters that exist in both test and live PM', async () => {
    // Create live PM with a usage meter
    await createPricingModel({
      livemode: true,
      name: 'Live PM',
      usageMeters: [
        {
          usageMeter: { slug: 'shared-meter', name: 'Old Name' },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'shared-meter-price',
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

    // Create test PM with same meter slug but different name
    const testPm = await createPricingModel({
      livemode: false,
      name: 'Test PM',
      usageMeters: [
        {
          usageMeter: { slug: 'shared-meter', name: 'Updated Name' },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'shared-meter-price',
              unitPrice: 20,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageEventsPerUnit: 200,
              trialPeriodDays: null,
            },
          ],
        },
      ],
    })

    const result = (
      await adminTransaction(async (ctx) => {
        return makeLivePricingModelTransaction(
          {
            testPricingModelId: testPm.pricingModel.id,
            organizationId: organization.id,
          },
          ctx
        )
      })
    ).unwrap()

    const liveMeters = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectUsageMeters(
            { pricingModelId: result.pricingModel.id },
            transaction
          )
        )
      }
    ).then((r) => r.unwrap())

    expect(liveMeters).toHaveLength(1)
    expect(liveMeters[0].slug).toBe('shared-meter')
    expect(liveMeters[0].name).toBe('Updated Name')
  })

  it('should be a no-op if source PM is already livemode', async () => {
    const livePm = await createPricingModel({
      livemode: true,
      name: 'Live PM',
    })

    const result = (
      await adminTransaction(async (ctx) => {
        return makeLivePricingModelTransaction(
          {
            testPricingModelId: livePm.pricingModel.id,
            organizationId: organization.id,
          },
          ctx
        )
      })
    ).unwrap()

    expect(result.pricingModel.id).toBe(livePm.pricingModel.id)
    expect(result.pricingModel.name).toBe('Live PM')
  })

  it('should fail if source PM does not belong to the organization', async () => {
    // Create a PM in a different org
    const otherOrgData = await setupOrg({ skipPricingModel: true })
    const otherPm = await (async () => {
      return (
        await adminTransaction(async (ctx) => {
          return Result.ok(
            await (
              await setupPricingModelTransaction(
                {
                  input: {
                    name: 'Other Org PM',
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
                    products: [
                      {
                        product: {
                          name: 'Starter',
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
                    usageMeters: [],
                  },
                  organizationId: otherOrgData.organization.id,
                  livemode: false,
                },
                ctx
              )
            ).unwrap()
          )
        })
      ).unwrap()
    })()

    const result = await adminTransaction(async (ctx) => {
      return makeLivePricingModelTransaction(
        {
          testPricingModelId: otherPm.pricingModel.id,
          organizationId: organization.id,
        },
        ctx
      )
    })

    expect(Result.isError(result)).toBe(true)

    // Clean up the other org
    await teardownOrg({
      organizationId: otherOrgData.organization.id,
    })
  })

  it('should not modify the source test PM', async () => {
    const testPm = await createPricingModel({
      livemode: false,
      name: 'Test PM Original',
    })

    // Capture test PM state before makeLive
    const productsBefore = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectProducts(
            { pricingModelId: testPm.pricingModel.id, active: true },
            transaction
          )
        )
      }
    ).then((r) => r.unwrap())
    const productCountBefore = productsBefore.length
    const productSlugsBefore = productsBefore
      .map((p) => p.slug)
      .sort()

    await adminTransaction(async (ctx) => {
      return makeLivePricingModelTransaction(
        {
          testPricingModelId: testPm.pricingModel.id,
          organizationId: organization.id,
        },
        ctx
      )
    })

    // Verify test PM is unchanged
    const testFeatures = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectFeatures(
            { pricingModelId: testPm.pricingModel.id, active: true },
            transaction
          )
        )
      }
    ).then((r) => r.unwrap())

    expect(testFeatures).toHaveLength(1)
    expect(testFeatures[0].slug).toBe('feature-a')

    const testProducts = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectProducts(
            { pricingModelId: testPm.pricingModel.id, active: true },
            transaction
          )
        )
      }
    ).then((r) => r.unwrap())

    expect(testProducts).toHaveLength(productCountBefore)
    expect(testProducts.map((p) => p.slug).sort()).toEqual(
      productSlugsBefore
    )
  })

  it('should preserve live PM name', async () => {
    await createPricingModel({
      livemode: true,
      name: 'My Custom Live Name',
    })

    const testPm = await createPricingModel({
      livemode: false,
      name: 'Test PM Different Name',
    })

    const result = (
      await adminTransaction(async (ctx) => {
        return makeLivePricingModelTransaction(
          {
            testPricingModelId: testPm.pricingModel.id,
            organizationId: organization.id,
          },
          ctx
        )
      })
    ).unwrap()

    expect(result.pricingModel.name).toBe('My Custom Live Name')
  })

  it('should deactivate live PM products/features not in test PM', async () => {
    // Create live PM with features and products that won't be in test PM
    await createPricingModel({
      livemode: true,
      name: 'Live PM',
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'live-only-feature',
          name: 'Live Only Feature',
          description: 'Will be deactivated',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'shared-feature',
          name: 'Shared Feature',
          description: 'Will stay',
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'Live Only Product',
            slug: 'live-only-product',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'live-only-price',
            unitPrice: 999,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
          features: ['live-only-feature'],
        },
      ],
    })

    // Test PM only has shared-feature and a different product
    const testPm = await createPricingModel({
      livemode: false,
      name: 'Test PM',
      features: [
        {
          type: FeatureType.Toggle,
          slug: 'shared-feature',
          name: 'Shared Feature',
          description: 'Will stay',
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'New Product',
            slug: 'new-product',
            default: false,
            active: true,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'new-price',
            unitPrice: 2999,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
          features: ['shared-feature'],
        },
      ],
    })

    // Capture test PM's product count before makeLive
    const testPmProducts = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectProducts(
            { pricingModelId: testPm.pricingModel.id, active: true },
            transaction
          )
        )
      }
    ).then((r) => r.unwrap())
    const testPmProductCount = testPmProducts.length

    const result = (
      await adminTransaction(async (ctx) => {
        return makeLivePricingModelTransaction(
          {
            testPricingModelId: testPm.pricingModel.id,
            organizationId: organization.id,
          },
          ctx
        )
      })
    ).unwrap()

    const liveFeatures = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectFeatures(
            { pricingModelId: result.pricingModel.id },
            transaction
          )
        )
      }
    ).then((r) => r.unwrap())

    const activeFeatures = liveFeatures.filter((f) => f.active)
    const deactivatedFeatures = liveFeatures.filter((f) => !f.active)

    expect(activeFeatures).toHaveLength(1)
    expect(activeFeatures[0].slug).toBe('shared-feature')
    expect(
      deactivatedFeatures.some((f) => f.slug === 'live-only-feature')
    ).toBe(true)

    const liveProducts = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectProducts(
            { pricingModelId: result.pricingModel.id },
            transaction
          )
        )
      }
    ).then((r) => r.unwrap())

    const activeProducts = liveProducts.filter((p) => p.active)
    const deactivatedProducts = liveProducts.filter((p) => !p.active)

    // Active products should match test PM's product count
    expect(activeProducts).toHaveLength(testPmProductCount)
    expect(activeProducts.map((p) => p.slug)).toContain('new-product')
    expect(
      deactivatedProducts.some((p) => p.slug === 'live-only-product')
    ).toBe(true)
  })

  it('should handle resources correctly (create new, update existing, deactivate removed)', async () => {
    // Create live PM with resources
    await createPricingModel({
      livemode: true,
      name: 'Live PM',
      resources: [
        {
          slug: 'existing-resource',
          name: 'Existing Resource',
          active: true,
        },
        {
          slug: 'to-be-removed',
          name: 'To Be Removed',
          active: true,
        },
      ],
    })

    // Create test PM with one overlapping and one new resource
    const testPm = await createPricingModel({
      livemode: false,
      name: 'Test PM',
      resources: [
        {
          slug: 'existing-resource',
          name: 'Updated Resource Name',
          active: true,
        },
        {
          slug: 'brand-new-resource',
          name: 'Brand New Resource',
          active: true,
        },
      ],
    })

    const result = (
      await adminTransaction(async (ctx) => {
        return makeLivePricingModelTransaction(
          {
            testPricingModelId: testPm.pricingModel.id,
            organizationId: organization.id,
          },
          ctx
        )
      })
    ).unwrap()

    const liveResources = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectResources(
            { pricingModelId: result.pricingModel.id },
            transaction
          )
        )
      }
    ).then((r) => r.unwrap())

    const activeResources = liveResources.filter((r) => r.active)
    const deactivatedResources = liveResources.filter(
      (r) => !r.active
    )

    // Existing resource should be updated
    const existingResource = activeResources.find(
      (r) => r.slug === 'existing-resource'
    )
    expect(existingResource?.name).toBe('Updated Resource Name')

    // New resource should be created
    const newResource = activeResources.find(
      (r) => r.slug === 'brand-new-resource'
    )
    expect(newResource?.name).toBe('Brand New Resource')

    // Removed resource should be deactivated
    expect(
      deactivatedResources.some((r) => r.slug === 'to-be-removed')
    ).toBe(true)
  })
})
