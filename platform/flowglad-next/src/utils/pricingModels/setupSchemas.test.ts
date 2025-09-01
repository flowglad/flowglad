import { expect, it, describe } from 'vitest'
import {
  SetupPricingModelInput,
  setupPricingModelSchema,
  validateSetupPricingModelInput,
} from './setupSchemas'
import {
  FeatureType,
  PriceType,
  IntervalUnit,
  FeatureUsageGrantFrequency,
  UsageMeterAggregationType,
} from '@/types'
import { ZodError } from 'zod'

describe('setupPricingModelSchema', () => {
  it('should be valid', () => {
    const input: SetupPricingModelInput = {
      name: 'Test PricingModel',
      isDefault: false,
      features: [
        {
          type: FeatureType.Toggle,
          name: 'Test Feature',
          description: 'Test Description',
          livemode: true,
          slug: 'test-feature',
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'Test Product',
            default: false,
            description: 'Test Description',
            slug: 'test-product',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              name: null,
              intervalCount: 1,
              type: PriceType.Subscription,
              isDefault: false,
              slug: 'test-price',
              usageMeterId: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              trialPeriodDays: null,
              setupFeeAmount: null,
              usageEventsPerUnit: null,
              overagePriceId: null,
              unitPrice: 1,
              startsWithCreditTrial: false,
            },
          ],
          features: ['test-feature'],
        },
      ],
      usageMeters: [],
    }
    const schema = setupPricingModelSchema.parse(input)
    expect(schema).toBeDefined()
  })
})

