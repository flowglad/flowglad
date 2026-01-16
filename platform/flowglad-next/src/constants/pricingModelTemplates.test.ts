import { describe, expect, it } from 'vitest'
import { FeatureType, PriceType } from '@/types'
import { validateSetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'
import {
  getTemplateById,
  PRICING_MODEL_TEMPLATES,
} from './pricingModelTemplates'

describe('Pricing Model Templates', () => {
  describe('Template Input Validation', () => {
    it('should validate all template inputs', () => {
      PRICING_MODEL_TEMPLATES.forEach((template) => {
        const validated = validateSetupPricingModelInput(
          template.input
        )
        expect(validated).toMatchObject({
          products: expect.any(Array),
        })
      })
    })
  })

  describe('Template Lookup', () => {
    it('should find all templates by their IDs', () => {
      const templateIds = [
        'usage_limit_subscription',
        'unlimited_usage_subscription',
        'ai_image_generation_subscription',
        'seat_based_subscription',
        'ai_meeting_notes_subscription',
        'ai_token_usage',
      ]

      templateIds.forEach((id) => {
        const template = getTemplateById(id)
        expect(template?.metadata.id).toBe(id)
      })
    })

    it('should return undefined for non-existent template', () => {
      const template = getTemplateById('non-existent')
      expect(template).toBeUndefined()
    })
  })

  describe('Usage Meters and Pricing', () => {
    it('should have at least one usage type price for each usage meter', () => {
      PRICING_MODEL_TEMPLATES.forEach((template) => {
        const { usageMeters, products } = template.input

        // Only validate templates that have usage meters
        if (usageMeters.length === 0) {
          return
        }

        // Get all usage meter slugs
        const usageMeterSlugs = new Set(
          usageMeters.map((meter) => meter.slug)
        )

        // Get all prices from all products
        const allPrices = products.map((product) => product.price)

        // For each usage meter, verify at least one usage type price exists
        usageMeterSlugs.forEach((meterSlug) => {
          const usagePricesForMeter = allPrices.filter(
            (price) =>
              price.type === PriceType.Usage &&
              'usageMeterSlug' in price &&
              price.usageMeterSlug === meterSlug
          )

          expect(
            usagePricesForMeter.length,
            `Template "${template.metadata.id}" has usage meter "${meterSlug}" but no usage type prices associated with it`
          ).toBeGreaterThan(0)
        })
      })
    })
  })

  describe('seat_based_subscription template', () => {
    const template = getTemplateById('seat_based_subscription')!

    it('should have a resources array with a seats resource', () => {
      expect(template.input.resources).toHaveLength(1)
      expect(template.input.resources![0]).toMatchObject({
        slug: 'seats',
        name: 'Seats',
        active: true,
      })
    })

    it('should have resource features for Basic, Business, and Enterprise tiers', () => {
      const resourceFeatures = template.input.features.filter(
        (f) => f.type === FeatureType.Resource
      )

      expect(resourceFeatures).toHaveLength(3)

      const slugs = resourceFeatures.map((f) => f.slug)
      expect(slugs).toContain('basic_seats')
      expect(slugs).toContain('business_seats')
      expect(slugs).toContain('enterprise_seats')

      resourceFeatures.forEach((feature) => {
        expect(feature).toMatchObject({
          type: FeatureType.Resource,
          resourceSlug: 'seats',
          active: true,
        })
        expect(
          'amount' in feature && typeof feature.amount === 'number'
        ).toBe(true)
      })
    })

    it('should attach resource features to paid tier products', () => {
      const basicMonthly = template.input.products.find(
        (p) => p.product.slug === 'basic_monthly'
      )
      const basicYearly = template.input.products.find(
        (p) => p.product.slug === 'basic_yearly'
      )
      const businessMonthly = template.input.products.find(
        (p) => p.product.slug === 'business_monthly'
      )
      const businessYearly = template.input.products.find(
        (p) => p.product.slug === 'business_yearly'
      )
      const enterprise = template.input.products.find(
        (p) => p.product.slug === 'enterprise'
      )

      expect(basicMonthly!.features).toContain('basic_seats')
      expect(basicYearly!.features).toContain('basic_seats')
      expect(businessMonthly!.features).toContain('business_seats')
      expect(businessYearly!.features).toContain('business_seats')
      expect(enterprise!.features).toContain('enterprise_seats')
    })

    it('should not attach resource features to Free tier', () => {
      const freeTier = template.input.products.find(
        (p) => p.product.slug === 'free_tier'
      )

      const resourceFeatureSlugs = [
        'basic_seats',
        'business_seats',
        'enterprise_seats',
      ]

      resourceFeatureSlugs.forEach((slug) => {
        expect(freeTier!.features).not.toContain(slug)
      })
    })

    it('should pass validation with resource features', () => {
      expect(() =>
        validateSetupPricingModelInput(template.input)
      ).not.toThrow()
    })
  })
})
