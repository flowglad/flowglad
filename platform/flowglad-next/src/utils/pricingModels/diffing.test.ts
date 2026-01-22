import { Result } from 'better-result'
import { describe, expect, it } from 'bun:test'
import {
  CurrencyCode,
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PriceType,
  UsageMeterAggregationType,
} from '@/types'
import {
  computeUpdateObject,
  type DiffResult,
  diffFeatures,
  diffPricingModel,
  diffProducts,
  diffSluggedResources,
  diffUsageMeterPrices,
  diffUsageMeters,
  type FeatureDiffInput,
  type ProductDiffInput,
  type ProductDiffResult,
  type SluggedResource,
  type UsageMeterDiffInput,
  type UsageMeterDiffResult,
  type UsageMeterPriceDiffResult,
  validateFeatureDiff,
  validatePriceChange,
  validateProductDiff,
  validateUsageMeterDiff,
  validateUsagePriceChange,
} from './diffing'
import type {
  SetupPricingModelInput,
  SetupPricingModelProductPriceInput,
  SetupUsageMeterPriceInput,
} from './setupSchemas'

type SlugAndName = SluggedResource<{ name: string }>

describe('diffSluggedResources', () => {
  it('should identify resources to remove when slug exists only in existing', () => {
    // Setup: existing has 'foo' and 'bar', proposed only has 'bar'
    const existing: SlugAndName[] = [
      { slug: 'foo', name: 'Foo' },
      { slug: 'bar', name: 'Bar' },
    ]
    const proposed: SlugAndName[] = [{ slug: 'bar', name: 'Bar' }]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: 'foo' should be in toRemove
    expect(result.toRemove).toEqual([
      { slug: 'foo', name: 'Foo' },
    ] as any)
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.slug).toBe('bar')
  })

  it('should identify resources to create when slug exists only in proposed', () => {
    // Setup: existing only has 'foo', proposed has 'foo' and 'bar'
    const existing: SlugAndName[] = [{ slug: 'foo', name: 'Foo' }]
    const proposed: SlugAndName[] = [
      { slug: 'foo', name: 'Foo' },
      { slug: 'bar', name: 'Bar' },
    ]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: 'bar' should be in toCreate
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toEqual([
      { slug: 'bar', name: 'Bar' },
    ] as any)
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.slug).toBe('foo')
  })

  it('should identify resources to update when slug exists in both', () => {
    // Setup: both have 'foo' with different names
    const existing: SlugAndName[] = [{ slug: 'foo', name: 'Old' }]
    const proposed: SlugAndName[] = [{ slug: 'foo', name: 'New' }]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: 'foo' should be in toUpdate with both versions
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0]).toEqual({
      existing: { slug: 'foo', name: 'Old' },
      proposed: { slug: 'foo', name: 'New' },
    } as any)
  })

  it('should handle empty existing array', () => {
    // Setup: no existing resources, proposed has 'foo'
    const existing: SlugAndName[] = []
    const proposed: SlugAndName[] = [{ slug: 'foo', name: 'Foo' }]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: 'foo' should be in toCreate
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toEqual([
      { slug: 'foo', name: 'Foo' },
    ] as any)
    expect(result.toUpdate).toEqual([])
  })

  it('should handle empty proposed array', () => {
    // Setup: existing has 'foo', no proposed resources
    const existing: SlugAndName[] = [{ slug: 'foo', name: 'Foo' }]
    const proposed: SlugAndName[] = []

    const result = diffSluggedResources(existing, proposed)

    // Expectation: 'foo' should be in toRemove
    expect(result.toRemove).toEqual([
      { slug: 'foo', name: 'Foo' },
    ] as any)
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toEqual([])
  })

  it('should handle completely different slugs as remove + create', () => {
    // Setup: existing has 'foo', proposed has 'bar'
    const existing: SlugAndName[] = [{ slug: 'foo', name: 'Foo' }]
    const proposed: SlugAndName[] = [{ slug: 'bar', name: 'Bar' }]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: 'foo' in toRemove, 'bar' in toCreate
    expect(result.toRemove).toEqual([
      { slug: 'foo', name: 'Foo' },
    ] as any)
    expect(result.toCreate).toEqual([
      { slug: 'bar', name: 'Bar' },
    ] as any)
    expect(result.toUpdate).toEqual([])
  })

  it('should handle multiple resources with mixed changes', () => {
    // Setup: complex scenario with remove, create, and update
    const existing: SluggedResource<{
      name: string
      active: boolean
    }>[] = [
      { slug: 'remove-me', name: 'Remove', active: true },
      { slug: 'update-me', name: 'Old Name', active: true },
      { slug: 'keep-same', name: 'Same', active: true },
    ]
    const proposed: SluggedResource<{
      name: string
      active: boolean
    }>[] = [
      { slug: 'update-me', name: 'New Name', active: false },
      { slug: 'keep-same', name: 'Same', active: true },
      { slug: 'create-me', name: 'New', active: true },
    ]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: proper categorization of all changes
    expect(result.toRemove).toHaveLength(1)
    expect(result.toRemove[0].slug).toBe('remove-me')

    expect(result.toCreate).toHaveLength(1)
    expect(result.toCreate[0].slug).toBe('create-me')

    expect(result.toUpdate).toHaveLength(2)
    const updateSlugs = result.toUpdate
      .map((u) => u.existing.slug)
      .sort()
    expect(updateSlugs).toEqual(['keep-same', 'update-me'])
  })

  it('should preserve resource properties in diff results', () => {
    // Setup: resources with multiple properties
    type ComplexResource = {
      slug: string
      name: string
      description: string
      active: boolean
      metadata: { foo: string }
    }

    const existing: SluggedResource<ComplexResource>[] = [
      {
        slug: 'test',
        name: 'Test',
        description: 'Old description',
        active: true,
        metadata: { foo: 'bar' },
      },
    ]
    const proposed: SluggedResource<ComplexResource>[] = [
      {
        slug: 'test',
        name: 'Test Updated',
        description: 'New description',
        active: false,
        metadata: { foo: 'baz' },
      },
    ]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: all properties preserved in toUpdate
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing).toEqual(existing[0])
    expect(result.toUpdate[0].proposed).toEqual(proposed[0])
    expect(result.toUpdate[0].proposed.metadata.foo).toBe('baz')
  })

  it('should work with minimal resource type (only slug)', () => {
    // Setup: resources with only slug property
    const existing: SluggedResource<object>[] = [{ slug: 'minimal' }]
    const proposed: SluggedResource<object>[] = [{ slug: 'minimal' }]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: diffing works even with minimal type
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.slug).toBe('minimal')
  })
})

describe('diffFeatures', () => {
  it('should use diffSluggedResources to compute diff', () => {
    // Setup: existing has feature, proposed is empty
    const existing: FeatureDiffInput[] = [
      {
        slug: 'foo',
        name: 'Foo Feature',
        description: 'A test feature',
        type: FeatureType.Toggle,
        active: true,
      },
    ]
    const proposed: FeatureDiffInput[] = []

    const result = diffFeatures(existing, proposed)

    // Expectation: toRemove contains the feature
    expect(result.toRemove).toHaveLength(1)
    expect(result.toRemove[0].slug).toBe('foo')
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toEqual([])
  })

  it('should handle feature updates', () => {
    // Setup: existing and proposed both have same slug but different name
    const existing: FeatureDiffInput[] = [
      {
        slug: 'foo',
        name: 'Old Name',
        description: 'A test feature',
        type: FeatureType.Toggle,
        active: true,
      },
    ]
    const proposed: FeatureDiffInput[] = [
      {
        slug: 'foo',
        name: 'New Name',
        description: 'A test feature',
        type: FeatureType.Toggle,
        active: true,
      },
    ]

    const result = diffFeatures(existing, proposed)

    // Expectation: toUpdate contains the feature with name change
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.name).toBe('Old Name')
    expect(result.toUpdate[0].proposed.name).toBe('New Name')
  })

  it('should handle feature creation', () => {
    // Setup: proposed has new feature not in existing
    const existing: FeatureDiffInput[] = []
    const proposed: FeatureDiffInput[] = [
      {
        slug: 'new-feature',
        name: 'New Feature',
        description: 'A new feature',
        type: FeatureType.Toggle,
        active: true,
      },
    ]

    const result = diffFeatures(existing, proposed)

    // Expectation: toCreate contains the new feature
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toHaveLength(1)
    expect(result.toCreate[0].slug).toBe('new-feature')
    expect(result.toUpdate).toEqual([])
  })

  it('should handle mixed changes for features', () => {
    // Setup: remove one, update one, create one
    const existing: FeatureDiffInput[] = [
      {
        slug: 'remove-me',
        name: 'Remove',
        description: 'Will be removed',
        type: FeatureType.Toggle,
        active: true,
      },
      {
        slug: 'update-me',
        name: 'Old',
        description: 'Will be updated',
        type: FeatureType.Toggle,
        active: true,
      },
    ]
    const proposed: FeatureDiffInput[] = [
      {
        slug: 'update-me',
        name: 'New',
        description: 'Will be updated',
        type: FeatureType.Toggle,
        active: false,
      },
      {
        slug: 'create-me',
        name: 'Create',
        description: 'Will be created',
        type: FeatureType.Toggle,
        active: true,
      },
    ]

    const result = diffFeatures(existing, proposed)

    // Expectations
    expect(result.toRemove).toHaveLength(1)
    expect(result.toRemove[0].slug).toBe('remove-me')
    expect(result.toCreate).toHaveLength(1)
    expect(result.toCreate[0].slug).toBe('create-me')
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.name).toBe('Old')
    expect(result.toUpdate[0].proposed.name).toBe('New')
  })

  // TODO: after validation is implemented, add tests for permitted feature update fields
})

