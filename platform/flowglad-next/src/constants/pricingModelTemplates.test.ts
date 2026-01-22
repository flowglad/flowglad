import { describe, expect, it } from 'bun:test'
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

    it('should have a resources array with only seats resource', () => {
      expect(template.input.resources).toHaveLength(1)
      expect(template.input.resources![0]).toMatchObject({
        slug: 'seats',
        name: 'Seats',
        active: true,
      })
    })

    it('should have seat resource features for each paid tier (amount: 1)', () => {
      const resourceFeatures = template.input.features.filter(
        (f) => f.type === FeatureType.Resource
      )

      // 3 seat features (basic_seats, business_seats, enterprise_seats)
      expect(resourceFeatures).toHaveLength(3)

      const basicSeats = resourceFeatures.find(
        (f) => f.slug === 'basic_seats'
      )
      const businessSeats = resourceFeatures.find(
        (f) => f.slug === 'business_seats'
      )
      const enterpriseSeats = resourceFeatures.find(
        (f) => f.slug === 'enterprise_seats'
      )

      expect(basicSeats).toMatchObject({
        type: FeatureType.Resource,
        slug: 'basic_seats',
        resourceSlug: 'seats',
        amount: 1,
        active: true,
      })

      expect(businessSeats).toMatchObject({
        type: FeatureType.Resource,
        slug: 'business_seats',
        resourceSlug: 'seats',
        amount: 1,
        active: true,
      })

      expect(enterpriseSeats).toMatchObject({
        type: FeatureType.Resource,
        slug: 'enterprise_seats',
        resourceSlug: 'seats',
        amount: 1,
        active: true,
      })
    })

    it('should not attach seat features to Free tier', () => {
      const freeTier = template.input.products.find(
        (p) => p.product.slug === 'free_tier'
      )

      expect(freeTier!.features).not.toContain('basic_seats')
      expect(freeTier!.features).not.toContain('business_seats')
      expect(freeTier!.features).not.toContain('enterprise_seats')
    })

    it('should attach basic_seats to Basic tier products', () => {
      const basicMonthly = template.input.products.find(
        (p) => p.product.slug === 'basic_monthly'
      )
      const basicYearly = template.input.products.find(
        (p) => p.product.slug === 'basic_yearly'
      )

      expect(basicMonthly!.features).toContain('basic_seats')
      expect(basicYearly!.features).toContain('basic_seats')
    })

    it('should attach appropriate seat features to Business and Enterprise tiers', () => {
      const businessMonthly = template.input.products.find(
        (p) => p.product.slug === 'business_monthly'
      )
      const businessYearly = template.input.products.find(
        (p) => p.product.slug === 'business_yearly'
      )
      const enterprise = template.input.products.find(
        (p) => p.product.slug === 'enterprise'
      )

      expect(businessMonthly!.features).toContain('business_seats')
      expect(businessYearly!.features).toContain('business_seats')
      expect(enterprise!.features).toContain('enterprise_seats')
    })

    it('should pass validation with resource features', () => {
      expect(() =>
        validateSetupPricingModelInput(template.input)
      ).not.toThrow()
    })
  })

  describe('ai_meeting_notes_subscription template', () => {
    const template = getTemplateById('ai_meeting_notes_subscription')!

    it('should have a resources array with a users resource', () => {
      expect(template.input.resources).toHaveLength(1)
      expect(template.input.resources![0]).toMatchObject({
        slug: 'users',
        name: 'Users',
        active: true,
      })
    })

    it('should have resource features for Basic, Business, and Enterprise tiers with 1 user each', () => {
      const resourceFeatures = template.input.features.filter(
        (f) => f.type === FeatureType.Resource
      )

      expect(resourceFeatures).toHaveLength(3)

      const basicUsers = resourceFeatures.find(
        (f) => f.slug === 'basic_users'
      )
      const businessUsers = resourceFeatures.find(
        (f) => f.slug === 'business_users'
      )
      const enterpriseUsers = resourceFeatures.find(
        (f) => f.slug === 'enterprise_users'
      )

      expect(basicUsers).toMatchObject({
        type: FeatureType.Resource,
        slug: 'basic_users',
        resourceSlug: 'users',
        amount: 1,
        active: true,
      })

      expect(businessUsers).toMatchObject({
        type: FeatureType.Resource,
        slug: 'business_users',
        resourceSlug: 'users',
        amount: 1,
        active: true,
      })

      expect(enterpriseUsers).toMatchObject({
        type: FeatureType.Resource,
        slug: 'enterprise_users',
        resourceSlug: 'users',
        amount: 1,
        active: true,
      })
    })

    it('should attach basic_users to Basic tier', () => {
      const basicTier = template.input.products.find(
        (p) => p.product.slug === 'basic'
      )

      expect(basicTier!.features).toContain('basic_users')
    })

    it('should attach business_users to Business tier', () => {
      const businessTier = template.input.products.find(
        (p) => p.product.slug === 'business'
      )

      expect(businessTier!.features).toContain('business_users')
    })

    it('should attach enterprise_users to Enterprise tier', () => {
      const enterpriseTier = template.input.products.find(
        (p) => p.product.slug === 'enterprise'
      )

      expect(enterpriseTier!.features).toContain('enterprise_users')
    })

    it('should pass validation with resource features', () => {
      expect(() =>
        validateSetupPricingModelInput(template.input)
      ).not.toThrow()
    })
  })
})
