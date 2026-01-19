import { describe, expect, it } from 'vitest'
import { PRICING_MODEL_TEMPLATES } from '@/constants/pricingModelTemplates'
import {
  CurrencyCode,
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PriceType,
} from '@/types'
import type { SetupPricingModelInput } from './setupSchemas'
import {
  setupPricingModelSchema,
  setupUsageMeterPriceInputSchema,
  validateSetupPricingModelInput,
} from './setupSchemas'

describe('validateSetupPricingModelInput', () => {
  // Helper function to create a minimal valid input
  const createMinimalValidInput = (): SetupPricingModelInput => ({
    name: 'Test Pricing Model',
    isDefault: false,
    features: [],
    products: [
      {
        product: {
          name: 'Test Product',
          slug: 'test-product',
          active: true,
          default: false,
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
      },
    ],
    usageMeters: [],
  })

  // Usage prices are optional for usage meters.
  // A usage meter can exist without prices (e.g., for meters that only track usage
  // for credit grants, not billing).

  describe('feature existence validation', () => {
    it('should throw when a product references a feature slug that does not exist', () => {
      const input = createMinimalValidInput()
      input.products[0].features = ['non-existent-feature']

      expect(() => validateSetupPricingModelInput(input)).toThrow(
        'Feature with slug non-existent-feature does not exist'
      )
    })

    it('should accept when all referenced features exist', () => {
      const input = createMinimalValidInput()
      input.features = [
        {
          type: FeatureType.Toggle,
          slug: 'test-feature',
          name: 'Test Feature',
          description: 'Test Description',
          active: true,
        },
      ]
      input.products[0].features = ['test-feature']

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })
  })

  describe('UsageCreditGrant feature usage meter reference', () => {
    it('should throw when a UsageCreditGrant feature references a non-existent usage meter', () => {
      const input = createMinimalValidInput()
      input.features = [
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'credit-feature',
          name: 'Credit Feature',
          description: 'Test Description',
          usageMeterSlug: 'non-existent-meter',
          amount: 100,
          renewalFrequency: FeatureUsageGrantFrequency.Once,
          active: true,
        },
      ]
      input.products[0].features = ['credit-feature']

      expect(() => validateSetupPricingModelInput(input)).toThrow(
        'Usage meter with slug non-existent-meter does not exist'
      )
    })

    // Usage prices live under usage meters, not products
    it('should accept when UsageCreditGrant feature references an existing usage meter', () => {
      const input = createMinimalValidInput()
      // Usage meters have nested prices
      input.usageMeters = [
        {
          usageMeter: {
            slug: 'test-meter',
            name: 'Test Meter',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'usage-price',
              isDefault: true,
              unitPrice: 100,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              trialPeriodDays: null,
              usageEventsPerUnit: 1,
              active: true,
            },
          ],
        },
      ]
      input.features = [
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'credit-feature',
          name: 'Credit Feature',
          description: 'Test Description',
          usageMeterSlug: 'test-meter',
          amount: 100,
          renewalFrequency: FeatureUsageGrantFrequency.Once,
          active: true,
        },
      ]
      input.products[0].features = ['credit-feature']

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })
  })

  describe('price slug requirement', () => {
    it('should throw when a price is missing a slug', () => {
      const input = createMinimalValidInput()
      input.products[0].price = {
        type: PriceType.Subscription,
        isDefault: true,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        usageMeterId: null,
        usageEventsPerUnit: null,
        active: true,
        // slug is intentionally omitted to test runtime validation
      }

      expect(() => validateSetupPricingModelInput(input)).toThrow(
        /Price slug is required/
      )
    })

    it('should accept when all prices have slugs', () => {
      const input = createMinimalValidInput()
      input.products[0].price = {
        type: PriceType.Subscription,
        slug: 'test-price',
        isDefault: true,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        usageMeterId: null,
        usageEventsPerUnit: null,
        active: true,
      }

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })
  })

  // Usage prices live under usage meters, not products
  // The usageMeterSlug field is no longer needed since prices are nested under meters
  describe('usage meter prices validation', () => {
    it('should accept when usage prices are nested under usage meters', () => {
      const input = createMinimalValidInput()
      input.usageMeters = [
        {
          usageMeter: {
            slug: 'test-meter',
            name: 'Test Meter',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'usage-price',
              isDefault: true,
              unitPrice: 100,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              trialPeriodDays: null,
              usageEventsPerUnit: 1,
              active: true,
            },
          ],
        },
      ]

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })

    it('should set isDefault=false for all usage prices regardless of input', () => {
      const input = createMinimalValidInput()
      input.usageMeters = [
        {
          usageMeter: {
            slug: 'test-meter',
            name: 'Test Meter',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'usage-price',
              // isDefault explicitly set to true - should be changed to false
              // because usage prices don't use the isDefault concept
              isDefault: true,
              unitPrice: 100,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              trialPeriodDays: null,
              usageEventsPerUnit: 1,
              active: true,
            },
          ],
        },
      ]

      const result = validateSetupPricingModelInput(input)
      expect(result.usageMeters[0].prices?.[0].isDefault).toBe(false)
    })

    // Empty prices array is valid - usage meters can exist without prices
    // (e.g., meters that only track usage for credit grants, not billing)
  })

  // This describe block is obsolete - usage prices are nested under usage meters
  // directly, so there's no need to validate usage meter references via usageMeterSlug
  // The validation is now implicit - a usage price exists under a specific meter

  describe('price slug uniqueness across products', () => {
    it('should throw when multiple products have prices with the same slug', () => {
      const input = createMinimalValidInput()
      input.products = [
        {
          product: {
            name: 'Product 1',
            slug: 'product-1',
            active: true,
            default: false,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'duplicate-price-slug',
            isDefault: true,
            unitPrice: 1000,
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
            name: 'Product 2',
            slug: 'product-2',
            active: true,
            default: false,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'duplicate-price-slug',
            isDefault: true,
            unitPrice: 2000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            usageMeterId: null,
            usageEventsPerUnit: null,
            active: true,
          },
          features: [],
        },
      ]

      expect(() => validateSetupPricingModelInput(input)).toThrow(
        'Price with slug duplicate-price-slug already exists'
      )
    })

    it('should accept when all price slugs are unique across products', () => {
      const input = createMinimalValidInput()
      input.products = [
        {
          product: {
            name: 'Product 1',
            slug: 'product-1',
            active: true,
            default: false,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'price-1',
            isDefault: true,
            unitPrice: 1000,
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
            name: 'Product 2',
            slug: 'product-2',
            active: true,
            default: false,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'price-2',
            isDefault: true,
            unitPrice: 2000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            usageMeterId: null,
            usageEventsPerUnit: null,
            active: true,
          },
          features: [],
        },
      ]

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })
  })

  describe('valid complete input', () => {
    it('should accept a valid complete pricing model input', () => {
      const template = PRICING_MODEL_TEMPLATES[0]
      if (!template) {
        throw new Error(
          'Expected at least one template for this test'
        )
      }

      const input = JSON.parse(JSON.stringify(template.input))

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
      const result = validateSetupPricingModelInput(input)
      expect(result.name).toBe(input.name)
    })
  })

  describe('feature type validation', () => {
    it('should accept toggle features with required fields', () => {
      const input = createMinimalValidInput()
      input.features = [
        {
          type: FeatureType.Toggle,
          slug: 'toggle-feature',
          name: 'Toggle Feature',
          description: 'Test Description',
          active: true,
        },
      ]
      input.products[0].features = ['toggle-feature']

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })

    // Usage prices live under usage meters, not products
    it('should accept UsageCreditGrant features with required fields', () => {
      const input = createMinimalValidInput()
      input.usageMeters = [
        {
          usageMeter: {
            slug: 'test-meter',
            name: 'Test Meter',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'usage-price',
              isDefault: true,
              unitPrice: 100,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              trialPeriodDays: null,
              usageEventsPerUnit: 1,
              active: true,
            },
          ],
        },
      ]
      input.features = [
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'credit-feature',
          name: 'Credit Feature',
          description: 'Test Description',
          usageMeterSlug: 'test-meter',
          amount: 100,
          renewalFrequency: FeatureUsageGrantFrequency.Once,
          active: true,
        },
      ]
      input.products[0].features = ['credit-feature']

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })
  })

  describe('price type validation', () => {
    it('should accept subscription prices with required fields', () => {
      const input = createMinimalValidInput()
      input.products[0].price = {
        type: PriceType.Subscription,
        slug: 'subscription-price',
        isDefault: true,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        usageMeterId: null,
        usageEventsPerUnit: null,
        active: true,
      }

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })

    it('should accept single payment prices with required fields', () => {
      const input = createMinimalValidInput()
      input.products[0].price = {
        type: PriceType.SinglePayment,
        slug: 'single-payment-price',
        isDefault: true,
        unitPrice: 5000,
        active: true,
      }

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })

    // Usage prices live under usage meters, not products
    it('should accept usage prices with required fields when nested under usage meters', () => {
      const input = createMinimalValidInput()
      input.usageMeters = [
        {
          usageMeter: {
            slug: 'test-meter',
            name: 'Test Meter',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'usage-price',
              isDefault: true,
              unitPrice: 100,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              trialPeriodDays: null,
              usageEventsPerUnit: 1,
              active: true,
            },
          ],
        },
      ]

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })
  })

  describe('currency validation', () => {
    it('should reject invalid currency codes', () => {
      const input = createMinimalValidInput()
      input.products[0].price = {
        type: PriceType.Subscription,
        slug: 'test-price',
        isDefault: true,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        usageMeterId: null,
        usageEventsPerUnit: null,
        active: true,
        currency: 'INVALID' as CurrencyCode,
      }

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe(
        'Invalid option: expected one of "USD"|"AED"|"AFN"|"ALL"|"AMD"|"ANG"|"AOA"|"ARS"|"AUD"|"AWG"|"AZN"|"BAM"|"BBD"|"BDT"|"BGN"|"BIF"|"BMD"|"BND"|"BOB"|"BRL"|"BSD"|"BWP"|"BYN"|"BZD"|"CAD"|"CDF"|"CHF"|"CLP"|"CNY"|"COP"|"CRC"|"CVE"|"CZK"|"DJF"|"DKK"|"DOP"|"DZD"|"EGP"|"ETB"|"EUR"|"FJD"|"FKP"|"GBP"|"GEL"|"GIP"|"GMD"|"GNF"|"GTQ"|"GYD"|"HKD"|"HNL"|"HTG"|"HUF"|"IDR"|"ILS"|"INR"|"ISK"|"JMD"|"JPY"|"KES"|"KGS"|"KHR"|"KMF"|"KRW"|"KYD"|"KZT"|"LAK"|"LBP"|"LKR"|"LRD"|"LSL"|"MAD"|"MDL"|"MGA"|"MKD"|"MMK"|"MNT"|"MOP"|"MUR"|"MVR"|"MWK"|"MXN"|"MYR"|"MZN"|"NAD"|"NGN"|"NIO"|"NOK"|"NPR"|"NZD"|"PAB"|"PEN"|"PGK"|"PHP"|"PKR"|"PLN"|"PYG"|"QAR"|"RON"|"RSD"|"RUB"|"RWF"|"SAR"|"SBD"|"SCR"|"SEK"|"SGD"|"SHP"|"SLE"|"SOS"|"SRD"|"STD"|"SZL"|"THB"|"TJS"|"TOP"|"TRY"|"TTD"|"TWD"|"TZS"|"UAH"|"UGX"|"UYU"|"UZS"|"VND"|"VUV"|"WST"|"XAF"|"XCD"|"XOF"|"XPF"|"YER"|"ZAR"|"ZMW"'
      )
    })

    it('should accept valid currency codes when provided', () => {
      const input = createMinimalValidInput()
      input.products[0].price = {
        type: PriceType.Subscription,
        slug: 'test-price',
        isDefault: true,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        usageMeterId: null,
        usageEventsPerUnit: null,
        active: true,
        currency: CurrencyCode.USD,
      }

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })
  })

  describe('Resource feature schema validation', () => {
    it('should accept Resource features with resourceSlug and amount', () => {
      const input = createMinimalValidInput()
      input.resources = [
        {
          slug: 'test-resource',
          name: 'Test Resource',
          active: true,
        },
      ]
      input.features = [
        {
          type: FeatureType.Resource,
          slug: 'resource-feature',
          name: 'Resource Feature',
          description: 'Test Description',
          resourceSlug: 'test-resource',
          amount: 5,
          active: true,
        },
      ]
      input.products[0].features = ['resource-feature']

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })

    it('should throw when Resource feature references a non-existent resource slug', () => {
      const input = createMinimalValidInput()
      input.resources = []
      input.features = [
        {
          type: FeatureType.Resource,
          slug: 'resource-feature',
          name: 'Resource Feature',
          description: 'Test Description',
          resourceSlug: 'non-existent-resource',
          amount: 5,
          active: true,
        },
      ]
      input.products[0].features = ['resource-feature']

      expect(() => validateSetupPricingModelInput(input)).toThrow(
        'Resource with slug non-existent-resource does not exist'
      )
    })

    it('should reject Resource feature without amount', () => {
      const input = createMinimalValidInput()
      input.resources = [
        {
          slug: 'test-resource',
          name: 'Test Resource',
          active: true,
        },
      ]
      const invalidResourceFeature = {
        type: FeatureType.Resource,
        slug: 'resource-feature',
        name: 'Resource Feature',
        description: 'Test Description',
        resourceSlug: 'test-resource',
        active: true,
        // intentionally omitting required 'amount' field to test schema validation
      }
      // @ts-expect-error - invalidResourceFeature is missing required 'amount' field
      input.features = [invalidResourceFeature]
      input.products[0].features = ['resource-feature']

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })

  describe('resources array validation', () => {
    it('should allow resources to be undefined when not provided', () => {
      const input = createMinimalValidInput()
      // Ensure resources is not set
      delete (input as any).resources

      const result = validateSetupPricingModelInput(input)
      expect(result.resources).toBeUndefined()
    })

    it('should accept input with resources array', () => {
      const input = createMinimalValidInput()
      input.resources = [
        {
          slug: 'resource-one',
          name: 'Resource One',
          active: true,
        },
        {
          slug: 'resource-two',
          name: 'Resource Two',
          active: true,
        },
      ]

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
      const result = validateSetupPricingModelInput(input)
      expect(result.resources).toHaveLength(2)
      expect(result.resources?.[0]?.slug).toBe('resource-one')
      expect(result.resources?.[1]?.slug).toBe('resource-two')
    })

    it('should reject duplicate resource slugs', () => {
      const input = createMinimalValidInput()
      input.resources = [
        {
          slug: 'duplicate-slug',
          name: 'Resource One',
          active: true,
        },
        {
          slug: 'duplicate-slug',
          name: 'Resource Two',
          active: true,
        },
      ]

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        const hasSlugError = result.error.issues.some(
          (issue) =>
            issue.message === 'Resources must have unique slugs'
        )
        expect(hasSlugError).toBe(true)
      }
    })
  })

  describe('mixed feature types', () => {
    it('should accept all three feature types (Toggle, UsageCreditGrant, Resource) together', () => {
      const input = createMinimalValidInput()
      input.usageMeters = [
        {
          usageMeter: {
            slug: 'test-meter',
            name: 'Test Meter',
          },
        },
      ]
      input.resources = [
        {
          slug: 'test-resource',
          name: 'Test Resource',
          active: true,
        },
      ]
      input.features = [
        {
          type: FeatureType.Toggle,
          slug: 'toggle-feature',
          name: 'Toggle Feature',
          description: 'Test Toggle',
          active: true,
        },
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'credit-feature',
          name: 'Credit Feature',
          description: 'Test Credit',
          usageMeterSlug: 'test-meter',
          amount: 100,
          renewalFrequency: FeatureUsageGrantFrequency.Once,
          active: true,
        },
        {
          type: FeatureType.Resource,
          slug: 'resource-feature',
          name: 'Resource Feature',
          description: 'Test Resource Feature',
          resourceSlug: 'test-resource',
          amount: 5,
          active: true,
        },
      ]
      input.products[0].features = [
        'toggle-feature',
        'credit-feature',
        'resource-feature',
      ]
      // Product keeps its default subscription price from createMinimalValidInput

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
      const result = validateSetupPricingModelInput(input)
      expect(result.features).toHaveLength(3)
    })
  })

  describe('reserved slug validation for usage prices', () => {
    it('rejects usage price with slug ending in _no_charge via Zod schema validation', () => {
      const input = createMinimalValidInput()
      input.usageMeters = [
        {
          usageMeter: { slug: 'api-calls', name: 'API Calls' },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'api-calls_no_charge',
              isDefault: true,
              unitPrice: 100,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              trialPeriodDays: null,
              usageEventsPerUnit: 1,
              active: true,
            },
          ],
        },
      ]

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        const hasReservedSlugError = result.error.issues.some(
          (issue) =>
            issue.message.includes('_no_charge') &&
            issue.message.includes('reserved')
        )
        expect(hasReservedSlugError).toBe(true)
      }
    })

    it('accepts usage price with slug containing _no_charge but not as suffix', () => {
      const input = createMinimalValidInput()
      input.usageMeters = [
        {
          usageMeter: { slug: 'api-calls', name: 'API Calls' },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'meter_no_charge_extra',
              isDefault: true,
              unitPrice: 100,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              trialPeriodDays: null,
              usageEventsPerUnit: 1,
              active: true,
            },
          ],
        },
      ]

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })

    it('accepts subscription price with _no_charge suffix (restriction only for usage prices)', () => {
      const input = createMinimalValidInput()
      input.products[0].price = {
        type: PriceType.Subscription,
        slug: 'promo_no_charge',
        isDefault: true,
        unitPrice: 0,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        usageMeterId: null,
        usageEventsPerUnit: null,
        active: true,
      }

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })

    it('accepts single_payment price with _no_charge suffix (restriction only for usage prices)', () => {
      const input = createMinimalValidInput()
      input.products[0].price = {
        type: PriceType.SinglePayment,
        slug: 'trial_no_charge',
        isDefault: true,
        unitPrice: 0,
        active: true,
      }

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })
  })
})