describe('diffUsageMeters', () => {
  it('should use diffSluggedResources to compute diff', () => {
    // Setup: existing has usage meter, proposed is empty
    const existing: UsageMeterDiffInput[] = [
      {
        usageMeter: {
          slug: 'foo',
          name: 'Foo Meter',
          aggregationType: UsageMeterAggregationType.Sum,
        },
      },
    ]
    const proposed: UsageMeterDiffInput[] = []

    const result = diffUsageMeters(existing, proposed)

    // Expectation: toRemove contains the usage meter
    expect(result.toRemove).toHaveLength(1)
    expect(result.toRemove[0].usageMeter.slug).toBe('foo')
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toEqual([])
  })

  it('should handle usage meter updates', () => {
    // Setup: existing and proposed both have same slug but different name
    const existing: UsageMeterDiffInput[] = [
      {
        usageMeter: {
          slug: 'foo',
          name: 'Old Name',
          aggregationType: UsageMeterAggregationType.Sum,
        },
      },
    ]
    const proposed: UsageMeterDiffInput[] = [
      {
        usageMeter: {
          slug: 'foo',
          name: 'New Name',
          aggregationType: UsageMeterAggregationType.Sum,
        },
      },
    ]

    const result = diffUsageMeters(existing, proposed)

    // Expectation: toUpdate contains the usage meter with name change
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.usageMeter.name).toBe(
      'Old Name'
    )
    expect(result.toUpdate[0].proposed.usageMeter.name).toBe(
      'New Name'
    )
  })

  it('should handle usage meter creation', () => {
    // Setup: proposed has new usage meter not in existing
    const existing: UsageMeterDiffInput[] = []
    const proposed: UsageMeterDiffInput[] = [
      {
        usageMeter: {
          slug: 'new-meter',
          name: 'New Meter',
          aggregationType:
            UsageMeterAggregationType.CountDistinctProperties,
        },
      },
    ]

    const result = diffUsageMeters(existing, proposed)

    // Expectation: toCreate contains the new usage meter
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toHaveLength(1)
    expect(result.toCreate[0].usageMeter.slug).toBe('new-meter')
    expect(result.toUpdate).toEqual([])
  })

  it('should handle mixed changes for usage meters', () => {
    // Setup: remove one, update one, create one
    const existing: UsageMeterDiffInput[] = [
      {
        usageMeter: {
          slug: 'remove-me',
          name: 'Remove',
          aggregationType: UsageMeterAggregationType.Sum,
        },
      },
      {
        usageMeter: {
          slug: 'update-me',
          name: 'Old',
          aggregationType: UsageMeterAggregationType.Sum,
        },
      },
    ]
    const proposed: UsageMeterDiffInput[] = [
      {
        usageMeter: {
          slug: 'update-me',
          name: 'New',
          aggregationType:
            UsageMeterAggregationType.CountDistinctProperties,
        },
      },
      {
        usageMeter: {
          slug: 'create-me',
          name: 'Create',
          aggregationType: UsageMeterAggregationType.Sum,
        },
      },
    ]

    const result = diffUsageMeters(existing, proposed)

    // Expectations
    expect(result.toRemove).toHaveLength(1)
    expect(result.toRemove[0].usageMeter.slug).toBe('remove-me')
    expect(result.toCreate).toHaveLength(1)
    expect(result.toCreate[0].usageMeter.slug).toBe('create-me')
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.usageMeter.name).toBe('Old')
    expect(result.toUpdate[0].proposed.usageMeter.name).toBe('New')
  })

  // TODO: after validation is implemented, add tests for permitted usage meter update fields
})

/**
 * Helper function to create a minimal valid ProductDiffInput for testing.
 */
const createProductInput = (
  overrides: Partial<{
    productSlug: string
    productName: string
    priceType: PriceType
    unitPrice: number
    features: string[]
    intervalUnit: IntervalUnit
    intervalCount: number
    active: boolean
    isDefault: boolean
  }> = {}
): ProductDiffInput => {
  const {
    productSlug = 'test-product',
    productName = 'Test Product',
    priceType = PriceType.Subscription,
    unitPrice = 1000,
    features = [],
    intervalUnit = IntervalUnit.Month,
    intervalCount = 1,
    active = true,
    isDefault = true,
  } = overrides

  return {
    product: {
      slug: productSlug,
      name: productName,
      active,
    },
    price: {
      type: priceType,
      unitPrice,
      intervalUnit:
        priceType === PriceType.Subscription
          ? intervalUnit
          : undefined,
      intervalCount:
        priceType === PriceType.Subscription
          ? intervalCount
          : undefined,
      active,
      isDefault,
      slug: `${productSlug}-price`,
    } as ProductDiffInput['price'],
    features,
  }
}

describe('diffProducts', () => {
  it('should identify product to remove', () => {
    // Setup: existing has product, proposed is empty
    const existing: ProductDiffInput[] = [
      createProductInput({
        productSlug: 'foo',
        productName: 'Foo Product',
      }),
    ]
    const proposed: ProductDiffInput[] = []

    const result = diffProducts(existing, proposed)

    // Expectation: toRemove contains the product
    expect(result.toRemove).toHaveLength(1)
    expect(result.toRemove[0].product.slug).toBe('foo')
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toEqual([])
  })

  it('should identify product to create', () => {
    // Setup: existing is empty, proposed has product
    const existing: ProductDiffInput[] = []
    const proposed: ProductDiffInput[] = [
      createProductInput({
        productSlug: 'foo',
        productName: 'Foo Product',
      }),
    ]

    const result = diffProducts(existing, proposed)

    // Expectation: toCreate contains the product
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toHaveLength(1)
    expect(result.toCreate[0].product.slug).toBe('foo')
    expect(result.toUpdate).toEqual([])
  })

  it('should identify product to update when name changes', () => {
    // Setup: existing and proposed have same slug but different names
    const existing: ProductDiffInput[] = [
      createProductInput({
        productSlug: 'foo',
        productName: 'Old Name',
      }),
    ]
    const proposed: ProductDiffInput[] = [
      createProductInput({
        productSlug: 'foo',
        productName: 'New Name',
      }),
    ]

    const result = diffProducts(existing, proposed)

    // Expectation: toUpdate contains the product with name change
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.product.name).toBe('Old Name')
    expect(result.toUpdate[0].proposed.product.name).toBe('New Name')
  })

  it('should include priceDiff when both products have prices with different unitPrice', () => {
    // Setup: same product slug, different unit prices
    const existing: ProductDiffInput[] = [
      createProductInput({
        productSlug: 'foo',
        productName: 'Foo',
        unitPrice: 1000,
      }),
    ]
    const proposed: ProductDiffInput[] = [
      createProductInput({
        productSlug: 'foo',
        productName: 'Foo',
        unitPrice: 2000,
      }),
    ]

    const result = diffProducts(existing, proposed)

    // Expectation: toUpdate contains product with priceDiff
    expect(result.toUpdate).toHaveLength(1)
    expect(
      result.toUpdate[0].priceDiff?.existingPrice?.unitPrice
    ).toBe(1000)
    expect(
      result.toUpdate[0].priceDiff?.proposedPrice?.unitPrice
    ).toBe(2000)
  })

  it('should not include priceDiff when prices are identical', () => {
    // Setup: same product slug, same prices, different product name
    const existing: ProductDiffInput[] = [
      createProductInput({
        productSlug: 'foo',
        productName: 'Old Name',
        unitPrice: 1000,
      }),
    ]
    const proposed: ProductDiffInput[] = [
      createProductInput({
        productSlug: 'foo',
        productName: 'New Name',
        unitPrice: 1000,
      }),
    ]

    const result = diffProducts(existing, proposed)

    // Expectation: toUpdate contains product but no priceDiff (prices are same)
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.product.name).toBe('Old Name')
    expect(result.toUpdate[0].proposed.product.name).toBe('New Name')
    expect(result.toUpdate[0].priceDiff).toBeUndefined()
  })

  it('should handle mixed changes for products', () => {
    // Setup: remove one, create one, update one
    const existing: ProductDiffInput[] = [
      createProductInput({
        productSlug: 'remove-me',
        productName: 'Remove',
      }),
      createProductInput({
        productSlug: 'update-me',
        productName: 'Old',
        unitPrice: 1000,
      }),
    ]
    const proposed: ProductDiffInput[] = [
      createProductInput({
        productSlug: 'update-me',
        productName: 'New',
        unitPrice: 2000,
      }),
      createProductInput({
        productSlug: 'create-me',
        productName: 'Create',
      }),
    ]

    const result = diffProducts(existing, proposed)

    // Expectations
    expect(result.toRemove).toHaveLength(1)
    expect(result.toRemove[0].product.slug).toBe('remove-me')

    expect(result.toCreate).toHaveLength(1)
    expect(result.toCreate[0].product.slug).toBe('create-me')

    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.product.name).toBe('Old')
    expect(result.toUpdate[0].proposed.product.name).toBe('New')
    expect(
      result.toUpdate[0].priceDiff?.existingPrice?.unitPrice
    ).toBe(1000)
    expect(
      result.toUpdate[0].priceDiff?.proposedPrice?.unitPrice
    ).toBe(2000)
  })

  it('should include priceDiff when price type changes', () => {
    // Setup: same product slug, different price types
    const existingProduct = createProductInput({
      productSlug: 'foo',
      productName: 'Foo',
      priceType: PriceType.Subscription,
      unitPrice: 1000,
    })
    const proposedProduct = createProductInput({
      productSlug: 'foo',
      productName: 'Foo',
      priceType: PriceType.SinglePayment,
      unitPrice: 1000,
    })

    const existing: ProductDiffInput[] = [existingProduct]
    const proposed: ProductDiffInput[] = [proposedProduct]

    const result = diffProducts(existing, proposed)

    // Expectation: priceDiff should show the type change
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].priceDiff?.existingPrice?.type).toBe(
      PriceType.Subscription
    )
    expect(result.toUpdate[0].priceDiff?.proposedPrice?.type).toBe(
      PriceType.SinglePayment
    )
  })

  it('should not include priceDiff when only features change and prices are identical', () => {
    // Setup: same product slug and price, different features
    const existing: ProductDiffInput[] = [
      createProductInput({
        productSlug: 'foo',
        productName: 'Foo',
        unitPrice: 1000,
        features: ['feature-a'],
      }),
    ]
    const proposed: ProductDiffInput[] = [
      createProductInput({
        productSlug: 'foo',
        productName: 'Foo',
        unitPrice: 1000,
        features: ['feature-a', 'feature-b'],
      }),
    ]

    const result = diffProducts(existing, proposed)

    // Expectation: toUpdate should have entry (features changed), but no priceDiff (prices same)
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.features).toEqual([
      'feature-a',
    ])
    expect(result.toUpdate[0].proposed.features).toEqual([
      'feature-a',
      'feature-b',
    ])
    // Price didn't change
    expect(result.toUpdate[0].priceDiff).toBeUndefined()
  })

  it('should handle empty arrays', () => {
    // Setup: both arrays are empty
    const existing: ProductDiffInput[] = []
    const proposed: ProductDiffInput[] = []

    const result = diffProducts(existing, proposed)

    // Expectation: all arrays should be empty
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toEqual([])
  })

  it('should handle completely different products as remove + create', () => {
    // Setup: existing has 'foo', proposed has 'bar'
    const existing: ProductDiffInput[] = [
      createProductInput({ productSlug: 'foo', productName: 'Foo' }),
    ]
    const proposed: ProductDiffInput[] = [
      createProductInput({ productSlug: 'bar', productName: 'Bar' }),
    ]

    const result = diffProducts(existing, proposed)

    // Expectation: 'foo' in toRemove, 'bar' in toCreate
    expect(result.toRemove).toHaveLength(1)
    expect(result.toRemove[0].product.slug).toBe('foo')
    expect(result.toCreate).toHaveLength(1)
    expect(result.toCreate[0].product.slug).toBe('bar')
    expect(result.toUpdate).toEqual([])
  })

  it('should preserve all product properties in diff results', () => {
    // Setup: product with all properties
    const existingProduct = createProductInput({
      productSlug: 'test',
      productName: 'Test',
      unitPrice: 1000,
      features: ['feature-a', 'feature-b'],
    })
    const proposedProduct = createProductInput({
      productSlug: 'test',
      productName: 'Test Updated',
      unitPrice: 2000,
      features: ['feature-a', 'feature-c'],
    })

    const existing: ProductDiffInput[] = [existingProduct]
    const proposed: ProductDiffInput[] = [proposedProduct]

    const result = diffProducts(existing, proposed)

    // Expectation: all properties preserved in toUpdate
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.product).toEqual(
      existingProduct.product
    )
    expect(result.toUpdate[0].proposed.product).toEqual(
      proposedProduct.product
    )
    expect(result.toUpdate[0].existing.features).toEqual(
      existingProduct.features
    )
    expect(result.toUpdate[0].proposed.features).toEqual(
      proposedProduct.features
    )
    expect(result.toUpdate[0].priceDiff?.existingPrice).toEqual(
      existingProduct.price
    )
    expect(result.toUpdate[0].priceDiff?.proposedPrice).toEqual(
      proposedProduct.price
    )
  })
})

