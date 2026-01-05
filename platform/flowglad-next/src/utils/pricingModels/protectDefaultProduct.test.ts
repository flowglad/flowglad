import { describe, expect, it } from 'vitest'
import { CurrencyCode, IntervalUnit, PriceType } from '@/types'
import {
  findDefaultProduct,
  hasProtectedFieldChanges,
  mergeDefaultProduct,
  protectDefaultProduct,
  validateSingleDefaultProduct,
} from './protectDefaultProduct'
import type {
  SetupPricingModelInput,
  SetupPricingModelProductInput,
} from './setupSchemas'

/**
 * Helper to create a minimal SetupPricingModelProductInput for testing.
 * Note: Product uses `default` field, Price uses `isDefault` field.
 */
const createProductInput = (overrides: {
  slug?: string
  name?: string
  description?: string
  default?: boolean
  active?: boolean
  unitPrice?: number
  priceSlug?: string
  priceType?: PriceType
  intervalUnit?: IntervalUnit
  intervalCount?: number
  trialPeriodDays?: number
  features?: string[]
}): SetupPricingModelProductInput => {
  const {
    slug = 'test-product',
    name = 'Test Product',
    description = 'A test product',
    default: isDefault = false,
    active = true,
    unitPrice = 1000,
    priceSlug = 'test-price',
    priceType = PriceType.Subscription,
    intervalUnit = IntervalUnit.Month,
    intervalCount = 1,
    trialPeriodDays = 0,
    features = [],
  } = overrides

  let price: SetupPricingModelProductInput['price']
  if (
    priceType === PriceType.Subscription ||
    priceType === PriceType.Usage
  ) {
    price = {
      type: priceType,
      slug: priceSlug,
      unitPrice,
      currency: CurrencyCode.USD,
      isDefault: true,
      active: true,
      intervalUnit,
      intervalCount,
      trialPeriodDays,
    } as SetupPricingModelProductInput['price']
  } else {
    price = {
      type: PriceType.SinglePayment,
      slug: priceSlug,
      unitPrice,
      currency: CurrencyCode.USD,
      isDefault: true,
      active: true,
    } as SetupPricingModelProductInput['price']
  }

  return {
    product: {
      slug,
      name,
      description,
      default: isDefault, // Product uses `default`
      active,
    },
    price,
    features,
  } as SetupPricingModelProductInput
}

/**
 * Helper to create a minimal SetupPricingModelInput for testing
 */
const createPricingModelInput = (
  products: SetupPricingModelProductInput[]
): SetupPricingModelInput => {
  return {
    name: 'Test Pricing Model',
    isDefault: false,
    features: [],
    products,
    usageMeters: [],
  } as SetupPricingModelInput
}

describe('findDefaultProduct', () => {
  it('returns the product with default=true when it exists, and returns undefined when no default product exists', () => {
    // With default product
    const defaultProduct = createProductInput({
      slug: 'default-plan',
      default: true,
    })
    const regularProduct = createProductInput({
      slug: 'pro-plan',
      default: false,
    })
    const inputWithDefault = createPricingModelInput([
      regularProduct,
      defaultProduct,
    ])

    const foundDefault = findDefaultProduct(inputWithDefault)
    expect(foundDefault).toBe(defaultProduct)
    expect(foundDefault?.product.slug).toBe('default-plan')

    // Without default product
    const inputWithoutDefault = createPricingModelInput([
      regularProduct,
    ])
    const notFound = findDefaultProduct(inputWithoutDefault)
    expect(notFound).toBeUndefined()

    // Empty products array
    const emptyInput = createPricingModelInput([])
    expect(findDefaultProduct(emptyInput)).toBeUndefined()
  })
})

describe('validateSingleDefaultProduct', () => {
  it('does not throw when there is zero or one default product', () => {
    // Zero default products
    const noDefault = createPricingModelInput([
      createProductInput({ slug: 'pro', default: false }),
    ])
    expect(() =>
      validateSingleDefaultProduct(noDefault)
    ).not.toThrow()

    // One default product
    const oneDefault = createPricingModelInput([
      createProductInput({ slug: 'default', default: true }),
      createProductInput({ slug: 'pro', default: false }),
    ])
    expect(() =>
      validateSingleDefaultProduct(oneDefault)
    ).not.toThrow()
  })

  it('throws error when there are multiple products with default=true', () => {
    const multipleDefaults = createPricingModelInput([
      createProductInput({ slug: 'default-1', default: true }),
      createProductInput({ slug: 'default-2', default: true }),
      createProductInput({ slug: 'pro', default: false }),
    ])

    expect(() =>
      validateSingleDefaultProduct(multipleDefaults)
    ).toThrow(
      'Only one product can be marked as default. Found 2 default products: default-1, default-2'
    )
  })
})