describe('setupUsageMeterPriceInputSchema', () => {
  const createValidUsagePriceInput = () => ({
    type: PriceType.Usage as const,
    slug: 'api-calls-price',
    isDefault: true,
    unitPrice: 100,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    trialPeriodDays: null,
    usageEventsPerUnit: 1,
    active: true,
  })

  describe('reserved slug validation', () => {
    it('rejects usage price with slug ending in _no_charge via direct schema safeParse', () => {
      const input = {
        ...createValidUsagePriceInput(),
        slug: 'api-calls_no_charge',
      }

      const result = setupUsageMeterPriceInputSchema.safeParse(input)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues).toHaveLength(1)
        expect(result.error.issues[0].path).toEqual(['slug'])
        expect(result.error.issues[0].message).toBe(
          'Usage price slugs ending with "_no_charge" are reserved for auto-generated fallback prices'
        )
      }
    })

    it('accepts usage price with valid slug not ending in _no_charge', () => {
      const input = createValidUsagePriceInput()

      const result = setupUsageMeterPriceInputSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.slug).toBe('api-calls-price')
      }
    })

    it('accepts usage price with slug containing _no_charge in the middle', () => {
      const input = {
        ...createValidUsagePriceInput(),
        slug: 'no_charge_api_calls',
      }

      const result = setupUsageMeterPriceInputSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.slug).toBe('no_charge_api_calls')
      }
    })

    it('accepts usage price with undefined slug (optional field)', () => {
      const input = {
        ...createValidUsagePriceInput(),
        slug: undefined,
      }

      const result = setupUsageMeterPriceInputSchema.safeParse(input)

      expect(result.success).toBe(true)
    })
  })
})