describe('computeUpdateObject', () => {
  it('should return only changed fields', () => {
    const existing = { slug: 'foo', name: 'Old', active: true }
    const proposed = { slug: 'foo', name: 'New', active: true }

    const result = computeUpdateObject(existing, proposed)

    expect(result).toEqual({ name: 'New' })
  })

  it('should return empty object when nothing changed', () => {
    const existing = { slug: 'foo', name: 'Same', active: true }
    const proposed = { slug: 'foo', name: 'Same', active: true }

    const result = computeUpdateObject(existing, proposed)

    expect(result).toEqual({})
  })

  it('should detect changes in nested objects', () => {
    const existing = {
      slug: 'foo',
      metadata: { key: 'old' },
    }
    const proposed = {
      slug: 'foo',
      metadata: { key: 'new' },
    }

    const result = computeUpdateObject(existing, proposed)

    expect(result).toEqual({ metadata: { key: 'new' } })
  })

  it('should detect new fields in proposed', () => {
    const existing = { slug: 'foo', name: 'Test' }
    const proposed = {
      slug: 'foo',
      name: 'Test',
      description: 'New field',
    }

    const result = computeUpdateObject(
      existing as Record<string, unknown>,
      proposed as Record<string, unknown>
    )

    expect(result).toEqual({ description: 'New field' })
  })

  it('should detect removed fields (undefined in proposed)', () => {
    const existing = { slug: 'foo', name: 'Test', description: 'Old' }
    const proposed = { slug: 'foo', name: 'Test' }

    const result = computeUpdateObject(
      existing as Record<string, unknown>,
      proposed as Record<string, unknown>
    )

    expect(result).toEqual({ description: undefined })
  })

  it('should handle multiple field changes', () => {
    const existing = {
      slug: 'foo',
      name: 'Old',
      active: true,
      count: 5,
    }
    const proposed = {
      slug: 'foo',
      name: 'New',
      active: false,
      count: 5,
    }

    const result = computeUpdateObject(existing, proposed)

    expect(result).toEqual({ name: 'New', active: false })
  })
})

describe('validateUsageMeterDiff', () => {
  it('should throw error when toRemove is non-empty', () => {
    const diff: UsageMeterDiffResult = {
      toRemove: [
        {
          usageMeter: {
            slug: 'api-calls',
            name: 'API Calls',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
      ],
      toCreate: [],
      toUpdate: [],
    }

    {
      const result = validateUsageMeterDiff(diff)
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Usage meters cannot be removed. Attempted to remove: api-calls'
        )
      }
    }
  })

  it('should throw error when multiple usage meters are removed', () => {
    const diff: UsageMeterDiffResult = {
      toRemove: [
        {
          usageMeter: {
            slug: 'api-calls',
            name: 'API Calls',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
        {
          usageMeter: {
            slug: 'storage',
            name: 'Storage',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
      ],
      toCreate: [],
      toUpdate: [],
    }

    {
      const result = validateUsageMeterDiff(diff)
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Usage meters cannot be removed. Attempted to remove: api-calls, storage'
        )
      }
    }
  })

  it('should allow updates to name and aggregationType', () => {
    const diff: UsageMeterDiffResult = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          existing: {
            usageMeter: {
              slug: 'api-calls',
              name: 'Old Name',
              aggregationType: UsageMeterAggregationType.Sum,
            },
          },
          proposed: {
            usageMeter: {
              slug: 'api-calls',
              name: 'New Name',
              aggregationType:
                UsageMeterAggregationType.CountDistinctProperties,
            },
          },
          priceDiff: { toRemove: [], toCreate: [], toUpdate: [] },
        },
      ],
    }

    // Should not throw
    expect(Result.isOk(validateUsageMeterDiff(diff))).toBe(true)
  })

  it('should pass when nothing is being updated', () => {
    const diff: UsageMeterDiffResult = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          existing: {
            usageMeter: {
              slug: 'api-calls',
              name: 'API Calls',
              aggregationType: UsageMeterAggregationType.Sum,
            },
          },
          proposed: {
            usageMeter: {
              slug: 'api-calls',
              name: 'API Calls',
              aggregationType: UsageMeterAggregationType.Sum,
            },
          },
          priceDiff: { toRemove: [], toCreate: [], toUpdate: [] },
        },
      ],
    }

    expect(Result.isOk(validateUsageMeterDiff(diff))).toBe(true)
  })

  it('should allow creating new usage meters', () => {
    const diff: UsageMeterDiffResult = {
      toRemove: [],
      toCreate: [
        {
          usageMeter: {
            slug: 'new-meter',
            name: 'New Meter',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
      ],
      toUpdate: [],
    }

    expect(Result.isOk(validateUsageMeterDiff(diff))).toBe(true)
  })
})

/**
 * Helper function to create a minimal valid usage price for testing.
 */
const createUsagePrice = (
  overrides: Partial<{
    unitPrice: number
    usageEventsPerUnit: number
    isDefault: boolean
    active: boolean
    slug: string
    name: string
    currency: CurrencyCode
    intervalUnit: IntervalUnit
    intervalCount: number
  }> = {}
): SetupUsageMeterPriceInput => {
  const {
    unitPrice = 100,
    usageEventsPerUnit = 1,
    isDefault = true,
    active = true,
    slug = 'usage-price',
    name,
    currency = CurrencyCode.USD,
    intervalUnit = IntervalUnit.Month,
    intervalCount = 1,
  } = overrides

  return {
    type: PriceType.Usage,
    unitPrice,
    usageEventsPerUnit,
    isDefault,
    active,
    slug,
    currency,
    intervalUnit,
    intervalCount,
    ...(name !== undefined && { name }),
  } as SetupUsageMeterPriceInput
}