describe('hasProtectedFieldChanges', () => {
  const baseDefault = createProductInput({
    slug: 'default-plan',
    name: 'Default Plan',
    description: 'The default plan',
    default: true,
    active: true,
    unitPrice: 0,
    priceSlug: 'default-price',
    priceType: PriceType.Subscription,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    trialPeriodDays: 0,
    features: ['feature-a'],
  })

  it('returns false when only allowed fields (name, description, features) change', () => {
    // Name change only
    const withNameChange = createProductInput({
      slug: 'default-plan',
      name: 'New Name',
      default: true,
      unitPrice: 0,
      priceSlug: 'default-price',
      features: ['feature-a'],
    })
    expect(
      hasProtectedFieldChanges(baseDefault, withNameChange)
    ).toBe(false)

    // Description change only
    const withDescriptionChange = createProductInput({
      slug: 'default-plan',
      name: 'Default Plan',
      description: 'New description',
      default: true,
      unitPrice: 0,
      priceSlug: 'default-price',
      features: ['feature-a'],
    })
    expect(
      hasProtectedFieldChanges(baseDefault, withDescriptionChange)
    ).toBe(false)

    // Features change only (features array is checked separately in merge, not in hasProtectedFieldChanges)
    const withFeaturesChange = createProductInput({
      slug: 'default-plan',
      name: 'Default Plan',
      default: true,
      unitPrice: 0,
      priceSlug: 'default-price',
      features: ['feature-a', 'feature-b'],
    })
    expect(
      hasProtectedFieldChanges(baseDefault, withFeaturesChange)
    ).toBe(false)
  })

  it('returns true when protected product fields (slug, active) change', () => {
    // Slug change
    const withSlugChange = createProductInput({
      slug: 'new-slug',
      name: 'Default Plan',
      default: true,
      unitPrice: 0,
      priceSlug: 'default-price',
    })
    expect(
      hasProtectedFieldChanges(baseDefault, withSlugChange)
    ).toBe(true)

    // Active change
    const withActiveChange = createProductInput({
      slug: 'default-plan',
      name: 'Default Plan',
      default: true,
      active: false,
      unitPrice: 0,
      priceSlug: 'default-price',
    })
    expect(
      hasProtectedFieldChanges(baseDefault, withActiveChange)
    ).toBe(true)
  })

  it('returns true when protected price fields (unitPrice, priceSlug, type, interval, trial) change', () => {
    // Unit price change
    const withUnitPriceChange = createProductInput({
      slug: 'default-plan',
      name: 'Default Plan',
      default: true,
      unitPrice: 1000,
      priceSlug: 'default-price',
    })
    expect(
      hasProtectedFieldChanges(baseDefault, withUnitPriceChange)
    ).toBe(true)

    // Price slug change
    const withPriceSlugChange = createProductInput({
      slug: 'default-plan',
      name: 'Default Plan',
      default: true,
      unitPrice: 0,
      priceSlug: 'new-price-slug',
    })
    expect(
      hasProtectedFieldChanges(baseDefault, withPriceSlugChange)
    ).toBe(true)

    // Price type change
    const withTypeChange = createProductInput({
      slug: 'default-plan',
      name: 'Default Plan',
      default: true,
      unitPrice: 0,
      priceSlug: 'default-price',
      priceType: PriceType.SinglePayment,
    })
    expect(
      hasProtectedFieldChanges(baseDefault, withTypeChange)
    ).toBe(true)

    // Interval unit change
    const withIntervalChange = createProductInput({
      slug: 'default-plan',
      name: 'Default Plan',
      default: true,
      unitPrice: 0,
      priceSlug: 'default-price',
      intervalUnit: IntervalUnit.Year,
    })
    expect(
      hasProtectedFieldChanges(baseDefault, withIntervalChange)
    ).toBe(true)

    // Trial period change
    const withTrialChange = createProductInput({
      slug: 'default-plan',
      name: 'Default Plan',
      default: true,
      unitPrice: 0,
      priceSlug: 'default-price',
      trialPeriodDays: 14,
    })
    expect(
      hasProtectedFieldChanges(baseDefault, withTrialChange)
    ).toBe(true)
  })
})