describe('validateSetupPricingModelInput', () => {
  it('returns parsed input with default isDefault=false when given only required fields', () => {
    const input: SetupPricingModelInput = {
      name: 'Only Required',
      isDefault: false,
      features: [],
      usageMeters: [],
      products: [],
    }
    const parsed = validateSetupPricingModelInput(input)
    expect(parsed.isDefault).toBe(false)
    expect(parsed.name).toBe('Only Required')
  })

  it('preserves isDefault=true when provided', () => {
    const input: SetupPricingModelInput = {
      name: 'With Default',
      isDefault: true,
      features: [],
      usageMeters: [],
      products: [],
    }
    const parsed = validateSetupPricingModelInput(input)
    expect(parsed.isDefault).toBe(true)
  })

  it('parses a valid pricingModel with complex combination of features, usageMeters, products, and prices', () => {
    const input: SetupPricingModelInput = {
      name: 'Complex PricingModel',
      isDefault: false,
      features: [
        {
          type: FeatureType.Toggle,
          name: 'T1',
          description: 'd1',
          livemode: false,
          slug: 't1',
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          name: 'U1',
          description: 'd2',
          livemode: false,
          slug: 'u1',
          usageMeterSlug: 'm1',
          amount: 1,
          renewalFrequency: FeatureUsageGrantFrequency.Once,
          active: true,
        },
      ],
      usageMeters: [
        {
          slug: 'm1',
          name: 'Meter One',
          aggregationType: UsageMeterAggregationType.Sum,
        },
      ],
      products: [
        {
          product: {
            name: 'P1',
            default: false,
            description: 'pd',
            slug: 'p1',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          features: ['t1', 'u1'],
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'ps1',
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 100,
              isDefault: false,
              name: null,
              usageMeterId: null,
              trialPeriodDays: null,
              setupFeeAmount: null,
              usageEventsPerUnit: null,
              overagePriceId: null,
              active: true,
              startsWithCreditTrial: false,
            },
            {
              type: PriceType.Usage,
              slug: 'pu1',
              usageMeterSlug: 'm1',
              unitPrice: 10,
              isDefault: false,
              name: null,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              trialPeriodDays: null,
              setupFeeAmount: null,
              usageEventsPerUnit: 1,
              overagePriceId: null,
              active: true,
              startsWithCreditTrial: false,
            },
          ],
        },
      ],
    }
    expect(() => validateSetupPricingModelInput(input)).not.toThrow()
    const parsed = validateSetupPricingModelInput(input)
    expect(parsed).toBeDefined()
  })

  it('throws if two features share the same slug', () => {
    const input: SetupPricingModelInput = {
      name: 'DupFeat',
      isDefault: false,
      features: [
        {
          type: FeatureType.Toggle,
          name: '',
          description: '',
          livemode: false,
          slug: 'dup',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          name: '',
          description: '',
          livemode: false,
          slug: 'dup',
          active: true,
        },
      ],
      usageMeters: [],
      products: [],
    }
    expect(() => validateSetupPricingModelInput(input)).toThrowError(
      'Feature with slug dup already exists'
    )
  })

  it('throws if two usage meters share the same slug', () => {
    const input: SetupPricingModelInput = {
      name: 'DupMeter',
      isDefault: false,
      features: [],
      usageMeters: [
        { slug: 'dup', name: 'm1' },
        { slug: 'dup', name: 'm2' },
      ],
      products: [],
    }
    expect(() => validateSetupPricingModelInput(input)).toThrowError(
      'Usage meter with slug dup already exists'
    )
  })

  it('throws if a product.features entry refers to a nonexistent feature slug', () => {
    const input: SetupPricingModelInput = {
      name: 'NoFeat',
      isDefault: false,
      features: [
        {
          type: FeatureType.Toggle,
          name: '',
          description: '',
          livemode: false,
          slug: 'f1',
          active: true,
        },
      ],
      usageMeters: [],
      products: [
        {
          product: {
            name: '',
            default: false,
            description: '',
            slug: 'p',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          features: ['no_such'],
          prices: [],
        },
      ],
    }
    expect(() => validateSetupPricingModelInput(input)).toThrowError(
      'Feature with slug no_such does not exist'
    )
  })

  it("throws if a usageCreditGrant feature's usageMeterSlug is not defined in usageMeters", () => {
    const input: SetupPricingModelInput = {
      name: 'NoMeter',
      isDefault: false,
      features: [
        {
          type: FeatureType.UsageCreditGrant,
          name: '',
          description: '',
          livemode: false,
          slug: 'fg',
          usageMeterSlug: 'umX',
          amount: 1,
          renewalFrequency: FeatureUsageGrantFrequency.Once,
          active: true,
        },
      ],
      usageMeters: [],
      products: [
        {
          product: {
            name: '',
            default: false,
            description: '',
            slug: 'p',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          features: ['fg'],
          prices: [],
        },
      ],
    }
    expect(() => validateSetupPricingModelInput(input)).toThrowError(
      'Usage meter with slug umX does not exist'
    )
  })

  it('throws if any price entry has no slug', () => {
    const input: SetupPricingModelInput = {
      name: 'NoPriceSlug',
      isDefault: false,
      features: [],
      usageMeters: [],
      products: [
        {
          product: {
            name: '',
            default: false,
            description: '',
            slug: 'p',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          features: [],
          prices: [
            {
              type: PriceType.Subscription,
              isDefault: false,
              name: null,
              usageMeterId: null,
              trialPeriodDays: null,
              setupFeeAmount: null,
              usageEventsPerUnit: null,
              overagePriceId: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 10,
              startsWithCreditTrial: false,
              slug: '',
            },
          ],
        },
      ],
    }
    expect(() => validateSetupPricingModelInput(input)).toThrowError(
      /Price slug is required/
    )
  })

  it('throws if a usage price entry is missing usageMeterSlug', () => {
    const input: SetupPricingModelInput = {
      name: 'NoUsageSlug',
      isDefault: false,
      features: [],
      usageMeters: [],
      products: [
        {
          product: {
            name: '',
            default: false,
            description: '',
            slug: 'p',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          features: [],
          prices: [
            {
              type: PriceType.Usage,
              slug: 'u1',
              isDefault: false,
              name: null,
              trialPeriodDays: null,
              setupFeeAmount: null,
              overagePriceId: null,
              active: true,
              unitPrice: 5,
              startsWithCreditTrial: false,
              usageMeterSlug: '',
              usageEventsPerUnit: 1,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
            },
          ],
        },
      ],
    }
    expect(() => validateSetupPricingModelInput(input)).toThrowError(
      'Usage meter slug is required for usage price'
    )
  })

  it("throws if a usage price's usageMeterSlug is not defined", () => {
    const input: SetupPricingModelInput = {
      name: 'BadUsage',
      isDefault: false,
      features: [],
      usageMeters: [],
      products: [
        {
          product: {
            name: '',
            default: false,
            description: '',
            slug: 'p',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          features: [],
          prices: [
            {
              type: PriceType.Usage,
              slug: 'u1',
              usageMeterSlug: 'nope',
              isDefault: false,
              name: null,
              trialPeriodDays: null,
              setupFeeAmount: null,
              usageEventsPerUnit: 1,
              overagePriceId: null,
              startsWithCreditTrial: false,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 5,
            },
          ],
        },
      ],
    }
    expect(() => validateSetupPricingModelInput(input)).toThrowError(
      'Usage meter with slug nope does not exist'
    )
  })

  it('throws if two prices share the same slug anywhere in products', () => {
    const input: SetupPricingModelInput = {
      name: 'DupPrice',
      isDefault: false,
      features: [],
      usageMeters: [],
      products: [
        {
          product: {
            name: '',
            default: false,
            description: '',
            slug: 'p1',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          features: [],
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'dup',
              isDefault: false,
              name: null,
              usageMeterId: null,
              trialPeriodDays: null,
              setupFeeAmount: null,
              usageEventsPerUnit: null,
              overagePriceId: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 10,
              startsWithCreditTrial: false,
            },
          ],
        },
        {
          product: {
            name: '',
            default: false,
            description: '',
            slug: 'p2',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          features: [],
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'dup',
              isDefault: false,
              name: null,
              usageMeterId: null,
              trialPeriodDays: null,
              setupFeeAmount: null,
              usageEventsPerUnit: null,
              overagePriceId: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 20,
              startsWithCreditTrial: false,
            },
          ],
        },
      ],
    }
    expect(() => validateSetupPricingModelInput(input)).toThrowError(
      'Price with slug dup already exists'
    )
  })

  it('throws a ZodError if required fields (name, features, products, usageMeters) are missing or invalid', () => {
    expect(() =>
      validateSetupPricingModelInput({} as any)
    ).toThrowError(ZodError)
  })
})