describe('diffUsageMeterPrices', () => {
  it('identifies prices to remove when slug exists only in existing, prices to create when slug exists only in proposed, and prices to update when slug exists in both', () => {
    const existingPrices: SetupUsageMeterPriceInput[] = [
      createUsagePrice({ slug: 'remove-me', unitPrice: 100 }),
      createUsagePrice({ slug: 'update-me', unitPrice: 200 }),
    ]
    const proposedPrices: SetupUsageMeterPriceInput[] = [
      createUsagePrice({ slug: 'update-me', unitPrice: 300 }),
      createUsagePrice({ slug: 'create-me', unitPrice: 400 }),
    ]

    const result = diffUsageMeterPrices(
      existingPrices,
      proposedPrices,
      'test-meter'
    )

    expect(result.toRemove).toHaveLength(1)
    expect(result.toRemove[0].slug).toBe('remove-me')
    expect(result.toCreate).toHaveLength(1)
    expect(result.toCreate[0].slug).toBe('create-me')
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.slug).toBe('update-me')
    expect(result.toUpdate[0].existing.unitPrice).toBe(200)
    expect(result.toUpdate[0].proposed.unitPrice).toBe(300)
  })

  it('returns empty diff arrays when both inputs are undefined', () => {
    const result = diffUsageMeterPrices(
      undefined,
      undefined,
      'test-meter'
    )
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toEqual([])
  })

  it('returns empty diff arrays when both inputs are empty arrays', () => {
    const result = diffUsageMeterPrices([], [], 'test-meter')
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toEqual([])
  })

  it('identifies prices to create when existing is undefined', () => {
    const result = diffUsageMeterPrices(
      undefined,
      [createUsagePrice({ slug: 'new-price' })],
      'test-meter'
    )
    expect(result.toCreate).toHaveLength(1)
    expect(result.toCreate[0].slug).toBe('new-price')
    expect(result.toRemove).toEqual([])
    expect(result.toUpdate).toEqual([])
  })

  it('identifies prices to remove when proposed is undefined', () => {
    const result = diffUsageMeterPrices(
      [createUsagePrice({ slug: 'old-price' })],
      undefined,
      'test-meter'
    )
    expect(result.toRemove).toHaveLength(1)
    expect(result.toRemove[0].slug).toBe('old-price')
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toEqual([])
  })
})

describe('diffUsageMeters with prices', () => {
  it('includes priceDiff in toUpdate when usage meter prices differ', () => {
    const existing: UsageMeterDiffInput[] = [
      {
        usageMeter: {
          slug: 'api-calls',
          name: 'API Calls',
          aggregationType: UsageMeterAggregationType.Sum,
        },
        prices: [
          createUsagePrice({ slug: 'old-price', unitPrice: 100 }),
        ],
      },
    ]
    const proposed: UsageMeterDiffInput[] = [
      {
        usageMeter: {
          slug: 'api-calls',
          name: 'API Calls',
          aggregationType: UsageMeterAggregationType.Sum,
        },
        prices: [
          createUsagePrice({ slug: 'old-price', unitPrice: 200 }),
        ],
      },
    ]

    const result = diffUsageMeters(existing, proposed)

    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].priceDiff?.toUpdate).toHaveLength(1)
    expect(
      result.toUpdate[0].priceDiff.toUpdate[0].existing.unitPrice
    ).toBe(100)
    expect(
      result.toUpdate[0].priceDiff.toUpdate[0].proposed.unitPrice
    ).toBe(200)
  })

  it('includes priceDiff with toCreate when new price is added to usage meter', () => {
    const existing: UsageMeterDiffInput[] = [
      {
        usageMeter: {
          slug: 'api-calls',
          name: 'API Calls',
          aggregationType: UsageMeterAggregationType.Sum,
        },
        prices: [],
      },
    ]
    const proposed: UsageMeterDiffInput[] = [
      {
        usageMeter: {
          slug: 'api-calls',
          name: 'API Calls',
          aggregationType: UsageMeterAggregationType.Sum,
        },
        prices: [
          createUsagePrice({ slug: 'new-price', unitPrice: 100 }),
        ],
      },
    ]

    const result = diffUsageMeters(existing, proposed)

    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].priceDiff.toCreate).toHaveLength(1)
    expect(result.toUpdate[0].priceDiff.toCreate[0].slug).toBe(
      'new-price'
    )
    expect(result.toUpdate[0].priceDiff.toRemove).toEqual([])
    expect(result.toUpdate[0].priceDiff.toUpdate).toEqual([])
  })

  it('includes priceDiff with toRemove when price is removed from usage meter', () => {
    const existing: UsageMeterDiffInput[] = [
      {
        usageMeter: {
          slug: 'api-calls',
          name: 'API Calls',
          aggregationType: UsageMeterAggregationType.Sum,
        },
        prices: [
          createUsagePrice({ slug: 'old-price', unitPrice: 100 }),
        ],
      },
    ]
    const proposed: UsageMeterDiffInput[] = [
      {
        usageMeter: {
          slug: 'api-calls',
          name: 'API Calls',
          aggregationType: UsageMeterAggregationType.Sum,
        },
        prices: [],
      },
    ]

    const result = diffUsageMeters(existing, proposed)

    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].priceDiff.toRemove).toHaveLength(1)
    expect(result.toUpdate[0].priceDiff.toRemove[0].slug).toBe(
      'old-price'
    )
    expect(result.toUpdate[0].priceDiff.toCreate).toEqual([])
    expect(result.toUpdate[0].priceDiff.toUpdate).toEqual([])
  })

  it('includes priceDiff with unchanged price in toUpdate when usage meter name changes but prices stay the same', () => {
    const price = createUsagePrice({
      slug: 'same-price',
      unitPrice: 100,
    })
    const existing: UsageMeterDiffInput[] = [
      {
        usageMeter: {
          slug: 'api-calls',
          name: 'Old Name',
          aggregationType: UsageMeterAggregationType.Sum,
        },
        prices: [price],
      },
    ]
    const proposed: UsageMeterDiffInput[] = [
      {
        usageMeter: {
          slug: 'api-calls',
          name: 'New Name',
          aggregationType: UsageMeterAggregationType.Sum,
        },
        prices: [price],
      },
    ]

    const result = diffUsageMeters(existing, proposed)

    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.usageMeter.name).toBe(
      'Old Name'
    )
    expect(result.toUpdate[0].proposed.usageMeter.name).toBe(
      'New Name'
    )
    expect(result.toUpdate[0].priceDiff.toRemove).toEqual([])
    expect(result.toUpdate[0].priceDiff.toCreate).toEqual([])
    expect(result.toUpdate[0].priceDiff.toUpdate).toHaveLength(1)
  })
})

describe('validateUsagePriceChange', () => {
  const baseUsagePrice = createUsagePrice({
    slug: 'test-price',
    unitPrice: 100,
    usageEventsPerUnit: 1,
  })

  it('returns without error when both prices are undefined', () => {
    expect(
      Result.isOk(
        validateUsagePriceChange(undefined, undefined, 'meter-slug')
      )
    ).toBe(true)
  })

  it('returns without error when creating a new price (existing undefined)', () => {
    expect(
      Result.isOk(
        validateUsagePriceChange(
          undefined,
          baseUsagePrice,
          'meter-slug'
        )
      )
    ).toBe(true)
  })

  it('returns without error when removing a price (proposed undefined)', () => {
    expect(
      Result.isOk(
        validateUsagePriceChange(
          baseUsagePrice,
          undefined,
          'meter-slug'
        )
      )
    ).toBe(true)
  })

  it('returns without error when prices are identical', () => {
    expect(
      Result.isOk(
        validateUsagePriceChange(
          baseUsagePrice,
          baseUsagePrice,
          'meter-slug'
        )
      )
    ).toBe(true)
  })

  it('allows mutable field changes (name, active, isDefault) without triggering price replacement validation', () => {
    const priceWithNewName = createUsagePrice({
      slug: 'test-price',
      unitPrice: 100,
      usageEventsPerUnit: 1,
      name: 'New Price Name',
    })
    expect(
      Result.isOk(
        validateUsagePriceChange(
          baseUsagePrice,
          priceWithNewName,
          'meter-slug'
        )
      )
    ).toBe(true)

    const priceWithNewActiveStatus = createUsagePrice({
      slug: 'test-price',
      unitPrice: 100,
      usageEventsPerUnit: 1,
      active: false,
    })
    expect(
      Result.isOk(
        validateUsagePriceChange(
          baseUsagePrice,
          priceWithNewActiveStatus,
          'meter-slug'
        )
      )
    ).toBe(true)
  })

  it('allows create-only field changes (unitPrice, usageEventsPerUnit) for usage price when proposed price is well-formed, treating them as price replacements', () => {
    // Changing unitPrice
    const priceWithNewUnitPrice = createUsagePrice({
      slug: 'test-price',
      unitPrice: 200,
      usageEventsPerUnit: 1,
    })
    expect(
      Result.isOk(
        validateUsagePriceChange(
          baseUsagePrice,
          priceWithNewUnitPrice,
          'meter-slug'
        )
      )
    ).toBe(true)

    // Changing usageEventsPerUnit
    const priceWithNewUsageEventsPerUnit = createUsagePrice({
      slug: 'test-price',
      unitPrice: 100,
      usageEventsPerUnit: 10,
    })
    expect(
      Result.isOk(
        validateUsagePriceChange(
          baseUsagePrice,
          priceWithNewUsageEventsPerUnit,
          'meter-slug'
        )
      )
    ).toBe(true)

    // Changing multiple create-only fields at once
    const priceWithMultipleChanges = createUsagePrice({
      slug: 'test-price',
      unitPrice: 500,
      usageEventsPerUnit: 5,
    })
    expect(
      Result.isOk(
        validateUsagePriceChange(
          baseUsagePrice,
          priceWithMultipleChanges,
          'meter-slug'
        )
      )
    ).toBe(true)
  })

  it('throws error when create-only fields change but proposed price is malformed (missing required fields)', () => {
    const malformedPrice = {
      type: PriceType.Usage,
      unitPrice: 200,
      // missing usageEventsPerUnit and other required fields
      isDefault: true,
      active: true,
      slug: 'test-price',
    } as SetupUsageMeterPriceInput

    {
      const result = validateUsagePriceChange(
        baseUsagePrice,
        malformedPrice,
        'meter-slug'
      )
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Invalid usage price for replacement'
        )
      }
    }
  })
})

