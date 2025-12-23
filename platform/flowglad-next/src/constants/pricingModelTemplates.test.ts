import { describe, expect, it } from 'vitest'
import { PriceType } from '@/types'
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
        expect(validated).toBeDefined()
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
        expect(template).toBeDefined()
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
})