describe('usage meter isDefault validation', () => {
  // Helper function to create a minimal valid input
  const createMinimalValidInput = (): SetupPricingModelInput => ({
    name: 'Test Pricing Model',
    isDefault: false,
    features: [],
    products: [
      {
        product: {
          name: 'Test Product',
          slug: 'test-product',
          active: true,
          default: false,
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
      },
    ],
    usageMeters: [],
  })

  it('throws when multiple prices have isDefault=true for the same usage meter', () => {
    const input = createMinimalValidInput()
    input.usageMeters = [
      {
        usageMeter: {
          slug: 'api-calls',
          name: 'API Calls',
        },
        prices: [
          {
            type: PriceType.Usage,
            slug: 'api-calls-price-1',
            isDefault: true,
            unitPrice: 100,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            active: true,
          },
          {
            type: PriceType.Usage,
            slug: 'api-calls-price-2',
            isDefault: true, // Second default - should fail
            unitPrice: 200,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            active: true,
          },
        ],
      },
    ]

    expect(() => validateSetupPricingModelInput(input)).toThrow(
      'Usage meter "api-calls" has multiple prices with isDefault=true'
    )
  })

  it('accepts when exactly one price has isDefault=true for a usage meter', () => {
    const input = createMinimalValidInput()
    input.usageMeters = [
      {
        usageMeter: {
          slug: 'api-calls',
          name: 'API Calls',
        },
        prices: [
          {
            type: PriceType.Usage,
            slug: 'api-calls-price-1',
            isDefault: true,
            unitPrice: 100,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            active: true,
          },
          {
            type: PriceType.Usage,
            slug: 'api-calls-price-2',
            isDefault: false,
            unitPrice: 200,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            active: true,
          },
        ],
      },
    ]

    expect(() => validateSetupPricingModelInput(input)).not.toThrow()
  })

  it('accepts when no prices have isDefault=true for a usage meter', () => {
    const input = createMinimalValidInput()
    input.usageMeters = [
      {
        usageMeter: {
          slug: 'api-calls',
          name: 'API Calls',
        },
        prices: [
          {
            type: PriceType.Usage,
            slug: 'api-calls-price-1',
            isDefault: false,
            unitPrice: 100,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            active: true,
          },
        ],
      },
    ]

    expect(() => validateSetupPricingModelInput(input)).not.toThrow()
  })

  it('validates each usage meter independently - different meters can each have one default', () => {
    const input = createMinimalValidInput()
    input.usageMeters = [
      {
        usageMeter: {
          slug: 'api-calls',
          name: 'API Calls',
        },
        prices: [
          {
            type: PriceType.Usage,
            slug: 'api-calls-price',
            isDefault: true,
            unitPrice: 100,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            active: true,
          },
        ],
      },
      {
        usageMeter: {
          slug: 'storage',
          name: 'Storage',
        },
        prices: [
          {
            type: PriceType.Usage,
            slug: 'storage-price',
            isDefault: true, // Different meter, so this is fine
            unitPrice: 50,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            trialPeriodDays: null,
            usageEventsPerUnit: 1,
            active: true,
          },
        ],
      },
    ]

    expect(() => validateSetupPricingModelInput(input)).not.toThrow()
  })
})