describe('mergeDefaultProduct', () => {
  it('preserves existing protected fields while applying allowed changes (name, description, features) from proposed', () => {
    const existing = createProductInput({
      slug: 'default-plan',
      name: 'Old Name',
      description: 'Old description',
      default: true,
      active: true,
      unitPrice: 0,
      priceSlug: 'default-price',
      priceType: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      features: ['old-feature'],
    })

    const proposed = createProductInput({
      slug: 'new-slug-attempt', // should be ignored
      name: 'New Name', // should be applied
      description: 'New description', // should be applied
      default: true,
      active: false, // should be ignored
      unitPrice: 9999, // should be ignored
      priceSlug: 'new-price-slug', // should be ignored
      priceType: PriceType.SinglePayment, // should be ignored
      features: ['new-feature-a', 'new-feature-b'], // should be applied
    })

    const merged = mergeDefaultProduct(existing, proposed)

    // Allowed changes should be applied
    expect(merged.product.name).toBe('New Name')
    expect(merged.product.description).toBe('New description')
    expect(merged.features).toEqual([
      'new-feature-a',
      'new-feature-b',
    ])

    // Protected fields should be preserved from existing
    expect(merged.product.slug).toBe('default-plan')
    expect(merged.product.active).toBe(true)
    expect(merged.product.default).toBe(true)
    expect(merged.price.slug).toBe('default-price')
    expect(merged.price.unitPrice).toBe(0)
    expect(merged.price.type).toBe(PriceType.Subscription)
  })
})