describe('validateUsageMeterDiff with price changes', () => {
  it('validates usage price updates and allows mutable field changes', () => {
    const diff: UsageMeterDiffResult = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          existing: {
            usageMeter: {
              slug: 'api-calls',
              name: 'API Calls',
              aggregationType: UsageMeterAggregationType.Sum,
            },
            prices: [
              createUsagePrice({ slug: 'price-1', unitPrice: 100 }),
            ],
          },
          proposed: {
            usageMeter: {
              slug: 'api-calls',
              name: 'API Calls',
              aggregationType: UsageMeterAggregationType.Sum,
            },
            prices: [
              createUsagePrice({
                slug: 'price-1',
                unitPrice: 100,
                name: 'New Name',
              }),
            ],
          },
          priceDiff: {
            toRemove: [],
            toCreate: [],
            toUpdate: [
              {
                existing: createUsagePrice({
                  slug: 'price-1',
                  unitPrice: 100,
                }),
                proposed: createUsagePrice({
                  slug: 'price-1',
                  unitPrice: 100,
                  name: 'New Name',
                }),
              },
            ],
          },
        },
      ],
    }

    expect(Result.isOk(validateUsageMeterDiff(diff))).toBe(true)
  })

  it('validates usage price updates and allows create-only field changes (unitPrice) treating them as price replacements', () => {
    const diff: UsageMeterDiffResult = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          existing: {
            usageMeter: {
              slug: 'api-calls',
              name: 'API Calls',
              aggregationType: UsageMeterAggregationType.Sum,
            },
            prices: [
              createUsagePrice({ slug: 'price-1', unitPrice: 100 }),
            ],
          },
          proposed: {
            usageMeter: {
              slug: 'api-calls',
              name: 'API Calls',
              aggregationType: UsageMeterAggregationType.Sum,
            },
            prices: [
              createUsagePrice({ slug: 'price-1', unitPrice: 200 }),
            ],
          },
          priceDiff: {
            toRemove: [],
            toCreate: [],
            toUpdate: [
              {
                existing: createUsagePrice({
                  slug: 'price-1',
                  unitPrice: 100,
                }),
                proposed: createUsagePrice({
                  slug: 'price-1',
                  unitPrice: 200,
                }),
              },
            ],
          },
        },
      ],
    }

    expect(Result.isOk(validateUsageMeterDiff(diff))).toBe(true)
  })

  it('throws error when usage price replacement has malformed proposed price', () => {
    const malformedPrice = {
      type: PriceType.Usage,
      unitPrice: 200,
      // missing usageEventsPerUnit and other required fields
      isDefault: true,
      active: true,
      slug: 'price-1',
    } as SetupUsageMeterPriceInput

    const diff: UsageMeterDiffResult = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          existing: {
            usageMeter: {
              slug: 'api-calls',
              name: 'API Calls',
              aggregationType: UsageMeterAggregationType.Sum,
            },
            prices: [
              createUsagePrice({ slug: 'price-1', unitPrice: 100 }),
            ],
          },
          proposed: {
            usageMeter: {
              slug: 'api-calls',
              name: 'API Calls',
              aggregationType: UsageMeterAggregationType.Sum,
            },
            prices: [malformedPrice],
          },
          priceDiff: {
            toRemove: [],
            toCreate: [],
            toUpdate: [
              {
                existing: createUsagePrice({
                  slug: 'price-1',
                  unitPrice: 100,
                }),
                proposed: malformedPrice,
              },
            ],
          },
        },
      ],
    }

    {
      const result = validateUsageMeterDiff(diff)
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Invalid usage price for replacement'
        )
      }
    }
  })
})

describe('validateFeatureDiff', () => {
  it('should throw error when trying to change type in update', () => {
    const diff: DiffResult<FeatureDiffInput> = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          existing: {
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A test feature',
            type: FeatureType.Toggle,
            active: true,
          },
          proposed: {
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A test feature',
            type: FeatureType.UsageCreditGrant,
            active: true,
            amount: 100,
            usageMeterSlug: 'api-calls',
            renewalFrequency:
              FeatureUsageGrantFrequency.EveryBillingPeriod,
          },
        },
      ],
    }

    {
      const result = validateFeatureDiff(diff)
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Feature type cannot be changed'
        )
      }
    }
  })

  it('should allow updates to mutable fields for Toggle features', () => {
    const diff: DiffResult<FeatureDiffInput> = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          existing: {
            slug: 'feature-a',
            name: 'Old Name',
            description: 'Old description',
            type: FeatureType.Toggle,
            active: true,
          },
          proposed: {
            slug: 'feature-a',
            name: 'New Name',
            description: 'New description',
            type: FeatureType.Toggle,
            active: false,
          },
        },
      ],
    }

    expect(Result.isOk(validateFeatureDiff(diff))).toBe(true)
  })

  it('should allow updates to mutable fields for UsageCreditGrant features', () => {
    const diff: DiffResult<FeatureDiffInput> = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          existing: {
            slug: 'credits',
            name: 'Old Name',
            description: 'Old description',
            type: FeatureType.UsageCreditGrant,
            active: true,
            amount: 100,
            usageMeterSlug: 'api-calls',
            renewalFrequency:
              FeatureUsageGrantFrequency.EveryBillingPeriod,
          },
          proposed: {
            slug: 'credits',
            name: 'New Name',
            description: 'New description',
            type: FeatureType.UsageCreditGrant,
            active: false,
            amount: 200,
            usageMeterSlug: 'api-calls',
            renewalFrequency:
              FeatureUsageGrantFrequency.EveryBillingPeriod,
          },
        },
      ],
    }

    expect(Result.isOk(validateFeatureDiff(diff))).toBe(true)
  })

  it('should allow updates to usageMeterSlug (maps to usageMeterId which is updatable)', () => {
    const diff: DiffResult<FeatureDiffInput> = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          existing: {
            slug: 'credits',
            name: 'Credits',
            description: 'Credit grant',
            type: FeatureType.UsageCreditGrant,
            active: true,
            amount: 100,
            usageMeterSlug: 'old-meter',
            renewalFrequency:
              FeatureUsageGrantFrequency.EveryBillingPeriod,
          },
          proposed: {
            slug: 'credits',
            name: 'Credits',
            description: 'Credit grant',
            type: FeatureType.UsageCreditGrant,
            active: true,
            amount: 100,
            usageMeterSlug: 'new-meter',
            renewalFrequency:
              FeatureUsageGrantFrequency.EveryBillingPeriod,
          },
        },
      ],
    }

    // usageMeterSlug maps to usageMeterId which IS in the update schema (updatable)
    expect(Result.isOk(validateFeatureDiff(diff))).toBe(true)
  })

  it('should pass when nothing is being updated', () => {
    const diff: DiffResult<FeatureDiffInput> = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          existing: {
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A test feature',
            type: FeatureType.Toggle,
            active: true,
          },
          proposed: {
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A test feature',
            type: FeatureType.Toggle,
            active: true,
          },
        },
      ],
    }

    expect(Result.isOk(validateFeatureDiff(diff))).toBe(true)
  })

  it('should allow feature removal', () => {
    const diff: DiffResult<FeatureDiffInput> = {
      toRemove: [
        {
          slug: 'feature-a',
          name: 'Feature A',
          description: 'A test feature',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      toCreate: [],
      toUpdate: [],
    }

    expect(Result.isOk(validateFeatureDiff(diff))).toBe(true)
  })

  it('should allow feature creation', () => {
    const diff: DiffResult<FeatureDiffInput> = {
      toRemove: [],
      toCreate: [
        {
          slug: 'new-feature',
          name: 'New Feature',
          description: 'A new feature',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      toUpdate: [],
    }

    expect(Result.isOk(validateFeatureDiff(diff))).toBe(true)
  })
})

/**
 * Helper function to create test prices for validation tests.
 * Product prices can only be Subscription or SinglePayment.
 * Usage prices now belong to usage meters, not products.
 */
const createTestPrice = (
  overrides: Partial<{
    type: PriceType.Subscription | PriceType.SinglePayment
    unitPrice: number
    intervalUnit: IntervalUnit
    intervalCount: number
    isDefault: boolean
    active: boolean
    slug: string
    name: string
    currency: CurrencyCode
  }> = {}
): SetupPricingModelProductPriceInput => {
  const {
    type = PriceType.Subscription,
    unitPrice = 1000,
    intervalUnit = IntervalUnit.Month,
    intervalCount = 1,
    isDefault = true,
    active = true,
    slug = 'test-price',
    name,
    currency = CurrencyCode.USD,
  } = overrides

  const basePrice = {
    unitPrice,
    isDefault,
    active,
    slug,
    currency,
    ...(name !== undefined && { name }),
  }

  if (type === PriceType.Subscription) {
    return {
      ...basePrice,
      type: PriceType.Subscription,
      intervalUnit,
      intervalCount,
    } as SetupPricingModelProductPriceInput
  }

  // SinglePayment
  return {
    ...basePrice,
    type: PriceType.SinglePayment,
  } as SetupPricingModelProductPriceInput
}

describe('validatePriceChange', () => {
  const baseSubscriptionPrice = createTestPrice({
    type: PriceType.Subscription,
    unitPrice: 1000,
    currency: CurrencyCode.USD,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    slug: 'monthly-price',
  })

  const baseSinglePaymentPrice = createTestPrice({
    type: PriceType.SinglePayment,
    unitPrice: 5000,
    currency: CurrencyCode.USD,
    slug: 'one-time-price',
  })

  it('returns without error when both prices are undefined', () => {
    expect(
      Result.isOk(validatePriceChange(undefined, undefined))
    ).toBe(true)
  })

  it('returns without error when creating a new price (existing undefined)', () => {
    expect(
      Result.isOk(
        validatePriceChange(undefined, baseSubscriptionPrice)
      )
    ).toBe(true)
  })

  it('returns without error when removing a price (proposed undefined)', () => {
    expect(
      Result.isOk(
        validatePriceChange(baseSubscriptionPrice, undefined)
      )
    ).toBe(true)
  })

  it('returns without error when prices are identical', () => {
    expect(
      Result.isOk(
        validatePriceChange(
          baseSubscriptionPrice,
          baseSubscriptionPrice
        )
      )
    ).toBe(true)
  })

  it('throws error when price type changes from subscription to single_payment', () => {
    {
      const result = validatePriceChange(
        baseSubscriptionPrice,
        baseSinglePaymentPrice
      )
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Price type cannot be changed'
        )
      }
    }
  })

  it('allows create-only field changes (unitPrice, intervalCount, intervalUnit) for subscription price when proposed price is well-formed, treating them as price replacements', () => {
    // Changing unitPrice
    const priceWithNewUnitPrice = createTestPrice({
      type: PriceType.Subscription,
      unitPrice: 2000,
      currency: CurrencyCode.USD,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      slug: 'monthly-price',
    })
    expect(
      Result.isOk(
        validatePriceChange(
          baseSubscriptionPrice,
          priceWithNewUnitPrice
        )
      )
    ).toBe(true)

    // Changing intervalCount
    const priceWithNewIntervalCount = createTestPrice({
      type: PriceType.Subscription,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 2,
      slug: 'monthly-price',
    })
    expect(
      Result.isOk(
        validatePriceChange(
          baseSubscriptionPrice,
          priceWithNewIntervalCount
        )
      )
    ).toBe(true)

    // Changing intervalUnit
    const priceWithNewIntervalUnit = createTestPrice({
      type: PriceType.Subscription,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      intervalUnit: IntervalUnit.Year,
      intervalCount: 1,
      slug: 'monthly-price',
    })
    expect(
      Result.isOk(
        validatePriceChange(
          baseSubscriptionPrice,
          priceWithNewIntervalUnit
        )
      )
    ).toBe(true)

    // Changing multiple create-only fields at once
    const priceWithMultipleChanges = createTestPrice({
      type: PriceType.Subscription,
      unitPrice: 5000,
      currency: CurrencyCode.USD,
      intervalUnit: IntervalUnit.Year,
      intervalCount: 1,
      slug: 'monthly-price',
    })
    expect(
      Result.isOk(
        validatePriceChange(
          baseSubscriptionPrice,
          priceWithMultipleChanges
        )
      )
    ).toBe(true)
  })

  it('allows updates to mutable fields (name, active, isDefault) without triggering price replacement validation', () => {
    // Changing name
    const priceWithNewName = createTestPrice({
      type: PriceType.Subscription,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      slug: 'monthly-price',
      name: 'New Price Name',
    })
    expect(
      Result.isOk(
        validatePriceChange(baseSubscriptionPrice, priceWithNewName)
      )
    ).toBe(true)

    // Changing active status
    const priceWithNewActiveStatus = createTestPrice({
      type: PriceType.Subscription,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      slug: 'monthly-price',
      active: false,
    })
    expect(
      Result.isOk(
        validatePriceChange(
          baseSubscriptionPrice,
          priceWithNewActiveStatus
        )
      )
    ).toBe(true)
  })

  // Note: Usage price tests removed - Usage prices belong to usage meters, not products

  it('throws error when create-only fields change but proposed price is malformed (missing required fields)', () => {
    // Create a malformed subscription price missing intervalUnit
    const malformedPrice = {
      type: PriceType.Subscription,
      unitPrice: 2000,
      currency: CurrencyCode.USD,
      // missing intervalUnit and intervalCount
      isDefault: true,
      active: true,
      slug: 'monthly-price',
    } as SetupPricingModelProductPriceInput

    {
      const result = validatePriceChange(
        baseSubscriptionPrice,
        malformedPrice
      )
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Invalid price for replacement'
        )
      }
    }
  })

  it('allows single payment price create-only field changes when proposed price is well-formed', () => {
    const existingSinglePayment = createTestPrice({
      type: PriceType.SinglePayment,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      slug: 'one-time-price',
    })

    const proposedSinglePayment = createTestPrice({
      type: PriceType.SinglePayment,
      unitPrice: 2000, // changed (create-only field)
      currency: CurrencyCode.USD,
      slug: 'one-time-price',
    })

    expect(
      Result.isOk(
        validatePriceChange(
          existingSinglePayment,
          proposedSinglePayment
        )
      )
    ).toBe(true)
  })
})

