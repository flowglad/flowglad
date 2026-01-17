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
    // Usage prices belong to usage meters, not products
    it('should have at least one usage type price for each usage meter', () => {
      PRICING_MODEL_TEMPLATES.forEach((template) => {
        const { usageMeters } = template.input

        // Only validate templates that have usage meters
        if (usageMeters.length === 0) {
          return
        }

        // Each usage meter should have nested prices
        usageMeters.forEach((meter) => {
          const meterSlug = meter.usageMeter.slug
          const meterPrices = meter.prices ?? []

          expect(
            meterPrices.length,
            `Template "${template.metadata.id}" has usage meter "${meterSlug}" but no usage type prices nested under it`
          ).toBeGreaterThan(0)

          // Verify all prices are usage type
          meterPrices.forEach((price) => {
            expect(
              price.type,
              `Template "${template.metadata.id}" has non-usage price type under usage meter "${meterSlug}"`
            ).toBe(PriceType.Usage)
          })
        })
      })
    })
  })

  describe('seat_based_subscription template', () => {
    const template = getTemplateById('seat_based_subscription')!

    it('should have a resources array with a teams resource', () => {
      expect(template.input.resources).toHaveLength(1)
      expect(template.input.resources![0]).toMatchObject({
        slug: 'teams',
        name: 'Teams',
        active: true,
      })
    })

    it('should have resource features for Free and Basic tiers with correct team limits', () => {
      const resourceFeatures = template.input.features.filter(
        (f) => f.type === FeatureType.Resource
      )

      expect(resourceFeatures).toHaveLength(2)

      const freeTeams = resourceFeatures.find(
        (f) => f.slug === 'free_teams'
      )
      const basicTeams = resourceFeatures.find(
        (f) => f.slug === 'basic_teams'
      )

      expect(freeTeams).toMatchObject({
        type: FeatureType.Resource,
        slug: 'free_teams',
        resourceSlug: 'teams',
        amount: 2,
        active: true,
      })

      expect(basicTeams).toMatchObject({
        type: FeatureType.Resource,
        slug: 'basic_teams',
        resourceSlug: 'teams',
        amount: 5,
        active: true,
      })
    })

    it('should attach free_teams to Free tier', () => {
      const freeTier = template.input.products.find(
        (p) => p.product.slug === 'free_tier'
      )

      expect(freeTier!.features).toContain('free_teams')
    })

    it('should attach basic_teams to Basic tier products', () => {
      const basicMonthly = template.input.products.find(
        (p) => p.product.slug === 'basic_monthly'
      )
      const basicYearly = template.input.products.find(
        (p) => p.product.slug === 'basic_yearly'
      )

      expect(basicMonthly!.features).toContain('basic_teams')
      expect(basicYearly!.features).toContain('basic_teams')
    })

    it('should not attach resource features to Business and Enterprise tiers (unlimited teams)', () => {
      const businessMonthly = template.input.products.find(
        (p) => p.product.slug === 'business_monthly'
      )
      const businessYearly = template.input.products.find(
        (p) => p.product.slug === 'business_yearly'
      )
      const enterprise = template.input.products.find(
        (p) => p.product.slug === 'enterprise'
      )

      const resourceFeatureSlugs = ['free_teams', 'basic_teams']

      resourceFeatureSlugs.forEach((slug) => {
        expect(businessMonthly!.features).not.toContain(slug)
        expect(businessYearly!.features).not.toContain(slug)
        expect(enterprise!.features).not.toContain(slug)
      })

      // Verify they have unlimited_teams toggle feature instead
      expect(businessMonthly!.features).toContain('unlimited_teams')
      expect(businessYearly!.features).toContain('unlimited_teams')
      expect(enterprise!.features).toContain('unlimited_teams')
    })

    it('should pass validation with resource features', () => {
      expect(() =>
        validateSetupPricingModelInput(template.input)
      ).not.toThrow()
    })
  })
})