describe('protectDefaultProduct', () => {
  const existingDefault = createProductInput({
    slug: 'default-plan',
    name: 'Default Plan',
    description: 'The default plan',
    default: true,
    active: true,
    unitPrice: 0,
    priceSlug: 'default-price',
    features: ['feature-a'],
  })

  const existingPro = createProductInput({
    slug: 'pro-plan',
    name: 'Pro Plan',
    default: false,
    unitPrice: 2000,
    priceSlug: 'pro-price',
    features: ['feature-a', 'feature-b'],
  })

  it('throws error when proposed input has multiple default products', () => {
    const existing = createPricingModelInput([
      existingDefault,
      existingPro,
    ])
    const proposed = createPricingModelInput([
      createProductInput({ slug: 'default-1', default: true }),
      createProductInput({ slug: 'default-2', default: true }),
    ])

    expect(() => protectDefaultProduct(existing, proposed)).toThrow(
      'Only one product can be marked as default'
    )
  })

  it('throws error when existing input has no default product', () => {
    const existingNoDefault = createPricingModelInput([existingPro])
    const proposed = createPricingModelInput([
      createProductInput({ slug: 'new-plan', default: false }),
    ])

    expect(() =>
      protectDefaultProduct(existingNoDefault, proposed)
    ).toThrow('No default product found in existing input')
  })

  it('adds back the existing default product when proposed removes it', () => {
    const existing = createPricingModelInput([
      existingDefault,
      existingPro,
    ])
    const proposed = createPricingModelInput([
      existingPro, // default product is missing
    ])

    const result = protectDefaultProduct(existing, proposed)

    expect(result.products).toHaveLength(2)
    const restoredDefault = result.products.find(
      (p) => p.product.default === true
    )
    expect(restoredDefault).not.toBeUndefined()
    expect(restoredDefault!.product.slug).toBe('default-plan')
    expect(restoredDefault!.product.name).toBe('Default Plan')
  })

  it('returns proposed unchanged when default product has only allowed field changes (name, description, features)', () => {
    const existing = createPricingModelInput([
      existingDefault,
      existingPro,
    ])
    const proposedWithAllowedChanges = createPricingModelInput([
      createProductInput({
        slug: 'default-plan',
        name: 'Updated Default Name',
        description: 'Updated description',
        default: true,
        active: true,
        unitPrice: 0,
        priceSlug: 'default-price',
        features: ['feature-a', 'feature-c'],
      }),
      existingPro,
    ])

    const result = protectDefaultProduct(
      existing,
      proposedWithAllowedChanges
    )

    // Should return proposed as-is since only allowed fields changed
    expect(result).toBe(proposedWithAllowedChanges)
  })

  it('merges default product when protected fields are changed, preserving existing protected fields while applying allowed changes', () => {
    const existing = createPricingModelInput([
      existingDefault,
      existingPro,
    ])
    const proposedWithProtectedChanges = createPricingModelInput([
      createProductInput({
        slug: 'default-plan', // same slug as existing default
        name: 'Updated Name', // allowed - should be applied
        description: 'Updated description', // allowed - should be applied
        default: true,
        active: false, // protected - should be ignored
        unitPrice: 5000, // protected - should be ignored
        priceSlug: 'new-price-slug', // protected - should be ignored
        features: ['feature-a', 'feature-b', 'feature-c'], // allowed - should be applied
      }),
      existingPro,
    ])

    const result = protectDefaultProduct(
      existing,
      proposedWithProtectedChanges
    )

    const protectedDefault = result.products.find(
      (p) => p.product.default === true
    )
    expect(protectedDefault).not.toBeUndefined()

    // Allowed changes should be applied
    expect(protectedDefault!.product.name).toBe('Updated Name')
    expect(protectedDefault!.product.description).toBe(
      'Updated description'
    )
    expect(protectedDefault!.features).toEqual([
      'feature-a',
      'feature-b',
      'feature-c',
    ])

    // Protected fields should be preserved from existing
    expect(protectedDefault!.product.slug).toBe('default-plan')
    expect(protectedDefault!.product.active).toBe(true)
    expect(protectedDefault!.price.slug).toBe('default-price')
    expect(protectedDefault!.price.unitPrice).toBe(0)

    // Non-default product should be unchanged
    const proProduct = result.products.find(
      (p) => p.product.slug === 'pro-plan'
    )
    expect(proProduct).toBe(existingPro)
  })

  it('merges protected fields from existing default into proposed default when someone tries to change which product is default', () => {
    // This scenario: existing has default-plan as default, proposed tries to make pro-plan the default
    // Since slug is a protected field, the merge will preserve the existing default's protected fields
    // (including slug) while applying allowed fields (name, description) from the proposed default
    const existing = createPricingModelInput([
      existingDefault,
      existingPro,
    ])
    const proposedWithDifferentDefault = createPricingModelInput([
      createProductInput({
        slug: 'pro-plan',
        name: 'Pro Plan Updated', // allowed field - will be applied
        description: 'Updated description', // allowed field - will be applied
        default: true, // trying to make pro the new default
        unitPrice: 2000,
        priceSlug: 'pro-price',
      }),
    ])

    const result = protectDefaultProduct(
      existing,
      proposedWithDifferentDefault
    )

    // The result should have the default product with existing's protected fields
    // and proposed's allowed fields
    expect(result.products).toHaveLength(1)

    const defaultProduct = result.products.find(
      (p) => p.product.default === true
    )
    expect(defaultProduct).not.toBeUndefined()
    // Protected fields from existing default
    expect(defaultProduct!.product.slug).toBe('default-plan')
    expect(defaultProduct!.product.active).toBe(true)
    expect(defaultProduct!.price.slug).toBe('default-price')
    expect(defaultProduct!.price.unitPrice).toBe(0)
    // Allowed fields from proposed default
    expect(defaultProduct!.product.name).toBe('Pro Plan Updated')
    expect(defaultProduct!.product.description).toBe(
      'Updated description'
    )
  })

  it('preserves other products in the proposed input unchanged when merging default product', () => {
    const newProduct = createProductInput({
      slug: 'new-plan',
      name: 'New Plan',
      default: false,
      unitPrice: 5000,
      priceSlug: 'new-price',
    })

    const existing = createPricingModelInput([
      existingDefault,
      existingPro,
    ])
    const proposed = createPricingModelInput([
      createProductInput({
        slug: 'default-plan',
        name: 'Updated Default',
        default: true,
        unitPrice: 999, // protected change
        priceSlug: 'default-price',
      }),
      existingPro,
      newProduct, // newly added product
    ])

    const result = protectDefaultProduct(existing, proposed)

    expect(result.products).toHaveLength(3)

    // Default was merged
    const defaultProduct = result.products.find(
      (p) => p.product.slug === 'default-plan'
    )
    expect(defaultProduct?.product.name).toBe('Updated Default')
    expect(defaultProduct?.price.unitPrice).toBe(0) // protected

    // Other products unchanged
    const proProduct = result.products.find(
      (p) => p.product.slug === 'pro-plan'
    )
    expect(proProduct).toBe(existingPro)

    const addedProduct = result.products.find(
      (p) => p.product.slug === 'new-plan'
    )
    expect(addedProduct).toBe(newProduct)
  })
})