describe('validateProductDiff', () => {
  it('allows updates to mutable product fields (name, active, description) and passes when no changes in product update', () => {
    // Single mutable field change
    const singleFieldDiff: ProductDiffResult = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          existing: createProductInput({
            productSlug: 'pro',
            productName: 'Old Name',
          }),
          proposed: createProductInput({
            productSlug: 'pro',
            productName: 'New Name',
          }),
        },
      ],
    }
    expect(Result.isOk(validateProductDiff(singleFieldDiff))).toBe(
      true
    )

    // Multiple mutable field changes
    const existingMultiple = createProductInput({
      productSlug: 'pro',
      productName: 'Old Name',
      active: true,
    })
    const proposedMultiple = createProductInput({
      productSlug: 'pro',
      productName: 'New Name',
      active: false,
    })
    ;(
      existingMultiple.product as Record<string, unknown>
    ).description = 'Old desc'
    ;(
      proposedMultiple.product as Record<string, unknown>
    ).description = 'New desc'
    const multipleFieldsDiff: ProductDiffResult = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        { existing: existingMultiple, proposed: proposedMultiple },
      ],
    }
    expect(Result.isOk(validateProductDiff(multipleFieldsDiff))).toBe(
      true
    )

    // No changes
    const product = createProductInput({
      productSlug: 'pro',
      productName: 'Pro',
    })
    const noChangesDiff: ProductDiffResult = {
      toRemove: [],
      toCreate: [],
      toUpdate: [{ existing: product, proposed: product }],
    }
    expect(Result.isOk(validateProductDiff(noChangesDiff))).toBe(true)
  })

  it('allows price create-only field changes (unitPrice) when proposed price is well-formed, treating them as price replacements', () => {
    const diff: ProductDiffResult = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          existing: createProductInput({
            productSlug: 'pro',
            productName: 'Pro',
            unitPrice: 1000,
          }),
          proposed: createProductInput({
            productSlug: 'pro',
            productName: 'Pro',
            unitPrice: 2000,
          }),
          priceDiff: {
            existingPrice: createTestPrice({
              type: PriceType.Subscription,
              unitPrice: 1000,
              slug: 'pro-price',
            }),
            proposedPrice: createTestPrice({
              type: PriceType.Subscription,
              unitPrice: 2000,
              slug: 'pro-price',
            }),
          },
        },
      ],
    }

    // Should not throw because unitPrice change triggers price replacement validation,
    // and the proposed price is well-formed
    expect(Result.isOk(validateProductDiff(diff))).toBe(true)
  })

  it('throws error when price type changes in priceDiff', () => {
    const diff: ProductDiffResult = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          existing: createProductInput({
            productSlug: 'pro',
            productName: 'Pro',
            priceType: PriceType.Subscription,
          }),
          proposed: createProductInput({
            productSlug: 'pro',
            productName: 'Pro',
            priceType: PriceType.SinglePayment,
          }),
          priceDiff: {
            existingPrice: createTestPrice({
              type: PriceType.Subscription,
              unitPrice: 1000,
              slug: 'pro-price',
            }),
            proposedPrice: createTestPrice({
              type: PriceType.SinglePayment,
              unitPrice: 1000,
              slug: 'pro-price',
            }),
          },
        },
      ],
    }

    {
      const result = validateProductDiff(diff)
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Price type cannot be changed'
        )
      }
    }
  })

  it('allows product removal and product creation', () => {
    // Product removal
    const removalDiff: ProductDiffResult = {
      toRemove: [
        createProductInput({
          productSlug: 'remove-me',
          productName: 'Remove Me',
        }),
      ],
      toCreate: [],
      toUpdate: [],
    }
    expect(Result.isOk(validateProductDiff(removalDiff))).toBe(true)

    // Product creation
    const creationDiff: ProductDiffResult = {
      toRemove: [],
      toCreate: [
        createProductInput({
          productSlug: 'new-product',
          productName: 'New Product',
        }),
      ],
      toUpdate: [],
    }
    expect(Result.isOk(validateProductDiff(creationDiff))).toBe(true)
  })

  it('allows price mutable field changes (name) without triggering price replacement', () => {
    const diff: ProductDiffResult = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          existing: createProductInput({
            productSlug: 'pro',
            productName: 'Pro',
          }),
          proposed: createProductInput({
            productSlug: 'pro',
            productName: 'Pro',
          }),
          priceDiff: {
            existingPrice: createTestPrice({
              type: PriceType.Subscription,
              unitPrice: 1000,
              slug: 'pro-price',
              name: 'Old Price Name',
            }),
            proposedPrice: createTestPrice({
              type: PriceType.Subscription,
              unitPrice: 1000,
              slug: 'pro-price',
              name: 'New Price Name',
            }),
          },
        },
      ],
    }

    expect(Result.isOk(validateProductDiff(diff))).toBe(true)
  })

  it('throws error when price replacement is attempted with malformed proposed price', () => {
    const diff: ProductDiffResult = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          existing: createProductInput({
            productSlug: 'pro',
            productName: 'Pro',
            unitPrice: 1000,
          }),
          proposed: createProductInput({
            productSlug: 'pro',
            productName: 'Pro',
            unitPrice: 2000,
          }),
          priceDiff: {
            existingPrice: createTestPrice({
              type: PriceType.Subscription,
              unitPrice: 1000,
              slug: 'pro-price',
            }),
            // Malformed price - missing required fields for subscription
            proposedPrice: {
              type: PriceType.Subscription,
              unitPrice: 2000,
              currency: CurrencyCode.USD,
              // missing intervalUnit and intervalCount
              isDefault: true,
              active: true,
              slug: 'pro-price',
            } as SetupPricingModelProductPriceInput,
          },
        },
      ],
    }

    {
      const result = validateProductDiff(diff)
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Invalid price for replacement'
        )
      }
    }
  })

  it('allows multiple valid updates including price replacements and mutable field changes', () => {
    const diff: ProductDiffResult = {
      toRemove: [],
      toCreate: [],
      toUpdate: [
        {
          // Valid update - just product name change
          existing: createProductInput({
            productSlug: 'pro-1',
            productName: 'Old Name',
          }),
          proposed: createProductInput({
            productSlug: 'pro-1',
            productName: 'New Name',
          }),
        },
        {
          // Valid update - price replacement with well-formed proposed price
          existing: createProductInput({
            productSlug: 'pro-2',
            productName: 'Pro 2',
            unitPrice: 1000,
          }),
          proposed: createProductInput({
            productSlug: 'pro-2',
            productName: 'Pro 2',
            unitPrice: 2000,
          }),
          priceDiff: {
            existingPrice: createTestPrice({
              type: PriceType.Subscription,
              unitPrice: 1000,
              slug: 'pro-2-price',
            }),
            proposedPrice: createTestPrice({
              type: PriceType.Subscription,
              unitPrice: 2000,
              slug: 'pro-2-price',
            }),
          },
        },
      ],
    }

    // Should not throw - both updates are valid (one is product name change, one is price replacement)
    expect(Result.isOk(validateProductDiff(diff))).toBe(true)
  })
})

