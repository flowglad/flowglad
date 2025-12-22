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
        prices: [
          {
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
        ],
        features: [],
      },
    ],
    usageMeters: [],
  })

  it('should throw if a usage meter has no associated usage price', () => {
    const templateWithUsageMeter = PRICING_MODEL_TEMPLATES.find(
      (template) => template.input.usageMeters.length > 0
    )

    if (!templateWithUsageMeter) {
      throw new Error(
        'Expected at least one template with a usage meter for this test'
      )
    }

    const invalidInput = JSON.parse(
      JSON.stringify(templateWithUsageMeter.input)
    )

    invalidInput.products = invalidInput.products.map(
      (product: any) => {
        const nonUsagePrices = product.prices.filter(
          (price: any) => price.type !== PriceType.Usage
        )
        // Ensure product still has at least one active default price
        if (nonUsagePrices.length === 0) {
          return {
            ...product,
            prices: [
              {
                type: PriceType.Subscription,
                slug: 'dummy-price',
                isDefault: true,
                unitPrice: 0,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                usageMeterId: null,
                usageEventsPerUnit: null,
                active: true,
              },
            ],
          }
        }
        // Ensure at least one remaining price is active and default
        const hasActiveDefault = nonUsagePrices.some(
          (p: any) => p.active && p.isDefault
        )
        if (!hasActiveDefault && nonUsagePrices.length > 0) {
          nonUsagePrices[0].active = true
          nonUsagePrices[0].isDefault = true
        }
        return {
          ...product,
          prices: nonUsagePrices,
        }
      }
    )

    expect(() =>
      validateSetupPricingModelInput(invalidInput)
    ).toThrow(
      /Usage meter with slug .+ must have at least one usage price associated with it/
    )
  })

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

    it('should accept when UsageCreditGrant feature references an existing usage meter', () => {
      const input = createMinimalValidInput()
      input.usageMeters = [
        {
          slug: 'test-meter',
          name: 'Test Meter',
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
      // Add a usage price so the meter is valid
      input.products[0].prices = [
        {
          type: PriceType.Usage,
          slug: 'usage-price',
          isDefault: true,
          unitPrice: 100,
          usageMeterSlug: 'test-meter',
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          trialPeriodDays: null,
          usageEventsPerUnit: 1,
          active: true,
        },
      ]

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })
  })

  describe('price slug requirement', () => {
    it('should throw when a price is missing a slug', () => {
      const input = createMinimalValidInput()
      input.products[0].prices = [
        {
          type: PriceType.Subscription,
          isDefault: true,
          unitPrice: 1000,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          usageMeterId: null,
          usageEventsPerUnit: null,
          active: true,
          // slug is intentionally omitted to test runtime validation
        },
      ]

      expect(() => validateSetupPricingModelInput(input)).toThrow(
        /Price slug is required/
      )
    })

    it('should accept when all prices have slugs', () => {
      const input = createMinimalValidInput()
      input.products[0].prices = [
        {
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
      ]

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })
  })

  describe('usage price usageMeterSlug requirement', () => {
    it('should throw when a usage price is missing usageMeterSlug', () => {
      const input = createMinimalValidInput()
      input.usageMeters = [
        {
          slug: 'test-meter',
          name: 'Test Meter',
        },
      ]
      input.products[0].prices = [
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
        } as any,
      ]

      // Schema validation will catch this first, so we expect a ZodError
      expect(() => validateSetupPricingModelInput(input)).toThrow()
    })

    it('should accept when usage prices have usageMeterSlug', () => {
      const input = createMinimalValidInput()
      input.usageMeters = [
        {
          slug: 'test-meter',
          name: 'Test Meter',
        },
      ]
      input.products[0].prices = [
        {
          type: PriceType.Usage,
          slug: 'usage-price',
          isDefault: true,
          unitPrice: 100,
          usageMeterSlug: 'test-meter',
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          trialPeriodDays: null,
          usageEventsPerUnit: 1,
          active: true,
        },
      ]

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })
  })

  describe('usage meter existence for usage prices', () => {
    it('should throw when a usage price references a non-existent usage meter', () => {
      const input = createMinimalValidInput()
      input.products[0].prices = [
        {
          type: PriceType.Usage,
          slug: 'usage-price',
          isDefault: true,
          unitPrice: 100,
          usageMeterSlug: 'non-existent-meter',
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          trialPeriodDays: null,
          usageEventsPerUnit: 1,
          active: true,
        },
      ]

      expect(() => validateSetupPricingModelInput(input)).toThrow(
        'Usage meter with slug non-existent-meter does not exist'
      )
    })

    it('should accept when usage prices reference existing usage meters', () => {
      const input = createMinimalValidInput()
      input.usageMeters = [
        {
          slug: 'test-meter',
          name: 'Test Meter',
        },
      ]
      input.products[0].prices = [
        {
          type: PriceType.Usage,
          slug: 'usage-price',
          isDefault: true,
          unitPrice: 100,
          usageMeterSlug: 'test-meter',
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          trialPeriodDays: null,
          usageEventsPerUnit: 1,
          active: true,
        },
      ]

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })
  })

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
          prices: [
            {
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
          ],
          features: [],
        },
        {
          product: {
            name: 'Product 2',
            slug: 'product-2',
            active: true,
            default: false,
          },
          prices: [
            {
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
          ],
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
          prices: [
            {
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
          ],
          features: [],
        },
        {
          product: {
            name: 'Product 2',
            slug: 'product-2',
            active: true,
            default: false,
          },
          prices: [
            {
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
          ],
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

    it('should accept UsageCreditGrant features with required fields', () => {
      const input = createMinimalValidInput()
      input.usageMeters = [
        {
          slug: 'test-meter',
          name: 'Test Meter',
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
      // Add a usage price so the meter is valid
      input.products[0].prices = [
        {
          type: PriceType.Usage,
          slug: 'usage-price',
          isDefault: true,
          unitPrice: 100,
          usageMeterSlug: 'test-meter',
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          trialPeriodDays: null,
          usageEventsPerUnit: 1,
          active: true,
        },
      ]

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })
  })

  describe('price type validation', () => {
    it('should accept subscription prices with required fields', () => {
      const input = createMinimalValidInput()
      input.products[0].prices = [
        {
          type: PriceType.Subscription,
          slug: 'subscription-price',
          isDefault: true,
          unitPrice: 1000,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          usageMeterId: null,
          usageEventsPerUnit: null,
          active: true,
        },
      ]

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })

    it('should accept single payment prices with required fields', () => {
      const input = createMinimalValidInput()
      input.products[0].prices = [
        {
          type: PriceType.SinglePayment,
          slug: 'single-payment-price',
          isDefault: true,
          unitPrice: 5000,
          active: true,
        },
      ]

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })

    it('should accept usage prices with required fields', () => {
      const input = createMinimalValidInput()
      input.usageMeters = [
        {
          slug: 'test-meter',
          name: 'Test Meter',
        },
      ]
      input.products[0].prices = [
        {
          type: PriceType.Usage,
          slug: 'usage-price',
          isDefault: true,
          unitPrice: 100,
          usageMeterSlug: 'test-meter',
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          trialPeriodDays: null,
          usageEventsPerUnit: 1,
          active: true,
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
      input.products[0].prices = [
        {
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
        },
      ]

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe(
        'Invalid option: expected one of "USD"|"AED"|"AFN"|"ALL"|"AMD"|"ANG"|"AOA"|"ARS"|"AUD"|"AWG"|"AZN"|"BAM"|"BBD"|"BDT"|"BGN"|"BIF"|"BMD"|"BND"|"BOB"|"BRL"|"BSD"|"BWP"|"BYN"|"BZD"|"CAD"|"CDF"|"CHF"|"CLP"|"CNY"|"COP"|"CRC"|"CVE"|"CZK"|"DJF"|"DKK"|"DOP"|"DZD"|"EGP"|"ETB"|"EUR"|"FJD"|"FKP"|"GBP"|"GEL"|"GIP"|"GMD"|"GNF"|"GTQ"|"GYD"|"HKD"|"HNL"|"HTG"|"HUF"|"IDR"|"ILS"|"INR"|"ISK"|"JMD"|"JPY"|"KES"|"KGS"|"KHR"|"KMF"|"KRW"|"KYD"|"KZT"|"LAK"|"LBP"|"LKR"|"LRD"|"LSL"|"MAD"|"MDL"|"MGA"|"MKD"|"MMK"|"MNT"|"MOP"|"MUR"|"MVR"|"MWK"|"MXN"|"MYR"|"MZN"|"NAD"|"NGN"|"NIO"|"NOK"|"NPR"|"NZD"|"PAB"|"PEN"|"PGK"|"PHP"|"PKR"|"PLN"|"PYG"|"QAR"|"RON"|"RSD"|"RUB"|"RWF"|"SAR"|"SBD"|"SCR"|"SEK"|"SGD"|"SHP"|"SLE"|"SOS"|"SRD"|"STD"|"SZL"|"THB"|"TJS"|"TOP"|"TRY"|"TTD"|"TWD"|"TZS"|"UAH"|"UGX"|"UYU"|"UZS"|"VND"|"VUV"|"WST"|"XAF"|"XCD"|"XOF"|"XPF"|"YER"|"ZAR"|"ZMW"'
      )
    })

    it('should accept valid currency codes when provided', () => {
      const input = createMinimalValidInput()
      input.products[0].prices = [
        {
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
        },
      ]

      expect(() =>
        validateSetupPricingModelInput(input)
      ).not.toThrow()
    })
  })
})