describe('diffPricingModel', () => {
  /**
   * Helper function to create a minimal SetupPricingModelInput for testing.
   */
  const createPricingModelInput = (
    overrides: Partial<SetupPricingModelInput> = {}
  ): SetupPricingModelInput => {
    return {
      name: overrides.name ?? 'Test Pricing Model',
      isDefault: overrides.isDefault ?? false,
      features: overrides.features ?? [],
      products: overrides.products ?? [],
      usageMeters: overrides.usageMeters ?? [],
    }
  }

  it('should return complete diff for all resource types', () => {
    // Setup: existing pricing model with all resource types
    const existing = createPricingModelInput({
      features: [
        {
          slug: 'feature-a',
          name: 'Feature A',
          description: 'A test feature',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      products: [
        createProductInput({
          productSlug: 'pro',
          productName: 'Pro Plan',
          unitPrice: 1000,
        }),
      ],
      usageMeters: [
        {
          usageMeter: {
            slug: 'api-calls',
            name: 'API Calls',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
      ],
    })

    // Setup: proposed with changes to all resource types
    const proposed = createPricingModelInput({
      features: [
        {
          slug: 'feature-a',
          name: 'Feature A Updated',
          description: 'A test feature',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      products: [
        createProductInput({
          productSlug: 'pro',
          productName: 'Pro Plan Updated',
          unitPrice: 1000,
        }),
      ],
      usageMeters: [
        {
          usageMeter: {
            slug: 'api-calls',
            name: 'API Calls Updated',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
      ],
    })

    const result = diffPricingModel(existing, proposed).unwrap()

    // Expectation: returns PricingModelDiffResult with features, products, and usageMeters diffs
    expect(result).toHaveProperty('features')
    expect(result).toHaveProperty('products')
    expect(result).toHaveProperty('usageMeters')

    // Feature diff should have an update
    expect(result.features.toUpdate).toHaveLength(1)
    expect(result.features.toUpdate[0].existing.name).toBe(
      'Feature A'
    )
    expect(result.features.toUpdate[0].proposed.name).toBe(
      'Feature A Updated'
    )

    // Product diff should have an update
    expect(result.products.toUpdate).toHaveLength(1)
    expect(result.products.toUpdate[0].existing.product.name).toBe(
      'Pro Plan'
    )
    expect(result.products.toUpdate[0].proposed.product.name).toBe(
      'Pro Plan Updated'
    )

    // Usage meter diff should have an update
    expect(result.usageMeters.toUpdate).toHaveLength(1)
    expect(
      result.usageMeters.toUpdate[0].existing.usageMeter.name
    ).toBe('API Calls')
    expect(
      result.usageMeters.toUpdate[0].proposed.usageMeter.name
    ).toBe('API Calls Updated')
  })

  it('should succeed validation with valid changes', () => {
    // Setup: valid changes that pass all validations
    const existing = createPricingModelInput({
      features: [
        {
          slug: 'feature-a',
          name: 'Old Name',
          description: 'A test feature',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      products: [
        createProductInput({
          productSlug: 'pro',
          productName: 'Old Name',
        }),
      ],
      usageMeters: [
        {
          usageMeter: {
            slug: 'api-calls',
            name: 'Old Name',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
      ],
    })

    const proposed = createPricingModelInput({
      features: [
        {
          slug: 'feature-a',
          name: 'New Name',
          description: 'A test feature',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      products: [
        createProductInput({
          productSlug: 'pro',
          productName: 'New Name',
        }),
      ],
      usageMeters: [
        {
          usageMeter: {
            slug: 'api-calls',
            name: 'New Name',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
      ],
    })

    // Expectation: should not throw (all validations pass)
    expect(Result.isOk(diffPricingModel(existing, proposed))).toBe(
      true
    )
  })

  it('should throw error if validation fails - usage meter removal', () => {
    // Setup: trying to remove a usage meter
    const existing = createPricingModelInput({
      features: [],
      products: [],
      usageMeters: [
        {
          usageMeter: {
            slug: 'api-calls',
            name: 'API Calls',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
      ],
    })

    const proposed = createPricingModelInput({
      features: [],
      products: [],
      usageMeters: [], // Removing the usage meter
    })

    // Expectation: should throw error from validateUsageMeterDiff
    {
      const result = diffPricingModel(existing, proposed)
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Usage meters cannot be removed'
        )
      }
    }
  })

  it('should throw error if validation fails - feature type change', () => {
    // Setup: trying to change feature type
    const existing = createPricingModelInput({
      features: [
        {
          slug: 'feature-a',
          name: 'Feature A',
          description: 'A test feature',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      products: [],
      usageMeters: [],
    })

    const proposed = createPricingModelInput({
      features: [
        {
          slug: 'feature-a',
          name: 'Feature A',
          description: 'A test feature',
          type: FeatureType.UsageCreditGrant,
          active: true,
          amount: 100,
          usageMeterSlug: 'api-calls',
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
        },
      ],
      products: [],
      usageMeters: [],
    })

    // Expectation: should throw error from validateFeatureDiff
    {
      const result = diffPricingModel(existing, proposed)
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Feature type cannot be changed'
        )
      }
    }
  })

  it('should throw error if validation fails - price type change', () => {
    // Setup: trying to change price type
    const existing = createPricingModelInput({
      features: [],
      products: [
        createProductInput({
          productSlug: 'pro',
          productName: 'Pro',
          priceType: PriceType.Subscription,
          unitPrice: 1000,
        }),
      ],
      usageMeters: [],
    })

    const proposed = createPricingModelInput({
      features: [],
      products: [
        createProductInput({
          productSlug: 'pro',
          productName: 'Pro',
          priceType: PriceType.SinglePayment,
          unitPrice: 1000,
        }),
      ],
      usageMeters: [],
    })

    // Expectation: should throw error from validatePriceChange (via validateProductDiff)
    {
      const result = diffPricingModel(existing, proposed)
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Price type cannot be changed'
        )
      }
    }
  })

  it('should add all proposed resources to toCreate when existing pricing model is empty', () => {
    // Setup: empty existing, proposed with resources
    const existing = createPricingModelInput({
      features: [],
      products: [],
      usageMeters: [],
    })

    const proposed = createPricingModelInput({
      features: [
        {
          slug: 'new-feature',
          name: 'New Feature',
          description: 'A new feature',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      products: [
        createProductInput({
          productSlug: 'new-product',
          productName: 'New Product',
        }),
      ],
      usageMeters: [
        {
          usageMeter: {
            slug: 'new-meter',
            name: 'New Meter',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
      ],
    })

    const result = diffPricingModel(existing, proposed).unwrap()

    // Expectation: all resources in toCreate, nothing in toRemove or toUpdate
    expect(result.features.toCreate).toHaveLength(1)
    expect(result.features.toCreate[0].slug).toBe('new-feature')
    expect(result.features.toRemove).toEqual([])
    expect(result.features.toUpdate).toEqual([])

    expect(result.products.toCreate).toHaveLength(1)
    expect(result.products.toCreate[0].product.slug).toBe(
      'new-product'
    )
    expect(result.products.toRemove).toEqual([])
    expect(result.products.toUpdate).toEqual([])

    expect(result.usageMeters.toCreate).toHaveLength(1)
    expect(result.usageMeters.toCreate[0].usageMeter.slug).toBe(
      'new-meter'
    )
    expect(result.usageMeters.toRemove).toEqual([])
    expect(result.usageMeters.toUpdate).toEqual([])
  })

  it('should throw when usage meters are removed in empty proposed pricing model', () => {
    // Setup: existing with resources, empty proposed
    const existing = createPricingModelInput({
      features: [
        {
          slug: 'feature-a',
          name: 'Feature A',
          description: 'A test feature',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      products: [
        createProductInput({
          productSlug: 'pro',
          productName: 'Pro',
        }),
      ],
      usageMeters: [
        {
          usageMeter: {
            slug: 'api-calls',
            name: 'API Calls',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
      ],
    })

    const proposed = createPricingModelInput({
      features: [],
      products: [],
      usageMeters: [], // This will cause validation to throw
    })

    // Expectation: throws because usage meters cannot be removed
    {
      const result = diffPricingModel(existing, proposed)
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Usage meters cannot be removed'
        )
      }
    }
  })

  it('should add features and products to toRemove when proposed pricing model is empty', () => {
    // Setup: existing without usage meters, empty proposed
    const existing = createPricingModelInput({
      features: [
        {
          slug: 'feature-a',
          name: 'Feature A',
          description: 'A test feature',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      products: [
        createProductInput({
          productSlug: 'pro',
          productName: 'Pro',
        }),
      ],
      usageMeters: [],
    })

    const proposed = createPricingModelInput({
      features: [],
      products: [],
      usageMeters: [],
    })

    const result = diffPricingModel(existing, proposed).unwrap()

    // Expectation: features and products in toRemove, nothing in toCreate or toUpdate
    expect(result.features.toRemove).toHaveLength(1)
    expect(result.features.toRemove[0].slug).toBe('feature-a')
    expect(result.features.toCreate).toEqual([])
    expect(result.features.toUpdate).toEqual([])

    expect(result.products.toRemove).toHaveLength(1)
    expect(result.products.toRemove[0].product.slug).toBe('pro')
    expect(result.products.toCreate).toEqual([])
    expect(result.products.toUpdate).toEqual([])

    expect(result.usageMeters.toRemove).toEqual([])
    expect(result.usageMeters.toCreate).toEqual([])
    expect(result.usageMeters.toUpdate).toEqual([])
  })

  it('should be a pure function with no side effects - shared references', () => {
    // Setup: create pricing models with shared array references
    const existing = createPricingModelInput({
      features: [
        {
          slug: 'feature-a',
          name: 'Feature A',
          description: 'A test feature',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      products: [
        createProductInput({
          productSlug: 'pro',
          productName: 'Pro',
        }),
      ],
      usageMeters: [
        {
          usageMeter: {
            slug: 'api-calls',
            name: 'API Calls',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
      ],
    })

    const proposed = createPricingModelInput({
      features: existing.features,
      products: existing.products,
      usageMeters: existing.usageMeters,
    })

    // Create deep copies to check for mutations
    const existingCopy = JSON.parse(JSON.stringify(existing))
    const proposedCopy = JSON.parse(JSON.stringify(proposed))

    // Call the function
    diffPricingModel(existing, proposed)

    // Expectation: original objects are not modified even with shared references
    expect(existing).toEqual(existingCopy)
    expect(proposed).toEqual(proposedCopy)
  })

  it('should be a pure function with no side effects - different values', () => {
    // Setup: create pricing models with actual differences to exercise diffing logic
    const existing = createPricingModelInput({
      features: [
        {
          slug: 'feature-a',
          name: 'Old Feature Name',
          description: 'Old description',
          type: FeatureType.Toggle,
          active: true,
        },
        {
          slug: 'feature-remove',
          name: 'Remove Feature',
          description: 'Will be removed',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      products: [
        createProductInput({
          productSlug: 'pro',
          productName: 'Old Pro Name',
          unitPrice: 1000,
        }),
      ],
      usageMeters: [
        {
          usageMeter: {
            slug: 'api-calls',
            name: 'Old API Calls Name',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
      ],
    })

    const proposed = createPricingModelInput({
      features: [
        {
          slug: 'feature-a',
          name: 'New Feature Name',
          description: 'New description',
          type: FeatureType.Toggle,
          active: false,
        },
        {
          slug: 'feature-create',
          name: 'Create Feature',
          description: 'Will be created',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      products: [
        createProductInput({
          productSlug: 'pro',
          productName: 'New Pro Name',
          unitPrice: 1000,
        }),
        createProductInput({
          productSlug: 'new-product',
          productName: 'New Product',
        }),
      ],
      usageMeters: [
        {
          usageMeter: {
            slug: 'api-calls',
            name: 'New API Calls Name',
            aggregationType:
              UsageMeterAggregationType.CountDistinctProperties,
          },
        },
        {
          usageMeter: {
            slug: 'new-meter',
            name: 'New Meter',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
      ],
    })

    // Create deep copies to check for mutations
    const existingCopy = JSON.parse(JSON.stringify(existing))
    const proposedCopy = JSON.parse(JSON.stringify(proposed))

    // Call the function (which will do actual diffing work)
    const result = diffPricingModel(existing, proposed).unwrap()

    // Expectation: original objects are not modified even when diffing logic runs
    expect(existing).toEqual(existingCopy)
    expect(proposed).toEqual(proposedCopy)

    // Also verify the function actually did work (not a no-op)
    expect(result.features.toRemove).toHaveLength(1)
    expect(result.features.toCreate).toHaveLength(1)
    expect(result.features.toUpdate).toHaveLength(1)
    expect(result.products.toCreate).toHaveLength(1)
    expect(result.usageMeters.toCreate).toHaveLength(1)
  })

  it('correctly categorizes removes, creates, and updates across all resource types for complex diff scenario', () => {
    // Setup: complex scenario with remove, create, and update across all types
    const existing = createPricingModelInput({
      features: [
        {
          slug: 'feature-remove',
          name: 'Remove Feature',
          description: 'Will be removed',
          type: FeatureType.Toggle,
          active: true,
        },
        {
          slug: 'feature-update',
          name: 'Old Name',
          description: 'Will be updated',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      products: [
        createProductInput({
          productSlug: 'product-remove',
          productName: 'Remove Product',
        }),
        createProductInput({
          productSlug: 'product-update',
          productName: 'Old Name',
        }),
      ],
      usageMeters: [
        {
          usageMeter: {
            slug: 'meter-update',
            name: 'Old Name',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
      ],
    })

    const proposed = createPricingModelInput({
      features: [
        {
          slug: 'feature-update',
          name: 'New Name',
          description: 'Will be updated',
          type: FeatureType.Toggle,
          active: false,
        },
        {
          slug: 'feature-create',
          name: 'Create Feature',
          description: 'Will be created',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      products: [
        createProductInput({
          productSlug: 'product-update',
          productName: 'New Name',
        }),
        createProductInput({
          productSlug: 'product-create',
          productName: 'Create Product',
        }),
      ],
      usageMeters: [
        {
          usageMeter: {
            slug: 'meter-update',
            name: 'New Name',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
        {
          usageMeter: {
            slug: 'meter-create',
            name: 'Create Meter',
            aggregationType:
              UsageMeterAggregationType.CountDistinctProperties,
          },
        },
      ],
    })

    const result = diffPricingModel(existing, proposed).unwrap()

    // Verify features
    expect(result.features.toRemove).toHaveLength(1)
    expect(result.features.toRemove[0].slug).toBe('feature-remove')
    expect(result.features.toCreate).toHaveLength(1)
    expect(result.features.toCreate[0].slug).toBe('feature-create')
    expect(result.features.toUpdate).toHaveLength(1)
    expect(result.features.toUpdate[0].existing.name).toBe('Old Name')
    expect(result.features.toUpdate[0].proposed.name).toBe('New Name')

    // Verify products
    expect(result.products.toRemove).toHaveLength(1)
    expect(result.products.toRemove[0].product.slug).toBe(
      'product-remove'
    )
    expect(result.products.toCreate).toHaveLength(1)
    expect(result.products.toCreate[0].product.slug).toBe(
      'product-create'
    )
    expect(result.products.toUpdate).toHaveLength(1)
    expect(result.products.toUpdate[0].existing.product.name).toBe(
      'Old Name'
    )
    expect(result.products.toUpdate[0].proposed.product.name).toBe(
      'New Name'
    )

    // Verify usage meters
    expect(result.usageMeters.toRemove).toEqual([])
    expect(result.usageMeters.toCreate).toHaveLength(1)
    expect(result.usageMeters.toCreate[0].usageMeter.slug).toBe(
      'meter-create'
    )
    expect(result.usageMeters.toUpdate).toHaveLength(1)
    expect(
      result.usageMeters.toUpdate[0].existing.usageMeter.name
    ).toBe('Old Name')
    expect(
      result.usageMeters.toUpdate[0].proposed.usageMeter.name
    ).toBe('New Name')
  })

  it('places all resources in toUpdate with empty toRemove and toCreate for identical pricing models', () => {
    // Setup: completely identical pricing models
    const pricingModel = createPricingModelInput({
      features: [
        {
          slug: 'feature-a',
          name: 'Feature A',
          description: 'A test feature',
          type: FeatureType.Toggle,
          active: true,
        },
      ],
      products: [
        createProductInput({
          productSlug: 'pro',
          productName: 'Pro',
        }),
      ],
      usageMeters: [
        {
          usageMeter: {
            slug: 'api-calls',
            name: 'API Calls',
            aggregationType: UsageMeterAggregationType.Sum,
          },
        },
      ],
    })

    const result = diffPricingModel(
      pricingModel,
      pricingModel
    ).unwrap()

    // Expectation: everything in toUpdate, nothing in toRemove or toCreate
    expect(result.features.toRemove).toEqual([])
    expect(result.features.toCreate).toEqual([])
    expect(result.features.toUpdate).toHaveLength(1)

    expect(result.products.toRemove).toEqual([])
    expect(result.products.toCreate).toEqual([])
    expect(result.products.toUpdate).toHaveLength(1)

    expect(result.usageMeters.toRemove).toEqual([])
    expect(result.usageMeters.toCreate).toEqual([])
    expect(result.usageMeters.toUpdate).toHaveLength(1)
  })
})
